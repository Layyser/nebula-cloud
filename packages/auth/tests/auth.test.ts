import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createCloudAuth,
  createFilesystemEmailSender,
  emailVerificationEmail,
  migrateCloudAuthSchema,
  type TransactionalEmailMessage,
  type TransactionalEmailSender,
} from '../src'

class MemoryEmailSender implements TransactionalEmailSender {
  readonly messages: TransactionalEmailMessage[] = []

  async send(message: TransactionalEmailMessage) {
    this.messages.push(message)
    return { providerMessageId: `memory:${this.messages.length}` }
  }
}

test('Better Auth owns the core and organization SQLite schema', async () => {
  const database = new Database(':memory:', { strict: true })
  try {
    const auth = createCloudAuth({
      database,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:7790',
    })
    await migrateCloudAuthSchema(auth)

    const tables = new Set(database.query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all().map(table => table.name))

    for (const table of [
      'user',
      'session',
      'account',
      'verification',
      'organization',
      'member',
      'invitation',
    ]) {
      expect(tables.has(table)).toBe(true)
    }
  } finally {
    database.close()
  }
})

test('rejects a weak Better Auth secret', () => {
  const database = new Database(':memory:')
  try {
    expect(() => createCloudAuth({
      database,
      secret: 'too-short',
      baseURL: 'http://localhost:7790',
    })).toThrow('at least 32 characters')
  } finally {
    database.close()
  }
})

test('requires a sender when verification is enforced', () => {
  const database = new Database(':memory:')
  try {
    expect(() => createCloudAuth({
      database,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:7790',
      requireEmailVerification: true,
    })).toThrow('requires a transactional email sender')
  } finally {
    database.close()
  }
})

test('sends verification and non-enumerating reset messages through the transport', async () => {
  const database = new Database(':memory:', { strict: true })
  const emailSender = new MemoryEmailSender()
  try {
    const auth = createCloudAuth({
      database,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:7790/api/auth',
      appBaseURL: 'http://localhost:5173',
      trustedOrigins: ['http://localhost:5173'],
      emailSender,
      requireEmailVerification: true,
    })
    await migrateCloudAuthSchema(auth)

    const signUp = await auth.handler(new Request(
      'http://localhost:7790/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          name: 'George <Admin>',
          email: 'george@example.test',
          password: 'secure-password',
          callbackURL: 'http://localhost:5173/app',
        }),
      },
    ))
    expect(signUp.status).toBe(200)
    expect(signUp.headers.get('set-cookie')).toBeNull()
    expect(emailSender.messages).toHaveLength(1)
    expect(emailSender.messages[0]).toMatchObject({
      kind: 'email-verification',
      to: 'george@example.test',
      subject: 'Verify your Nubols email',
    })
    expect(emailSender.messages[0]!.text).toContain('/verify-email?token=')
    expect(emailSender.messages[0]!.html).toContain('George &lt;Admin&gt;')

    const existingReset = await auth.handler(new Request(
      'http://localhost:7790/api/auth/request-password-reset',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          email: 'george@example.test',
          redirectTo: 'http://localhost:5173/reset-password',
        }),
      },
    ))
    expect(existingReset.status).toBe(200)
    expect(emailSender.messages.at(-1)).toMatchObject({
      kind: 'password-reset',
      to: 'george@example.test',
    })

    const beforeMissingReset = emailSender.messages.length
    const missingReset = await auth.handler(new Request(
      'http://localhost:7790/api/auth/request-password-reset',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          email: 'missing@example.test',
          redirectTo: 'http://localhost:5173/reset-password',
        }),
      },
    ))
    expect(missingReset.status).toBe(200)
    expect(await missingReset.json()).toEqual({
      status: true,
      message: 'If this email exists in our system, check your email for the reset link',
    })
    expect(emailSender.messages).toHaveLength(beforeMissingReset)
  } finally {
    database.close()
  }
})

test('filesystem transport writes private local outbox messages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nubols-email-'))
  try {
    const sender = createFilesystemEmailSender({ directory })
    const receipt = await sender.send(emailVerificationEmail({
      email: 'local@example.test',
      name: 'Local',
      url: 'http://localhost:7790/api/auth/verify-email?token=secret',
    }))
    expect(receipt.providerMessageId).toStartWith('filesystem:')
    const files = await readdir(directory)
    expect(files).toHaveLength(1)
    const message = JSON.parse(await readFile(join(directory, files[0]!), 'utf8'))
    expect(message.kind).toBe('email-verification')
    expect(message.to).toBe('local@example.test')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('supports an email session and organization lifecycle', async () => {
  const database = new Database(':memory:', { strict: true })
  try {
    const auth = createCloudAuth({
      database,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:7790',
      trustedOrigins: ['http://localhost:5173'],
    })
    await migrateCloudAuthSchema(auth)

    const signUp = await auth.handler(new Request(
      'http://localhost:7790/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          name: 'George',
          email: 'george@example.test',
          password: 'secure-password',
        }),
      },
    ))
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie')?.split(';', 1)[0]
    expect(cookie).toBeTruthy()

    const session = await auth.handler(new Request(
      'http://localhost:7790/api/auth/get-session',
      { headers: { cookie: cookie! } },
    ))
    expect(session.status).toBe(200)
    expect((await session.json()).user.email).toBe('george@example.test')

    const createOrganization = await auth.handler(new Request(
      'http://localhost:7790/api/auth/organization/create',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookie!,
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({ name: 'Nebula', slug: 'nebula' }),
      },
    ))
    expect(createOrganization.status).toBe(200)
    const createdOrganization = await createOrganization.json() as {
      id: string
      slug: string
    }
    expect(createdOrganization.slug).toBe('nebula')

    const organizations = await auth.handler(new Request(
      'http://localhost:7790/api/auth/organization/list',
      { headers: { cookie: cookie! } },
    ))
    expect(organizations.status).toBe(200)
    expect((await organizations.json())[0].slug).toBe('nebula')

    const selectOrganization = await auth.handler(new Request(
      'http://localhost:7790/api/auth/organization/set-active',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookie!,
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          organizationId: createdOrganization.id,
        }),
      },
    ))
    expect(selectOrganization.status).toBe(200)
    const activeSession = await auth.api.getSession({
      headers: new Headers({ cookie: cookie! }),
    })
    expect(activeSession?.session.activeOrganizationId).toBe(
      createdOrganization.id,
    )

    const signOut = await auth.handler(new Request(
      'http://localhost:7790/api/auth/sign-out',
      {
        method: 'POST',
        headers: {
          cookie: cookie!,
          origin: 'http://localhost:5173',
        },
      },
    ))
    expect(signOut.status).toBe(200)
    expect(await auth.api.getSession({
      headers: new Headers({ cookie: cookie! }),
    })).toBeNull()

    const signIn = await auth.handler(new Request(
      'http://localhost:7790/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          email: 'george@example.test',
          password: 'secure-password',
        }),
      },
    ))
    expect(signIn.status).toBe(200)
    expect(signIn.headers.get('set-cookie')).toContain('better-auth.session_token')
  } finally {
    database.close()
  }
})

test('rejects an expired Better Auth session', async () => {
  const database = new Database(':memory:', { strict: true })
  try {
    const auth = createCloudAuth({
      database,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:7790',
      trustedOrigins: ['http://localhost:5173'],
    })
    await migrateCloudAuthSchema(auth)

    const signUp = await auth.handler(new Request(
      'http://localhost:7790/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          name: 'Expired User',
          email: 'expired@example.test',
          password: 'secure-password',
        }),
      },
    ))
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie')?.split(';', 1)[0]
    expect(cookie).toBeTruthy()

    database.prepare('UPDATE session SET expiresAt = 0').run()
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookie! }),
    })
    expect(session).toBeNull()
  } finally {
    database.close()
  }
})
