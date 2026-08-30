import { createHmac } from 'node:crypto'
import { expect, test } from 'bun:test'
import {
  beginEmailDelivery,
  getEmailDelivery,
  markEmailDeliverySent,
  migrateCloudSchema,
  openCloudDatabase,
} from '@nebula-cloud/database'
import { ResendWebhookProcessor, ResendWebhookVerificationError } from './resendWebhook'

test('verifies Resend signatures and projects delivery status by provider ID', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
      );
    `)
    migrateCloudSchema(database)
    beginEmailDelivery(database, {
      id: 'delivery-1', provider: 'resend', kind: 'email-verification',
      recipientHash: 'a'.repeat(64), now: () => 100,
    })
    markEmailDeliverySent(database, {
      id: 'delivery-1', providerMessageId: 'email-provider-1', now: () => 110,
    })
    const secretBytes = Buffer.from('webhook-secret-material-32-bytes!')
    const processor = new ResendWebhookProcessor({
      database,
      webhookSecret: `whsec_${secretBytes.toString('base64')}`,
      now: () => 1_700_000_000_000,
    })
    const body = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'email-provider-1' },
    })
    const webhookId = 'msg_1'
    const timestamp = '1700000000'
    const signature = createHmac('sha256', secretBytes)
      .update(`${webhookId}.${timestamp}.${body}`)
      .digest('base64')
    const headers = new Headers({
      'svix-id': webhookId,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    })
    expect(processor.process(Buffer.from(body), headers)).toEqual({ received: true, projected: true })
    expect(getEmailDelivery(database, 'delivery-1')?.status).toBe('bounced')

    headers.set('svix-signature', 'v1,invalid')
    expect(() => processor.process(Buffer.from(body), headers))
      .toThrow(ResendWebhookVerificationError)
  } finally {
    database.close()
  }
})
