import type { Database } from 'bun:sqlite'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { getMigrations } from 'better-auth/db/migration'
import { organization } from 'better-auth/plugins'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export type TransactionalEmailKind =
  | 'email-verification'
  | 'password-reset'
  | 'organization-invitation'
  | 'contact-notification'

export interface TransactionalEmailMessage {
  kind: TransactionalEmailKind
  to: string
  subject: string
  text: string
  html: string
  replyTo?: string
}

export interface TransactionalEmailReceipt {
  providerMessageId: string
}

export interface TransactionalEmailSender {
  send(message: TransactionalEmailMessage): Promise<TransactionalEmailReceipt>
}

export interface FilesystemEmailSenderOptions {
  directory: string
}

export interface ResendEmailSenderOptions {
  apiKey: string
  from: string
  endpoint?: string
  timeoutMs?: number
  fetch?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>
}

/**
 * Local-only transport. Each message is written to a private JSON file so
 * verification, reset, and invitation flows can be exercised without an email
 * provider. Production deployments must inject a real transport instead.
 */
export function createFilesystemEmailSender({
  directory,
}: FilesystemEmailSenderOptions): TransactionalEmailSender {
  const targetDirectory = directory.trim()
  if (!targetDirectory) {
    throw new Error('Filesystem email outbox directory is required')
  }

  return {
    async send(message) {
      const id = randomUUID()
      await mkdir(targetDirectory, { recursive: true, mode: 0o700 })
      const filename = `${new Date().toISOString().replaceAll(':', '-')}-${id}.json`
      await writeFile(
        join(targetDirectory, filename),
        `${JSON.stringify({
          id,
          sentAt: new Date().toISOString(),
          ...message,
        }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      )
      return { providerMessageId: `filesystem:${id}` }
    },
  }
}

export function createResendEmailSender({
  apiKey,
  from,
  endpoint = 'https://api.resend.com/emails',
  timeoutMs = 10000,
  fetch: fetchImplementation = globalThis.fetch,
}: ResendEmailSenderOptions): TransactionalEmailSender {
  const token = apiKey.trim()
  const sender = from.trim()
  if (!token) throw new Error('Resend API key is required')
  if (!sender) throw new Error('Transactional email from address is required')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    throw new Error('Transactional email timeout must be between 1000 and 60000 milliseconds')
  }
  const target = new URL(endpoint)
  if (target.protocol !== 'https:' && target.hostname !== 'localhost') {
    throw new Error('Transactional email endpoint must use HTTPS')
  }

  return {
    async send(message) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImplementation(target, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: sender,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
            tags: [{ name: 'kind', value: message.kind }],
          }),
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Transactional email provider rejected the message (${response.status})`)
        }
        const result = await response.json() as { id?: unknown }
        if (typeof result.id !== 'string' || !result.id.trim()) {
          throw new Error('Transactional email provider returned no message ID')
        }
        return { providerMessageId: result.id }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Transactional email provider timed out')
        }
        throw error
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

export interface CreateCloudAuthOptions {
  database: Database
  secret: string
  baseURL: string
  appBaseURL?: string
  trustedOrigins?: string[]
  emailSender?: TransactionalEmailSender
  requireEmailVerification?: boolean
  allowedSignUpEmails?: readonly string[]
}

export function createCloudAuth({
  database,
  secret,
  baseURL,
  appBaseURL = baseURL,
  trustedOrigins = [],
  emailSender,
  requireEmailVerification = false,
  allowedSignUpEmails,
}: CreateCloudAuthOptions) {
  if (secret.trim().length < 32) {
    throw new Error('Better Auth secret must contain at least 32 characters')
  }
  const publicAppURL = normalizeBaseURL(appBaseURL)
  if (requireEmailVerification && !emailSender) {
    throw new Error('Email verification requires a transactional email sender')
  }
  const signUpAllowlist = allowedSignUpEmails
    ? new Set(allowedSignUpEmails.map(email => email.trim().toLowerCase()))
    : null
  if (signUpAllowlist?.has('')) {
    throw new Error('Allowed sign-up emails cannot contain an empty address')
  }

  return betterAuth({
    database,
    secret,
    baseURL,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification,
      revokeSessionsOnPasswordReset: true,
      ...(emailSender
        ? {
            sendResetPassword: async ({ user, url }: {
              user: { email: string; name: string }
              url: string
            }) => {
              await emailSender.send(passwordResetEmail({
                email: user.email,
                name: user.name,
                url,
              }))
            },
          }
        : {}),
    },
    ...(emailSender
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }: {
              user: { email: string; name: string }
              url: string
            }) => {
              await emailSender.send(emailVerificationEmail({
                email: user.email,
                name: user.name,
                url,
              }))
            },
          },
        }
      : {}),
    advanced: {
      database: {
        generateId: 'uuid',
      },
    },
    ...(signUpAllowlist
      ? {
          hooks: {
            before: createAuthMiddleware(async context => {
              if (context.path !== '/sign-up/email') return
              const email = typeof context.body?.email === 'string'
                ? context.body.email.trim().toLowerCase()
                : ''
              if (!signUpAllowlist.has(email)) {
                throw APIError.from('FORBIDDEN', {
                  code: 'SIGN_UP_RESTRICTED',
                  message: 'Account creation is currently restricted.',
                })
              }
            }),
          },
        }
      : {}),
    plugins: [
      organization({
        requireEmailVerificationOnInvitation: true,
        ...(emailSender
          ? {
              sendInvitationEmail: async ({
                id,
                email,
                organization: invitedOrganization,
                inviter,
              }) => {
                const url = new URL('/invite', publicAppURL)
                url.searchParams.set('id', id)
                await emailSender.send(organizationInvitationEmail({
                  email,
                  organizationName: invitedOrganization.name,
                  inviterName: inviter.user.name,
                  url: url.toString(),
                }))
              },
            }
          : {}),
      }),
    ],
  })
}

function normalizeBaseURL(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Public application URL must use HTTP or HTTPS')
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function escapeHTML(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function emailDocument(input: {
  preview: string
  heading: string
  body: string
  action: string
  url: string
}): string {
  const preview = escapeHTML(input.preview)
  const heading = escapeHTML(input.heading)
  const body = escapeHTML(input.body)
  const action = escapeHTML(input.action)
  const url = escapeHTML(input.url)
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#111;color:#f5f5f5;font-family:Arial,sans-serif">
    <span style="display:none;max-height:0;overflow:hidden">${preview}</span>
    <main style="max-width:560px;margin:0 auto;padding:48px 24px">
      <p style="font-size:14px;letter-spacing:.08em;color:#aaa">NUBOLS</p>
      <h1 style="font-size:28px;line-height:1.2">${heading}</h1>
      <p style="font-size:16px;line-height:1.6;color:#ccc">${body}</p>
      <p style="margin:32px 0">
        <a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#fff;color:#111;text-decoration:none;font-weight:600">${action}</a>
      </p>
      <p style="font-size:12px;line-height:1.5;color:#888">If the button does not work, open this URL:<br><a href="${url}" style="color:#bbb;word-break:break-all">${url}</a></p>
    </main>
  </body>
</html>`
}

export function emailVerificationEmail(input: {
  email: string
  name: string
  url: string
}): TransactionalEmailMessage {
  const name = input.name.trim() || 'there'
  return {
    kind: 'email-verification',
    to: input.email,
    subject: 'Verify your Nubols email',
    text: `Hi ${name},\n\nVerify your email to finish setting up Nubols:\n${input.url}\n\nIf you did not create this account, ignore this message.`,
    html: emailDocument({
      preview: 'Verify your Nubols email',
      heading: `Welcome, ${name}.`,
      body: 'Verify your email to finish setting up your Nubols account.',
      action: 'Verify email',
      url: input.url,
    }),
  }
}

export function passwordResetEmail(input: {
  email: string
  name: string
  url: string
}): TransactionalEmailMessage {
  const name = input.name.trim() || 'there'
  return {
    kind: 'password-reset',
    to: input.email,
    subject: 'Reset your Nubols password',
    text: `Hi ${name},\n\nReset your Nubols password using this link:\n${input.url}\n\nIf you did not request this, ignore this message.`,
    html: emailDocument({
      preview: 'Reset your Nubols password',
      heading: 'Reset your password.',
      body: 'Use the secure link below to choose a new Nubols password.',
      action: 'Reset password',
      url: input.url,
    }),
  }
}

export function organizationInvitationEmail(input: {
  email: string
  organizationName: string
  inviterName: string
  url: string
}): TransactionalEmailMessage {
  return {
    kind: 'organization-invitation',
    to: input.email,
    subject: `Join ${input.organizationName} on Nubols`,
    text: `${input.inviterName} invited you to join ${input.organizationName} on Nubols.\n\nAccept the invitation:\n${input.url}`,
    html: emailDocument({
      preview: `Join ${input.organizationName} on Nubols`,
      heading: `Join ${input.organizationName}.`,
      body: `${input.inviterName} invited you to their Nubols organization. Sign in with this email address to accept.`,
      action: 'Accept invitation',
      url: input.url,
    }),
  }
}

export function contactNotificationEmail(input: {
  to: string
  name: string
  email: string
  organization?: string | null
  topic: string
  message: string
  requestId: string
}): TransactionalEmailMessage {
  const organization = input.organization?.trim() || 'Not provided'
  const text = [
    `New Nubols ${input.topic} contact request`,
    '',
    `Request: ${input.requestId}`,
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Organization: ${organization}`,
    `Topic: ${input.topic}`,
    '',
    input.message,
  ].join('\n')
  const htmlMessage = escapeHTML(input.message).replaceAll('\n', '<br>')
  return {
    kind: 'contact-notification',
    to: input.to,
    replyTo: input.email,
    subject: `[Nubols contact] ${input.topic}: ${input.organization?.trim() || input.name}`,
    text,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#111;color:#f5f5f5;font-family:Arial,sans-serif">
    <main style="max-width:640px;margin:0 auto;padding:40px 24px">
      <p style="font-size:14px;letter-spacing:.08em;color:#aaa">NUBOLS CONTACT</p>
      <h1 style="font-size:24px;line-height:1.2">${escapeHTML(input.topic)}</h1>
      <dl style="font-size:14px;line-height:1.7;color:#ccc">
        <dt style="color:#888">Request</dt><dd>${escapeHTML(input.requestId)}</dd>
        <dt style="color:#888">Name</dt><dd>${escapeHTML(input.name)}</dd>
        <dt style="color:#888">Email</dt><dd>${escapeHTML(input.email)}</dd>
        <dt style="color:#888">Organization</dt><dd>${escapeHTML(organization)}</dd>
      </dl>
      <p style="margin-top:28px;font-size:15px;line-height:1.7;color:#ddd">${htmlMessage}</p>
    </main>
  </body>
</html>`,
  }
}

export type CloudAuth = ReturnType<typeof createCloudAuth>

export async function migrateCloudAuthSchema(auth: CloudAuth): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
}
