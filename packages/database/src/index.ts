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
  {
    id: '0005_usage_event',
    sql: `
      CREATE TABLE usage_event (
        event_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
        membership_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        agent_id TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
        output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
        cached_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
        duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
        outcome TEXT NOT NULL DEFAULT 'success'
          CHECK (outcome IN ('success', 'error', 'cancelled')),
        occurred_at INTEGER NOT NULL,
        received_at INTEGER NOT NULL
      );

      CREATE INDEX usage_event_membership_time_idx
        ON usage_event(membership_id, occurred_at DESC);
      CREATE INDEX usage_event_organization_time_idx
        ON usage_event(organization_id, occurred_at DESC);
      CREATE INDEX usage_event_workspace_session_idx
        ON usage_event(workspace_id, session_id, occurred_at DESC);

      CREATE TRIGGER usage_event_scope_insert_guard
      BEFORE INSERT ON usage_event
      FOR EACH ROW
      WHEN NOT EXISTS (
        SELECT 1
        FROM workspace
        INNER JOIN member ON member.id = workspace.member_id
        WHERE workspace.id = NEW.workspace_id
          AND workspace.organization_id = NEW.organization_id
          AND workspace.member_id = NEW.membership_id
          AND member.organizationId = NEW.organization_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'usage event scope does not match workspace ownership');
      END;
    `,
  },
  {
    id: '0006_usage_event_cost',
    sql: `
      ALTER TABLE usage_event
        ADD COLUMN estimated_cost_microusd INTEGER NOT NULL DEFAULT 0
        CHECK (estimated_cost_microusd >= 0);
    `,
  },
  {
    id: '0007_usage_event_details',
    sql: `
      ALTER TABLE usage_event
        ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0
        CHECK (reasoning_tokens >= 0);
      ALTER TABLE usage_event
        ADD COLUMN cache_savings_microusd INTEGER NOT NULL DEFAULT 0
        CHECK (cache_savings_microusd >= 0);
    `,
  },
  {
    id: '0008_usage_session_display_name',
    sql: `
      ALTER TABLE usage_event
        ADD COLUMN session_display_name TEXT;
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

export interface ResolveWorkspaceAccessOptions {
  workspaceId: string
  userId: string
  organizationId: string
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

export type UsageOutcome = 'success' | 'error' | 'cancelled'

export interface RecordUsageEventInput {
  eventId: string
  organizationId: string
  membershipId: string
  workspaceId: string
  sessionId: string
  sessionDisplayName?: string | null
  agentId?: string | null
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  reasoningTokens?: number
  estimatedCostMicrousd?: number
  cacheSavingsMicrousd?: number
  durationMs?: number | null
  outcome?: UsageOutcome
  occurredAt: number
  receivedAt?: number
}

export interface UsageTotals {
  modelTurns: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  reasoningTokens: number
  totalTokens: number
  estimatedCostMicrousd: number
  cacheSavingsMicrousd: number
}

export interface UsageSessionSummary extends UsageTotals {
  sessionId: string
  displayName: string
  lastOccurredAt: number
}

export interface UsageModelSummary extends UsageTotals {
  provider: string
  model: string
}

export interface UsageDaySummary extends UsageTotals {
  date: string
}

export interface UsageModelDaySummary extends UsageDaySummary {
  provider: string
  model: string
}

export interface PersonalUsageSummary {
  organizationId: string
  membershipId: string
  rangeDays: 7 | 30 | 90
  totals: UsageTotals
  sessions: UsageSessionSummary[]
  models: UsageModelSummary[]
  timeline: UsageDaySummary[]
  modelTimeline: UsageModelDaySummary[]
}

export interface OrganizationMemberUsageSummary extends UsageTotals {
  membershipId: string
  userId: string
  name: string
}

export interface OrganizationUsageSummary {
  organizationId: string
  rangeDays: 7 | 30 | 90
  totals: UsageTotals
  members: OrganizationMemberUsageSummary[]
}

export interface UsageSummaryAccessOptions {
  userId: string
  organizationId: string
  since: number
  rangeDays: 7 | 30 | 90
}

export class WorkspaceMembershipNotFoundError extends Error {
  readonly code = 'workspace_membership_not_found'

  constructor() {
    super('The user is not a member of this organization')
    this.name = 'WorkspaceMembershipNotFoundError'
  }
}

export class UsageAccessDeniedError extends Error {
  readonly code = 'usage_access_denied'

  constructor() {
    super('The user cannot inspect organization usage')
    this.name = 'UsageAccessDeniedError'
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

// Resolves a workspace only when the signed-in user still has a live
// membership in the session's active organization and either owns the
// workspace or has an organization role allowed to administer it. Returning
// null for every denial avoids turning workspace IDs into an enumeration
// oracle.
export function resolveWorkspaceAccess(
  database: Database,
  {
    workspaceId,
    userId,
    organizationId,
  }: ResolveWorkspaceAccessOptions,
): PersonalWorkspace | null {
  if (!workspaceId.trim() || !userId.trim() || !organizationId.trim()) return null
  const row = database.query<WorkspaceRow, [string, string, string]>(`
    SELECT
      workspace.id,
      workspace.member_id,
      workspace.organization_id,
      workspace.worker_workspace_id,
      workspace.state,
      workspace.created_at,
      workspace.updated_at
    FROM workspace
    INNER JOIN member AS workspace_member
      ON workspace_member.id = workspace.member_id
    INNER JOIN member AS actor_member
      ON actor_member.organizationId = workspace.organization_id
    WHERE workspace.id = ?
      AND actor_member.userId = ?
      AND actor_member.organizationId = ?
      AND workspace.organization_id = workspace_member.organizationId
      AND (
        actor_member.id = workspace.member_id
        OR actor_member.role IN ('owner', 'admin')
      )
    LIMIT 1
  `).get(workspaceId, userId, organizationId)
  return row ? toPersonalWorkspace(row) : null
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`)
  }
  return value
}

function requiredUsageText(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

export function recordUsageEvent(
  database: Database,
  input: RecordUsageEventInput,
): boolean {
  const eventId = requiredUsageText(input.eventId, 'eventId')
  const organizationId = requiredUsageText(input.organizationId, 'organizationId')
  const membershipId = requiredUsageText(input.membershipId, 'membershipId')
  const workspaceId = requiredUsageText(input.workspaceId, 'workspaceId')
  const sessionId = requiredUsageText(input.sessionId, 'sessionId')
  const sessionDisplayName = input.sessionDisplayName?.trim() || null
  const provider = requiredUsageText(input.provider, 'provider')
  const model = requiredUsageText(input.model, 'model')
  const inputTokens = nonNegativeInteger(input.inputTokens, 'inputTokens')
  const outputTokens = nonNegativeInteger(input.outputTokens, 'outputTokens')
  const cachedTokens = nonNegativeInteger(input.cachedTokens ?? 0, 'cachedTokens')
  const reasoningTokens = nonNegativeInteger(input.reasoningTokens ?? 0, 'reasoningTokens')
  const estimatedCostMicrousd = nonNegativeInteger(
    input.estimatedCostMicrousd ?? 0,
    'estimatedCostMicrousd',
  )
  const cacheSavingsMicrousd = nonNegativeInteger(
    input.cacheSavingsMicrousd ?? 0,
    'cacheSavingsMicrousd',
  )
  const occurredAt = nonNegativeInteger(input.occurredAt, 'occurredAt')
  const receivedAt = nonNegativeInteger(input.receivedAt ?? Date.now(), 'receivedAt')
  const durationMs = input.durationMs == null
    ? null
    : nonNegativeInteger(input.durationMs, 'durationMs')

  const result = database.prepare(`
    INSERT INTO usage_event (
      event_id, organization_id, membership_id, workspace_id, session_id,
      session_display_name, agent_id, provider, model, input_tokens, output_tokens, cached_tokens,
      reasoning_tokens, estimated_cost_microusd, cache_savings_microusd,
      duration_ms, outcome, occurred_at, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      session_display_name = COALESCE(
        excluded.session_display_name,
        usage_event.session_display_name
      ),
      estimated_cost_microusd = CASE
        WHEN usage_event.estimated_cost_microusd = 0
          THEN excluded.estimated_cost_microusd
        ELSE usage_event.estimated_cost_microusd
      END,
      cache_savings_microusd = CASE
        WHEN usage_event.cache_savings_microusd = 0
          THEN excluded.cache_savings_microusd
        ELSE usage_event.cache_savings_microusd
      END
    WHERE (excluded.session_display_name IS NOT NULL
          AND excluded.session_display_name IS NOT usage_event.session_display_name)
       OR (usage_event.estimated_cost_microusd = 0 AND excluded.estimated_cost_microusd > 0)
       OR (usage_event.cache_savings_microusd = 0 AND excluded.cache_savings_microusd > 0)
  `).run(
    eventId,
    organizationId,
    membershipId,
    workspaceId,
    sessionId,
    sessionDisplayName,
    input.agentId?.trim() || null,
    provider,
    model,
    inputTokens,
    outputTokens,
    cachedTokens,
    reasoningTokens,
    estimatedCostMicrousd,
    cacheSavingsMicrousd,
    durationMs,
    input.outcome ?? 'success',
    occurredAt,
    receivedAt,
  )
  return result.changes === 1
}

interface UsageTotalsRow {
  model_turns: number
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  reasoning_tokens: number
  estimated_cost_microusd: number
  cache_savings_microusd: number
}

function toUsageTotals(row?: UsageTotalsRow | null): UsageTotals {
  const inputTokens = row?.input_tokens ?? 0
  const outputTokens = row?.output_tokens ?? 0
  return {
    modelTurns: row?.model_turns ?? 0,
    inputTokens,
    outputTokens,
    cachedTokens: row?.cached_tokens ?? 0,
    reasoningTokens: row?.reasoning_tokens ?? 0,
    totalTokens: inputTokens + outputTokens,
    estimatedCostMicrousd: row?.estimated_cost_microusd ?? 0,
    cacheSavingsMicrousd: row?.cache_savings_microusd ?? 0,
  }
}

export function getPersonalUsageSummary(
  database: Database,
  { userId, organizationId, since, rangeDays }: UsageSummaryAccessOptions,
): PersonalUsageSummary {
  const membership = database.query<{ id: string }, [string, string]>(`
    SELECT id FROM member
    WHERE userId = ? AND organizationId = ?
    LIMIT 1
  `).get(userId, organizationId)
  if (!membership) throw new WorkspaceMembershipNotFoundError()

  const totals = database.query<UsageTotalsRow, [string, number]>(`
    SELECT COUNT(*) AS model_turns,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(estimated_cost_microusd), 0) AS estimated_cost_microusd,
      COALESCE(SUM(cache_savings_microusd), 0) AS cache_savings_microusd
    FROM usage_event WHERE membership_id = ? AND occurred_at >= ?
  `).get(membership.id, since)
  const sessions = database.query<UsageTotalsRow & {
    session_id: string
    session_display_name: string | null
    last_occurred_at: number
  }, [string, number]>(`
    SELECT session_id,
      COALESCE(MAX(session_display_name), session_id) AS session_display_name,
      COUNT(*) AS model_turns,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(estimated_cost_microusd), 0) AS estimated_cost_microusd,
      COALESCE(SUM(cache_savings_microusd), 0) AS cache_savings_microusd,
      MAX(occurred_at) AS last_occurred_at
    FROM usage_event
    WHERE membership_id = ? AND occurred_at >= ?
    GROUP BY session_id
    ORDER BY last_occurred_at DESC, session_id
    LIMIT 20
  `).all(membership.id, since)
  const models = database.query<UsageTotalsRow & {
    provider: string
    model: string
  }, [string, number]>(`
    SELECT provider, model, COUNT(*) AS model_turns,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(estimated_cost_microusd), 0) AS estimated_cost_microusd,
      COALESCE(SUM(cache_savings_microusd), 0) AS cache_savings_microusd
    FROM usage_event
    WHERE membership_id = ? AND occurred_at >= ?
    GROUP BY provider, model
    ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC, model
  `).all(membership.id, since)
  const timeline = database.query<UsageTotalsRow & { date: string }, [string, number]>(`
    SELECT strftime('%Y-%m-%d', occurred_at / 1000, 'unixepoch') AS date,
      COUNT(*) AS model_turns,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(estimated_cost_microusd), 0) AS estimated_cost_microusd,
      COALESCE(SUM(cache_savings_microusd), 0) AS cache_savings_microusd
    FROM usage_event
    WHERE membership_id = ? AND occurred_at >= ?
    GROUP BY date
    ORDER BY date
  `).all(membership.id, since)
  const modelTimeline = database.query<UsageTotalsRow & {
    date: string
    provider: string
    model: string
  }, [string, number]>(`
    SELECT strftime('%Y-%m-%d', occurred_at / 1000, 'unixepoch') AS date,
      provider, model, COUNT(*) AS model_turns,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(estimated_cost_microusd), 0) AS estimated_cost_microusd,
      COALESCE(SUM(cache_savings_microusd), 0) AS cache_savings_microusd
    FROM usage_event
    WHERE membership_id = ? AND occurred_at >= ?
    GROUP BY date, provider, model
    ORDER BY date, provider, model
  `).all(membership.id, since)

  return {
    organizationId,
    membershipId: membership.id,
    rangeDays,
    totals: toUsageTotals(totals),
    sessions: sessions.map(row => ({
      sessionId: row.session_id,
      displayName: row.session_display_name ?? row.session_id,
      lastOccurredAt: row.last_occurred_at,
      ...toUsageTotals(row),
    })),
    models: models.map(row => ({
      provider: row.provider,
      model: row.model,
      ...toUsageTotals(row),
    })),
    timeline: timeline.map(row => ({
      date: row.date,
      ...toUsageTotals(row),
    })),
    modelTimeline: modelTimeline.map(row => ({
      date: row.date,
      provider: row.provider,
      model: row.model,
      ...toUsageTotals(row),
    })),
  }
}

export function getOrganizationUsageSummary(
  database: Database,
  { userId, organizationId, since, rangeDays }: UsageSummaryAccessOptions,
): OrganizationUsageSummary {
  const actor = database.query<{ role: string }, [string, string]>(`
    SELECT role FROM member
    WHERE userId = ? AND organizationId = ?
    LIMIT 1
  `).get(userId, organizationId)
  if (!actor || !['owner', 'admin'].includes(actor.role)) {
    throw new UsageAccessDeniedError()
  }

  const totals = database.query<UsageTotalsRow, [string, number]>(`
    SELECT COUNT(*) AS model_turns,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(estimated_cost_microusd), 0) AS estimated_cost_microusd,
      COALESCE(SUM(cache_savings_microusd), 0) AS cache_savings_microusd
    FROM usage_event WHERE organization_id = ? AND occurred_at >= ?
  `).get(organizationId, since)
  const members = database.query<UsageTotalsRow & {
    membership_id: string
    user_id: string
    name: string
  }, [number, string]>(`
    SELECT member.id AS membership_id, member.userId AS user_id, user.name AS name,
      COUNT(usage_event.event_id) AS model_turns,
      COALESCE(SUM(usage_event.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(usage_event.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(usage_event.cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(usage_event.reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(usage_event.estimated_cost_microusd), 0) AS estimated_cost_microusd,
      COALESCE(SUM(usage_event.cache_savings_microusd), 0) AS cache_savings_microusd
    FROM member
    INNER JOIN user ON user.id = member.userId
    LEFT JOIN usage_event ON usage_event.membership_id = member.id
      AND usage_event.occurred_at >= ?
    WHERE member.organizationId = ?
    GROUP BY member.id, member.userId, user.name
    ORDER BY member.id
  `).all(since, organizationId)

  return {
    organizationId,
    rangeDays,
    totals: toUsageTotals(totals),
    members: members.map(row => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      name: row.name,
      ...toUsageTotals(row),
    })),
  }
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
