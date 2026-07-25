import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

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
  {
    id: '0002_workspace_membership_organization_guard',
    sql: `
      CREATE TRIGGER workspace_member_organization_insert_guard
      BEFORE INSERT ON workspace
      FOR EACH ROW
      WHEN NOT EXISTS (
        SELECT 1
        FROM member
        WHERE id = NEW.member_id
          AND organizationId = NEW.organization_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'workspace membership does not belong to organization');
      END;

      CREATE TRIGGER workspace_member_organization_update_guard
      BEFORE UPDATE OF member_id, organization_id ON workspace
      FOR EACH ROW
      WHEN NOT EXISTS (
        SELECT 1
        FROM member
        WHERE id = NEW.member_id
          AND organizationId = NEW.organization_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'workspace membership does not belong to organization');
      END;
    `,
  },
  {
    id: '0003_validate_existing_workspace_ownership',
    sql: `
      UPDATE workspace
      SET organization_id = organization_id;
    `,
  },
] as const

export type WorkspaceState = 'pending' | 'provisioning' | 'ready' | 'stopped' | 'failed'

export interface PersonalWorkspace {
  id: string
  memberId: string
  organizationId: string
  workerWorkspaceId: string | null
  state: WorkspaceState
  createdAt: number
  updatedAt: number
}

export interface EnsurePersonalWorkspaceOptions {
  userId: string
  organizationId: string
  createId?: () => string
  now?: () => number
}

export class WorkspaceMembershipNotFoundError extends Error {
  readonly code = 'workspace_membership_not_found'

  constructor() {
    super('The user is not a member of this organization')
    this.name = 'WorkspaceMembershipNotFoundError'
  }
}

interface WorkspaceRow {
  id: string
  member_id: string
  organization_id: string
  worker_workspace_id: string | null
  state: WorkspaceState
  created_at: number
  updated_at: number
}

function toPersonalWorkspace(row: WorkspaceRow): PersonalWorkspace {
  return {
    id: row.id,
    memberId: row.member_id,
    organizationId: row.organization_id,
    workerWorkspaceId: row.worker_workspace_id,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

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

export function ensurePersonalWorkspace(
  database: Database,
  {
    userId,
    organizationId,
    createId = randomUUID,
    now = Date.now,
  }: EnsurePersonalWorkspaceOptions,
): PersonalWorkspace {
  const findMembership = database.query<{ id: string }, [string, string]>(`
    SELECT id
    FROM member
    WHERE userId = ?
      AND organizationId = ?
    LIMIT 1
  `)
  const findWorkspace = database.query<WorkspaceRow, [string]>(`
    SELECT
      id,
      member_id,
      organization_id,
      worker_workspace_id,
      state,
      created_at,
      updated_at
    FROM workspace
    WHERE member_id = ?
    LIMIT 1
  `)
  const insertWorkspace = database.prepare(`
    INSERT INTO workspace (
      id,
      member_id,
      organization_id,
      state,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(member_id) DO NOTHING
  `)

  return database.transaction(() => {
    const membership = findMembership.get(userId, organizationId)
    if (!membership) throw new WorkspaceMembershipNotFoundError()

    const existing = findWorkspace.get(membership.id)
    if (existing) return toPersonalWorkspace(existing)

    const timestamp = now()
    insertWorkspace.run(
      createId(),
      membership.id,
      organizationId,
      timestamp,
      timestamp,
    )

    const workspace = findWorkspace.get(membership.id)
    if (!workspace) throw new Error('Personal workspace could not be resolved')
    return toPersonalWorkspace(workspace)
  }).immediate()
}

export type CloudDatabase = Database
