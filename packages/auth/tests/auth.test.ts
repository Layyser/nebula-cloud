import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createCloudAuth, migrateCloudAuthSchema } from '../src'

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
