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
  {
    id: '0004_provisioning_job',
    sql: `
      CREATE TABLE provisioning_job (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL
          REFERENCES workspace(id) ON DELETE CASCADE,
        operation TEXT NOT NULL
          CHECK (operation IN ('ensure_running')),
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
        attempt INTEGER NOT NULL DEFAULT 0
          CHECK (attempt >= 0),
        available_at INTEGER NOT NULL,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        error_code TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        CHECK (
          status != 'running'
          OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
        )
      );

      CREATE UNIQUE INDEX provisioning_job_active_workspace_operation_idx
        ON provisioning_job(workspace_id, operation)
        WHERE status IN ('queued', 'running');

      CREATE INDEX provisioning_job_queue_idx
        ON provisioning_job(status, available_at, created_at);
    `,
  },
] as const

export type WorkspaceState = 'pending' | 'provisioning' | 'ready' | 'stopped' | 'failed'
export type ProvisioningJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

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

export interface ProvisioningJob {
  id: string
  workspaceId: string
  operation: 'ensure_running'
  status: ProvisioningJobStatus
  attempt: number
  availableAt: number
  leaseOwner: string | null
  leaseExpiresAt: number | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

export interface EnsureWorkspaceRunningOptions extends EnsurePersonalWorkspaceOptions {
  createJobId?: () => string
}

export interface EnsureWorkspaceRunningResult {
  workspace: PersonalWorkspace
  job: ProvisioningJob | null
}

export interface ClaimProvisioningJobOptions {
  leaseOwner: string
  leaseDurationMs?: number
  now?: () => number
}

export interface FinishProvisioningJobOptions {
  jobId: string
  leaseOwner: string
  outcome: 'succeeded' | 'failed'
  retryable?: boolean
  retryDelayMs?: number
  errorCode?: string
  errorMessage?: string
  workerWorkspaceId?: string
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

interface ProvisioningJobRow {
  id: string
  workspace_id: string
  operation: 'ensure_running'
  status: ProvisioningJobStatus
  attempt: number
  available_at: number
  lease_owner: string | null
  lease_expires_at: number | null
  error_code: string | null
  error_message: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
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

function toProvisioningJob(row: ProvisioningJobRow): ProvisioningJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    operation: row.operation,
    status: row.status,
    attempt: row.attempt,
    availableAt: row.available_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
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

export function ensureWorkspaceRunning(
  database: Database,
  options: EnsureWorkspaceRunningOptions,
): EnsureWorkspaceRunningResult {
  const workspace = ensurePersonalWorkspace(database, options)
  if (workspace.state === 'ready') return { workspace, job: null }

  const createJobId = options.createJobId ?? randomUUID
  const now = options.now ?? Date.now
  const findActiveJob = database.query<ProvisioningJobRow, [string]>(`
    SELECT *
    FROM provisioning_job
    WHERE workspace_id = ?
      AND operation = 'ensure_running'
      AND status IN ('queued', 'running')
    LIMIT 1
  `)
  const findWorkspace = database.query<WorkspaceRow, [string]>(`
    SELECT *
    FROM workspace
    WHERE id = ?
    LIMIT 1
  `)
  const insertJob = database.prepare(`
    INSERT INTO provisioning_job (
      id,
      workspace_id,
      operation,
      status,
      attempt,
      available_at,
      created_at,
      updated_at
    ) VALUES (?, ?, 'ensure_running', 'queued', 0, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `)
  const markProvisioning = database.prepare(`
    UPDATE workspace
    SET state = 'provisioning',
        updated_at = ?
    WHERE id = ?
      AND state != 'ready'
  `)

  return database.transaction(() => {
    let job = findActiveJob.get(workspace.id)
    const timestamp = now()
    if (!job) {
      insertJob.run(
        createJobId(),
        workspace.id,
        timestamp,
        timestamp,
        timestamp,
      )
      job = findActiveJob.get(workspace.id)
    }
    if (!job) throw new Error('Provisioning job could not be resolved')

    markProvisioning.run(timestamp, workspace.id)
    const updatedWorkspace = findWorkspace.get(workspace.id)
    if (!updatedWorkspace) throw new Error('Personal workspace disappeared')
    return {
      workspace: toPersonalWorkspace(updatedWorkspace),
      job: toProvisioningJob(job),
    }
  }).immediate()
}

export function claimProvisioningJob(
  database: Database,
  {
    leaseOwner,
    leaseDurationMs = 30000,
    now = Date.now,
  }: ClaimProvisioningJobOptions,
): ProvisioningJob | null {
  if (!leaseOwner.trim()) throw new Error('leaseOwner is required')
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error('leaseDurationMs must be positive')
  }

  const findClaimable = database.query<ProvisioningJobRow, [number, number]>(`
    SELECT *
    FROM provisioning_job
    WHERE (
      status = 'queued'
      AND available_at <= ?
    ) OR (
      status = 'running'
      AND lease_expires_at <= ?
    )
    ORDER BY
      CASE status WHEN 'queued' THEN 0 ELSE 1 END,
      available_at,
      created_at
    LIMIT 1
  `)
  const claim = database.prepare(`
    UPDATE provisioning_job
    SET status = 'running',
        attempt = attempt + 1,
        lease_owner = ?,
        lease_expires_at = ?,
        updated_at = ?,
        completed_at = NULL
    WHERE id = ?
  `)
  const findById = database.query<ProvisioningJobRow, [string]>(`
    SELECT * FROM provisioning_job WHERE id = ?
  `)

  return database.transaction(() => {
    const timestamp = now()
    const candidate = findClaimable.get(timestamp, timestamp)
    if (!candidate) return null
    claim.run(
      leaseOwner,
      timestamp + leaseDurationMs,
      timestamp,
      candidate.id,
    )
    const claimed = findById.get(candidate.id)
    return claimed ? toProvisioningJob(claimed) : null
  }).immediate()
}

export function finishProvisioningJob(
  database: Database,
  {
    jobId,
    leaseOwner,
    outcome,
    retryable = false,
    retryDelayMs = 0,
    errorCode,
    errorMessage,
    workerWorkspaceId,
    now = Date.now,
  }: FinishProvisioningJobOptions,
): ProvisioningJob {
  const findById = database.query<ProvisioningJobRow, [string]>(`
    SELECT * FROM provisioning_job WHERE id = ?
  `)
  const updateJob = database.prepare(`
    UPDATE provisioning_job
    SET status = ?,
        available_at = ?,
        lease_owner = NULL,
        lease_expires_at = NULL,
        error_code = ?,
        error_message = ?,
        updated_at = ?,
        completed_at = ?
    WHERE id = ?
      AND status = 'running'
      AND lease_owner = ?
  `)
  const updateWorkspace = database.prepare(`
    UPDATE workspace
    SET state = ?,
        worker_workspace_id = COALESCE(?, worker_workspace_id),
        updated_at = ?
    WHERE id = ?
  `)

  return database.transaction(() => {
    const current = findById.get(jobId)
    if (!current || current.status !== 'running' || current.lease_owner !== leaseOwner) {
      throw new ProvisioningJobLeaseLostError()
    }

    const timestamp = now()
    const requeue = outcome === 'failed' && retryable
    const nextStatus: ProvisioningJobStatus = requeue ? 'queued' : outcome
    const completedAt = requeue ? null : timestamp
    const boundedRetryDelay = Number.isFinite(retryDelayMs)
      ? Math.max(0, Math.floor(retryDelayMs))
      : 0
    const boundedErrorCode = (errorCode ?? 'provisioning_failed')
      .trim()
      .slice(0, 64)
    const boundedErrorMessage = (errorMessage ?? 'Workspace provisioning failed')
      .trim()
      .slice(0, 512)
    const result = updateJob.run(
      nextStatus,
      requeue ? timestamp + boundedRetryDelay : timestamp,
      outcome === 'failed' ? boundedErrorCode : null,
      outcome === 'failed' ? boundedErrorMessage : null,
      timestamp,
      completedAt,
      jobId,
      leaseOwner,
    )
    if (result.changes !== 1) throw new ProvisioningJobLeaseLostError()

    if (outcome === 'succeeded') {
      updateWorkspace.run(
        'ready',
        workerWorkspaceId ?? current.workspace_id,
        timestamp,
        current.workspace_id,
      )
    } else if (!retryable) {
      updateWorkspace.run('failed', null, timestamp, current.workspace_id)
    }

    const updated = findById.get(jobId)
    if (!updated) throw new Error('Provisioning job disappeared')
    return toProvisioningJob(updated)
  }).immediate()
}

export class ProvisioningJobLeaseLostError extends Error {
  readonly code = 'provisioning_job_lease_lost'

  constructor() {
    super('The provisioning job lease is no longer owned by this processor')
    this.name = 'ProvisioningJobLeaseLostError'
  }
}

export type CloudDatabase = Database
