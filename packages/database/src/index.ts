import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const migrations = [
  {
    id: '0001_workspace',
    sql: `
      CREATE TABLE workspace (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL UNIQUE
          REFERENCES member(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL
          REFERENCES organization(id) ON DELETE CASCADE,
        worker_workspace_id TEXT UNIQUE,
        state TEXT NOT NULL DEFAULT 'pending'
          CHECK (state IN ('pending', 'provisioning', 'ready', 'stopped', 'failed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX workspace_organization_id_idx
        ON workspace(organization_id);
    `,
  },
] as const

export interface OpenCloudDatabaseOptions {
  path: string
}

export function openCloudDatabase({ path }: OpenCloudDatabaseOptions): Database {
  const databasePath = path === ':memory:' ? path : resolve(path)
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true })
  }

  const database = new Database(databasePath, { create: true, strict: true })
  database.exec('PRAGMA foreign_keys = ON')
  database.exec('PRAGMA busy_timeout = 5000')
  if (databasePath !== ':memory:') {
    database.exec('PRAGMA journal_mode = WAL')
  }
  return database
}

export function migrateCloudSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS nebula_migration (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)

  const applied = database.query<{ id: string }, []>(
    'SELECT id FROM nebula_migration',
  ).all()
  const appliedIds = new Set(applied.map(migration => migration.id))
  const insert = database.prepare(
    'INSERT INTO nebula_migration (id, applied_at) VALUES (?, ?)',
  )

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue

    database.transaction(() => {
      database.exec(migration.sql)
      insert.run(migration.id, Date.now())
    })()
  }
}

export type CloudDatabase = Database
