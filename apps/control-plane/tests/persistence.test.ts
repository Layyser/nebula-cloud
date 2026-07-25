import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializePersistence } from '../src/persistence'

test('initializes Better Auth and the minimal Nebula schema together', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nebula-cloud-'))
  const databasePath = join(directory, 'cloud.sqlite')

  try {
    const { database, auth } = await initializePersistence({
      databasePath,
      authSecret: 'test-secret-that-is-at-least-32-characters',
      authBaseURL: 'http://localhost:7790',
    })
    try {
      const tables = new Set(database.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      ).all().map(table => table.name))

      expect(tables.has('user')).toBe(true)
      expect(tables.has('organization')).toBe(true)
      expect(tables.has('member')).toBe(true)
      expect(tables.has('workspace')).toBe(true)
      expect(auth.handler).toBeFunction()

      database.exec(`
        INSERT INTO user (
          id, name, email, emailVerified, createdAt, updatedAt
        ) VALUES (
          'user-1', 'George', 'george@example.test', 1, 1, 1
        );
        INSERT INTO organization (
          id, name, slug, createdAt
        ) VALUES (
          'org-1', 'Nebula', 'nebula', 1
        );
        INSERT INTO member (
          id, organizationId, userId, role, createdAt
        ) VALUES (
          'member-1', 'org-1', 'user-1', 'owner', 1
        );
        INSERT INTO workspace (
          id, member_id, organization_id, state, created_at, updated_at
        ) VALUES (
          'workspace-1', 'member-1', 'org-1', 'pending', 1, 1
        );
      `)
      expect(database.query<{ id: string }, []>(
        'SELECT id FROM workspace',
      ).get()?.id).toBe('workspace-1')
    } finally {
      database.close()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
