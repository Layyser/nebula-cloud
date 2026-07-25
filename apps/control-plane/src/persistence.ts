import { createCloudAuth, migrateCloudAuthSchema } from '@nebula-cloud/auth'
import { migrateCloudSchema, openCloudDatabase } from '@nebula-cloud/database'

export interface InitializePersistenceOptions {
  databasePath: string
  authSecret: string
  authBaseURL: string
}

export async function initializePersistence({
  databasePath,
  authSecret,
  authBaseURL,
}: InitializePersistenceOptions) {
  const database = openCloudDatabase({ path: databasePath })

  try {
    const auth = createCloudAuth({
      database,
      secret: authSecret,
      baseURL: authBaseURL,
    })
    await migrateCloudAuthSchema(auth)
    migrateCloudSchema(database)
    return { database, auth }
  } catch (error) {
    database.close()
    throw error
  }
}
