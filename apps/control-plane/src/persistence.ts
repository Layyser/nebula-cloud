import {
  createCloudAuth,
  migrateCloudAuthSchema,
  type TransactionalEmailSender,
} from '@nebula-cloud/auth'
import { migrateCloudSchema, openCloudDatabase } from '@nebula-cloud/database'

export interface InitializePersistenceOptions {
  databasePath: string
  authSecret: string
  authBaseURL: string
  appBaseURL?: string
  trustedOrigins?: string[]
  emailSender?: TransactionalEmailSender
  requireEmailVerification?: boolean
  allowedSignUpEmails?: readonly string[]
}

export async function initializePersistence({
  databasePath,
  authSecret,
  authBaseURL,
  appBaseURL,
  trustedOrigins,
  emailSender,
  requireEmailVerification,
  allowedSignUpEmails,
}: InitializePersistenceOptions) {
  const database = openCloudDatabase({ path: databasePath })

  try {
    const auth = createCloudAuth({
      database,
      secret: authSecret,
      baseURL: authBaseURL,
      appBaseURL,
      trustedOrigins,
      emailSender,
      requireEmailVerification,
      allowedSignUpEmails,
    })
    await migrateCloudAuthSchema(auth)
    migrateCloudSchema(database)
    return { database, auth }
  } catch (error) {
    database.close()
    throw error
  }
}
