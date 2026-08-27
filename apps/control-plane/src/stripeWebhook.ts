import { Buffer } from 'node:buffer'
import Stripe from 'stripe'
import type { Database } from 'bun:sqlite'
import {
  applyStripeBillingProjection,
  failStripeEvent,
  getBillingCustomerByStripeId,
  getStripeEvent,
  ignoreStripeEvent,
  registerStripeEvent,
  type StripeBillingProjectionInput,
} from '@nebula-cloud/database'

const organizationMetadataKey = 'nubols_organization_id'

type JsonRecord = Record<string, unknown>

export interface StripeWebhookResult {
  eventId: string
  type: string
  duplicate: boolean
  processingResult: 'applied' | 'ignored'
}

export class StripeWebhookVerificationError extends Error {
  readonly code = 'stripe_webhook_verification_failed'

  constructor() {
    super('Stripe webhook signature verification failed')
    this.name = 'StripeWebhookVerificationError'
  }
}

export interface StripeWebhookProcessorOptions {
  database: Database
  webhookSecret: string
  now?: () => number
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`Stripe ${field} is required`)
  }
  return value.trim()
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function expandableId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  return isRecord(value) ? optionalString(value.id) : null
}

function secondsToMilliseconds(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`Stripe ${field} is invalid`)
  }
  const milliseconds = Number(value) * 1000
  if (!Number.isSafeInteger(milliseconds)) throw new TypeError(`Stripe ${field} is invalid`)
  return milliseconds
}

function eventOrganizationId(object: JsonRecord): string | null {
  if (!isRecord(object.metadata)) return null
  return optionalString(object.metadata[organizationMetadataKey])
}

function customerOrganizationId(
  database: Database,
  object: JsonRecord,
  stripeCustomerId: string,
): string {
  const organizationId = eventOrganizationId(object)
    ?? getBillingCustomerByStripeId(database, stripeCustomerId)?.organizationId
  if (!organizationId) throw new TypeError(`Stripe ${organizationMetadataKey} is required`)
  return organizationId
}

function customerProjection(
  database: Database,
  object: JsonRecord,
): Pick<StripeBillingProjectionInput, 'organizationId' | 'customer'> {
  const stripeCustomerId = requiredString(object.id, 'customer id')
  const address = isRecord(object.address) ? object.address : null
  return {
    organizationId: customerOrganizationId(database, object, stripeCustomerId),
    customer: {
      stripeCustomerId,
      billingEmail: optionalString(object.email),
      country: address ? optionalString(address.country) : null,
    },
  }
}

function checkoutProjection(
  database: Database,
  object: JsonRecord,
): Pick<StripeBillingProjectionInput, 'organizationId' | 'customer'> {
  const stripeCustomerId = expandableId(object.customer)
  if (!stripeCustomerId) throw new TypeError('Stripe Checkout customer id is required')
  const details = isRecord(object.customer_details) ? object.customer_details : null
  const address = details && isRecord(details.address) ? details.address : null
  return {
    organizationId: customerOrganizationId(database, object, stripeCustomerId),
    customer: {
      stripeCustomerId,
      billingEmail: details ? optionalString(details.email) : null,
      country: address ? optionalString(address.country) : null,
    },
  }
}

function subscriptionProjection(
  database: Database,
  object: JsonRecord,
): Pick<StripeBillingProjectionInput, 'organizationId' | 'subscription'> {
  const stripeCustomerId = expandableId(object.customer)
  if (!stripeCustomerId) throw new TypeError('Stripe subscription customer id is required')
  const items = isRecord(object.items) && Array.isArray(object.items.data)
    ? object.items.data.filter(isRecord)
    : []
  if (items.length !== 1) {
    throw new TypeError('Nubols subscriptions require exactly one Stripe price')
  }
  const item = items[0]
  const price = isRecord(item.price) ? item.price : null
  if (!price) throw new TypeError('Stripe subscription price is required')
  const quantity = item.quantity
  if (!Number.isSafeInteger(quantity) || Number(quantity) < 0) {
    throw new TypeError('Stripe subscription quantity is invalid')
  }
  const currentPeriodEnd = secondsToMilliseconds(
    item.current_period_end ?? object.current_period_end,
    'subscription period end',
  )
  return {
    organizationId: customerOrganizationId(database, object, stripeCustomerId),
    subscription: {
      stripeSubscriptionId: requiredString(object.id, 'subscription id'),
      stripePriceId: requiredString(price.id, 'price id'),
      status: requiredString(object.status, 'subscription status'),
      entitledSeats: Number(quantity),
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
      currentPeriodEnd,
    },
  }
}

export class StripeWebhookProcessor {
  readonly #database: Database
  readonly #webhookSecret: string
  readonly #now: () => number

  constructor({ database, webhookSecret, now = Date.now }: StripeWebhookProcessorOptions) {
    const secret = webhookSecret.trim()
    if (!secret) throw new TypeError('Stripe webhook secret is required')
    this.#database = database
    this.#webhookSecret = secret
    this.#now = now
  }

  async process(rawBody: Uint8Array, signature: string): Promise<StripeWebhookResult> {
    let event: Stripe.Event
    try {
      event = await Stripe.webhooks.constructEventAsync(
        Buffer.from(rawBody),
        signature,
        this.#webhookSecret,
      )
    } catch {
      throw new StripeWebhookVerificationError()
    }

    const eventCreatedAt = secondsToMilliseconds(event.created, 'event creation time')
    if (eventCreatedAt === null) throw new TypeError('Stripe event creation time is required')
    const eventInput = {
      stripeEventId: event.id,
      type: event.type,
      eventCreatedAt,
      receivedAt: this.#now(),
    }
    const registration = registerStripeEvent(this.#database, eventInput)
    if (
      registration.event.processingResult === 'applied'
      || registration.event.processingResult === 'ignored'
    ) {
      return {
        eventId: event.id,
        type: event.type,
        duplicate: true,
        processingResult: registration.event.processingResult,
      }
    }

    try {
      const object = event.data.object as unknown
      if (!isRecord(object)) throw new TypeError('Stripe event object is invalid')
      let projection: Pick<StripeBillingProjectionInput, 'organizationId' | 'customer' | 'subscription'>
      switch (event.type) {
        case 'customer.created':
        case 'customer.updated':
          projection = customerProjection(this.#database, object)
          break
        case 'checkout.session.completed':
          projection = checkoutProjection(this.#database, object)
          break
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          projection = subscriptionProjection(this.#database, object)
          break
        default:
          if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
            throw new Error('Stripe invoice grace projection is not implemented')
          }
          ignoreStripeEvent(this.#database, {
            ...eventInput,
            processingMessage: 'event type is not projected',
            now: this.#now,
          })
          return {
            eventId: event.id,
            type: event.type,
            duplicate: !registration.inserted,
            processingResult: 'ignored',
          }
      }

      const result = applyStripeBillingProjection(this.#database, {
        event: eventInput,
        ...projection,
        now: this.#now,
      })
      return {
        eventId: event.id,
        type: event.type,
        duplicate: !registration.inserted,
        processingResult: result.processingResult,
      }
    } catch (error) {
      const current = getStripeEvent(this.#database, event.id)
      if (current?.attemptCount === registration.event.attemptCount) {
        failStripeEvent(this.#database, {
          ...eventInput,
          processingMessage: error instanceof Error ? error.message : 'Stripe event normalization failed',
          now: this.#now,
        })
      }
      throw error
    }
  }
}
