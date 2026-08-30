import type { Database } from 'bun:sqlite'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { projectEmailDeliveryStatus, type EmailDeliveryStatus } from '@nebula-cloud/database'

const maximumWebhookAgeSeconds = 5 * 60

export class ResendWebhookVerificationError extends Error {
  readonly code = 'resend_webhook_verification_failed'

  constructor(message = 'Resend webhook verification failed') {
    super(message)
    this.name = 'ResendWebhookVerificationError'
  }
}

export class ResendWebhookProcessor {
  readonly #database: Database
  readonly #secret: Buffer
  readonly #now: () => number

  constructor(input: { database: Database; webhookSecret: string; now?: () => number }) {
    this.#database = input.database
    const encoded = input.webhookSecret.trim().replace(/^whsec_/, '')
    try {
      this.#secret = Buffer.from(encoded, 'base64')
    } catch {
      throw new Error('Resend webhook secret is invalid')
    }
    if (this.#secret.length < 16) throw new Error('Resend webhook secret is invalid')
    this.#now = input.now ?? Date.now
  }

  process(rawBody: Uint8Array, headers: Headers): { received: true; projected: boolean } {
    const webhookId = headers.get('svix-id')?.trim() ?? ''
    const timestampText = headers.get('svix-timestamp')?.trim() ?? ''
    const signatures = headers.get('svix-signature')?.trim() ?? ''
    const timestamp = Number(timestampText)
    if (
      !webhookId
      || !Number.isSafeInteger(timestamp)
      || Math.abs(Math.floor(this.#now() / 1000) - timestamp) > maximumWebhookAgeSeconds
    ) throw new ResendWebhookVerificationError()
    const signed = `${webhookId}.${timestampText}.${Buffer.from(rawBody).toString('utf8')}`
    const expected = createHmac('sha256', this.#secret).update(signed).digest()
    const verified = signatures.split(' ').some(signature => {
      const [version, encoded] = signature.split(',', 2)
      if (version !== 'v1' || !encoded) return false
      const candidate = Buffer.from(encoded, 'base64')
      return candidate.length === expected.length && timingSafeEqual(candidate, expected)
    })
    if (!verified) throw new ResendWebhookVerificationError()

    let payload: unknown
    try {
      payload = JSON.parse(Buffer.from(rawBody).toString('utf8'))
    } catch {
      throw new ResendWebhookVerificationError('Resend webhook body is invalid')
    }
    if (!payload || typeof payload !== 'object') return { received: true, projected: false }
    const event = payload as { type?: unknown; data?: { email_id?: unknown } }
    const status = resendStatus(event.type)
    const providerMessageId = event.data?.email_id
    if (!status || typeof providerMessageId !== 'string' || !providerMessageId.trim()) {
      return { received: true, projected: false }
    }
    return {
      received: true,
      projected: projectEmailDeliveryStatus(this.#database, {
        providerMessageId,
        status,
      }) !== null,
    }
  }
}

function resendStatus(value: unknown): Extract<
  EmailDeliveryStatus,
  'delivered' | 'delayed' | 'bounced' | 'complained' | 'suppressed'
> | null {
  if (value === 'email.delivered') return 'delivered'
  if (value === 'email.delivery_delayed') return 'delayed'
  if (value === 'email.bounced') return 'bounced'
  if (value === 'email.complained') return 'complained'
  if (value === 'email.suppressed') return 'suppressed'
  return null
}
