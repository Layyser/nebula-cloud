import { createHmac } from 'node:crypto'
import { expect, test } from 'bun:test'
import {
  beginEmailDelivery,
  markEmailDeliverySent,
  migrateCloudSchema,
  openCloudDatabase,
  projectEmailDeliveryStatus,
} from '@nebula-cloud/database'
import { createDiagnosticEmailSender, EmailRecipientSuppressedError } from './diagnosticEmailSender'

test('does not call the provider again for a permanently suppressed recipient', async () => {
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
    const secret = 'diagnostic-secret-with-at-least-32-characters'
    const email = 'person@example.com'
    const recipientHash = createHmac('sha256', secret).update(email).digest('hex')
    beginEmailDelivery(database, {
      id: 'old-delivery', provider: 'resend', kind: 'password-reset', recipientHash,
    })
    markEmailDeliverySent(database, {
      id: 'old-delivery', providerMessageId: 'old-provider-message',
    })
    projectEmailDeliveryStatus(database, {
      providerMessageId: 'old-provider-message', status: 'bounced',
    })
    let providerCalls = 0
    const sender = createDiagnosticEmailSender({
      provider: 'resend',
      recipientHashSecret: secret,
      database: () => database,
      sender: {
        async send() {
          providerCalls += 1
          return { providerMessageId: 'must-not-send' }
        },
      },
    })
    await expect(sender.send({
      kind: 'password-reset',
      to: email,
      subject: 'Reset',
      text: 'sensitive body',
      html: '<p>sensitive body</p>',
    })).rejects.toBeInstanceOf(EmailRecipientSuppressedError)
    expect(providerCalls).toBe(0)
  } finally {
    database.close()
  }
})
