import { expect, test } from 'bun:test'
import { openCloudDatabase, migrateCloudSchema } from '../src'

test('applies the minimal application schema idempotently', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    migrateCloudSchema(database)
    migrateCloudSchema(database)

    const tables = database.query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all().map(table => table.name)

    expect(tables).toContain('nebula_migration')
    expect(tables).toContain('workspace')
    expect(database.query<{ count: number }, []>(
      'SELECT COUNT(*) AS count FROM nebula_migration',
    ).get()?.count).toBe(1)
  } finally {
    database.close()
  }
})

test('enforces one workspace per organization membership', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id)
      );
    `)
    migrateCloudSchema(database)
    database.exec(`
      INSERT INTO user (id) VALUES ('user-1');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId)
        VALUES ('member-1', 'user-1', 'org-1');
    `)

    const insert = database.prepare(`
      INSERT INTO workspace (
        id, member_id, organization_id, state, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?)
    `)
    insert.run('workspace-1', 'member-1', 'org-1', 1, 1)

    expect(() => {
      insert.run('workspace-2', 'member-1', 'org-1', 1, 1)
    }).toThrow()
  } finally {
    database.close()
  }
})
