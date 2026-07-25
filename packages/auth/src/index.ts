import type { Database } from 'bun:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { organization } from 'better-auth/plugins'

export interface CreateCloudAuthOptions {
  database: Database
  secret: string
  baseURL: string
  trustedOrigins?: string[]
}

export function createCloudAuth({
  database,
  secret,
  baseURL,
  trustedOrigins = [],
}: CreateCloudAuthOptions) {
  if (secret.trim().length < 32) {
    throw new Error('Better Auth secret must contain at least 32 characters')
  }

  return betterAuth({
    database,
    secret,
    baseURL,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
    },
    advanced: {
      database: {
        generateId: 'uuid',
      },
    },
    plugins: [
      organization({
        requireEmailVerificationOnInvitation: true,
      }),
    ],
  })
}

export type CloudAuth = ReturnType<typeof createCloudAuth>

export async function migrateCloudAuthSchema(auth: CloudAuth): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
}
