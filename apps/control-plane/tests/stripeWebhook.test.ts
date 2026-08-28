import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import Stripe from 'stripe'
import {
  getBillingCustomer,
  getBillingSubscription,
  getStripeEvent,
  migrateCloudSchema,
} from '@nebula-cloud/database'
import {
  StripeWebhookProcessor,
  StripeWebhookVerificationError,
} from '../src/stripeWebhook'

const webhookSecret = 'whsec_test_nubols'

async function signedPayload(payload: Record<string, unknown>): Promise<{
  body: Uint8Array
  signature: string
}> {
  const text = JSON.stringify(payload)
  return {
    body: new TextEncoder().encode(text),
    signature: await Stripe.webhooks.generateTestHeaderStringAsync({
      payload: text,
      secret: webhookSecret,
    }),
  }
}

function testDatabase(): Database {
  const database = new Database(':memory:')
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE user (id TEXT PRIMARY KEY);
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    CREATE TABLE member (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id),
      organizationId TEXT NOT NULL REFERENCES organization(id),
      role TEXT NOT NULL DEFAULT 'member'
    );
    INSERT INTO organization (id) VALUES ('org-1');
  `)
  migrateCloudSchema(database)
  return database
}

test('verifies, normalizes, deduplicates, and orders Stripe billing webhooks', async () => {
  const database = testDatabase()
  try {
    const processor = new StripeWebhookProcessor({
      database,
      webhookSecret,
      now: () => 500_000,
    })
    const customer = await signedPayload({
      id: 'evt_customer',
      object: 'event',
      created: 100,
      type: 'customer.created',
      data: {
        object: {
          id: 'cus_1',
          object: 'customer',
          email: 'billing@example.com',
          address: { country: 'ES' },
          metadata: { nubols_organization_id: 'org-1' },
        },
      },
    })
    expect(await processor.process(customer.body, customer.signature)).toEqual({
      eventId: 'evt_customer',
      type: 'customer.created',
      duplicate: false,
      processingResult: 'applied',
    })
    expect((await processor.process(customer.body, customer.signature)).duplicate).toBe(true)
    expect(getBillingCustomer(database, 'org-1')).toMatchObject({
      stripeCustomerId: 'cus_1',
      billingEmail: 'billing@example.com',
      country: 'ES',
    })

    const subscription = await signedPayload({
      id: 'evt_subscription',
      object: 'event',
      created: 200,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          object: 'subscription',
          customer: 'cus_1',
          status: 'active',
          cancel_at_period_end: false,
          metadata: {},
          items: {
            data: [{
              quantity: 4,
              current_period_end: 1_000,
              price: { id: 'price_1' },
            }],
          },
        },
      },
    })
    expect((await processor.process(subscription.body, subscription.signature)).processingResult).toBe('applied')
    expect(getBillingSubscription(database, 'org-1')).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_1',
      status: 'active',
      entitledSeats: 4,
      currentPeriodEnd: 1_000_000,
    })

    const invoice = await signedPayload({
      id: 'evt_invoice',
      object: 'event',
      created: 300,
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_1',
          object: 'invoice',
          customer: 'cus_1',
          parent: { subscription_details: { subscription: 'sub_1' } },
        },
      },
    })
    expect(await processor.process(invoice.body, invoice.signature)).toMatchObject({
      duplicate: false,
      processingResult: 'applied',
    })
    expect(getStripeEvent(database, 'evt_invoice')).toMatchObject({
      processingResult: 'applied',
      processingMessage: 'subscription entered fixed payment grace',
    })
  } finally {
    database.close()
  }
})

test('rejects invalid signatures and durably records normalization failures', async () => {
  const database = testDatabase()
  try {
    const processor = new StripeWebhookProcessor({ database, webhookSecret })
    const malformed = await signedPayload({
      id: 'evt_malformed',
      object: 'event',
      created: 400,
      type: 'customer.created',
      data: {
        object: {
          id: 'cus_unknown',
          object: 'customer',
          email: null,
          address: null,
          metadata: {},
        },
      },
    })

    await expect(processor.process(malformed.body, 'invalid')).rejects.toBeInstanceOf(
      StripeWebhookVerificationError,
    )
    expect(getStripeEvent(database, 'evt_malformed')).toBeNull()
    await expect(processor.process(malformed.body, malformed.signature)).rejects.toThrow(
      'Stripe nubols_organization_id is required',
    )
    expect(getStripeEvent(database, 'evt_malformed')).toMatchObject({
      processingResult: 'failed',
      attemptCount: 1,
    })
  } finally {
    database.close()
  }
})
