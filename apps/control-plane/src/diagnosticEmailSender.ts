import type { Database } from 'bun:sqlite'
import { createHmac, randomUUID } from 'node:crypto'
import type { TransactionalEmailSender } from '@nebula-cloud/auth'
import {
  beginEmailDelivery,
  isEmailRecipientSuppressed,
  markEmailDeliveryFailed,
  markEmailDeliverySent,
} from '@nebula-cloud/database'

export class EmailRecipientSuppressedError extends Error {
  readonly code = 'email_recipient_suppressed'

  constructor() {
    super('Transactional email recipient is suppressed')
    this.name = 'EmailRecipientSuppressedError'
  }
}

export function createDiagnosticEmailSender(input: {
  sender: TransactionalEmailSender
  provider: string
  recipientHashSecret: string
  database: () => Database
}): TransactionalEmailSender {
  const provider = input.provider.trim()
  const secret = input.recipientHashSecret.trim()
  if (!provider) throw new Error('Diagnostic email provider is required')
  if (secret.length < 32) throw new Error('Email recipient hash secret must contain at least 32 characters')
  return {
    async send(message) {
      const database = input.database()
      const recipientHash = createHmac('sha256', secret)
        .update(message.to.trim().toLowerCase())
        .digest('hex')
      if (isEmailRecipientSuppressed(database, recipientHash)) {
        throw new EmailRecipientSuppressedError()
      }
      const id = randomUUID()
      beginEmailDelivery(database, {
        id,
        provider,
        kind: message.kind,
        recipientHash,
      })
      try {
        const receipt = await input.sender.send(message)
        markEmailDeliverySent(database, {
          id,
          providerMessageId: receipt.providerMessageId,
        })
        return receipt
      } catch (error) {
        markEmailDeliveryFailed(database, {
          id,
          errorCode: error instanceof EmailRecipientSuppressedError
            ? error.code
            : 'provider_send_failed',
        })
        throw error
      }
    },
  }
}
