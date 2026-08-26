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
  {
    id: '0009_organization_control_plane',
    sql: `
      CREATE TABLE organization_join_code (
        organization_id TEXT PRIMARY KEY
          REFERENCES organization(id) ON DELETE CASCADE,
        lookup_key TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE organization_member_state (
        member_id TEXT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
        disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
        disabled_by TEXT REFERENCES user(id) ON DELETE SET NULL,
        disabled_at INTEGER,
        updated_at INTEGER NOT NULL,
        CHECK (
          (disabled = 0 AND disabled_at IS NULL)
          OR (disabled = 1 AND disabled_at IS NOT NULL)
        )
      );
    `,
  },
  {
    id: '0010_audit_event',
    sql: `
      CREATE TABLE audit_event (
        event_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL
          REFERENCES organization(id) ON DELETE RESTRICT,
        actor_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
        source_ip_hash TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        occurred_at INTEGER NOT NULL
      );

      CREATE INDEX audit_event_organization_time_idx
        ON audit_event(organization_id, occurred_at DESC, event_id DESC);
      CREATE INDEX audit_event_actor_time_idx
        ON audit_event(actor_user_id, occurred_at DESC);
      CREATE INDEX audit_event_target_idx
        ON audit_event(organization_id, target_type, target_id, occurred_at DESC);

      CREATE TRIGGER audit_event_update_guard
      BEFORE UPDATE ON audit_event
      BEGIN
        SELECT RAISE(ABORT, 'audit events are append-only');
      END;

      CREATE TRIGGER audit_event_delete_guard
      BEFORE DELETE ON audit_event
      BEGIN
        SELECT RAISE(ABORT, 'audit events are append-only');
      END;
    `,
  },
  {
    id: '0011_worker_host_registry',
    sql: `
      CREATE TABLE worker_host (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        region TEXT NOT NULL,
        base_url TEXT NOT NULL UNIQUE,
        credential_key_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        schedulable INTEGER NOT NULL DEFAULT 1 CHECK (schedulable IN (0, 1)),
        state TEXT NOT NULL DEFAULT 'unknown'
          CHECK (state IN ('unknown', 'healthy', 'draining', 'unavailable')),
        total_memory_bytes INTEGER NOT NULL CHECK (total_memory_bytes >= 0),
        reserved_memory_bytes INTEGER NOT NULL DEFAULT 0
          CHECK (reserved_memory_bytes >= 0 AND reserved_memory_bytes <= total_memory_bytes),
        total_cpu_millis INTEGER NOT NULL CHECK (total_cpu_millis >= 0),
        reserved_cpu_millis INTEGER NOT NULL DEFAULT 0
          CHECK (reserved_cpu_millis >= 0 AND reserved_cpu_millis <= total_cpu_millis),
        total_disk_bytes INTEGER NOT NULL CHECK (total_disk_bytes >= 0),
        reserved_disk_bytes INTEGER NOT NULL DEFAULT 0
          CHECK (reserved_disk_bytes >= 0 AND reserved_disk_bytes <= total_disk_bytes),
        total_workspace_slots INTEGER NOT NULL CHECK (total_workspace_slots >= 0),
        reserved_workspace_slots INTEGER NOT NULL DEFAULT 0
          CHECK (reserved_workspace_slots >= 0 AND reserved_workspace_slots <= total_workspace_slots),
        last_heartbeat_at INTEGER,
        last_error_code TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX worker_host_placement_idx
        ON worker_host(enabled, schedulable, state, last_heartbeat_at);

      ALTER TABLE workspace ADD COLUMN worker_host_id TEXT
        REFERENCES worker_host(id) ON DELETE RESTRICT;
      ALTER TABLE workspace ADD COLUMN reserved_memory_bytes INTEGER NOT NULL DEFAULT 0
        CHECK (reserved_memory_bytes >= 0);
      ALTER TABLE workspace ADD COLUMN reserved_cpu_millis INTEGER NOT NULL DEFAULT 0
        CHECK (reserved_cpu_millis >= 0);
      ALTER TABLE workspace ADD COLUMN reserved_disk_bytes INTEGER NOT NULL DEFAULT 0
        CHECK (reserved_disk_bytes >= 0);
      ALTER TABLE workspace ADD COLUMN reserved_workspace_slots INTEGER NOT NULL DEFAULT 0
        CHECK (reserved_workspace_slots >= 0);

      CREATE INDEX workspace_worker_host_id_idx ON workspace(worker_host_id);

      CREATE TRIGGER workspace_worker_assignment_immutable
      BEFORE UPDATE OF worker_host_id ON workspace
      FOR EACH ROW
      WHEN OLD.worker_host_id IS NOT NULL
        AND NEW.worker_host_id IS NOT OLD.worker_host_id
      BEGIN
        SELECT RAISE(ABORT, 'workspace worker assignment is immutable');
      END;

      CREATE TRIGGER workspace_worker_reservation_release
      AFTER DELETE ON workspace
      FOR EACH ROW
      WHEN OLD.worker_host_id IS NOT NULL
      BEGIN
        UPDATE worker_host
        SET reserved_memory_bytes = MAX(0, reserved_memory_bytes - OLD.reserved_memory_bytes),
            reserved_cpu_millis = MAX(0, reserved_cpu_millis - OLD.reserved_cpu_millis),
            reserved_disk_bytes = MAX(0, reserved_disk_bytes - OLD.reserved_disk_bytes),
            reserved_workspace_slots = MAX(0, reserved_workspace_slots - OLD.reserved_workspace_slots),
            updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
        WHERE id = OLD.worker_host_id;
      END;

      CREATE TABLE worker_health_sample (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_host_id TEXT NOT NULL REFERENCES worker_host(id) ON DELETE CASCADE,
        observed_at INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('healthy', 'unavailable')),
        reserved_memory_bytes INTEGER NOT NULL CHECK (reserved_memory_bytes >= 0),
        reserved_cpu_millis INTEGER NOT NULL CHECK (reserved_cpu_millis >= 0),
        reserved_disk_bytes INTEGER NOT NULL CHECK (reserved_disk_bytes >= 0),
        reserved_workspace_slots INTEGER NOT NULL CHECK (reserved_workspace_slots >= 0),
        error_code TEXT
      );

      CREATE INDEX worker_health_sample_host_time_idx
        ON worker_health_sample(worker_host_id, observed_at DESC);
    `,
  },
  {
    id: '0012_worker_health_reported_capacity',
    sql: `
      ALTER TABLE worker_health_sample
        ADD COLUMN total_memory_bytes INTEGER NOT NULL DEFAULT 0
        CHECK (total_memory_bytes >= 0);
      ALTER TABLE worker_health_sample
        ADD COLUMN total_cpu_millis INTEGER NOT NULL DEFAULT 0
        CHECK (total_cpu_millis >= 0);
      ALTER TABLE worker_health_sample
        ADD COLUMN total_disk_bytes INTEGER NOT NULL DEFAULT 0
        CHECK (total_disk_bytes >= 0);
      ALTER TABLE worker_health_sample
        ADD COLUMN total_workspace_slots INTEGER NOT NULL DEFAULT 0
        CHECK (total_workspace_slots >= 0);
    `,
  },
  {
    id: '0013_contact_request',
    sql: `
      CREATE TABLE contact_request (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        organization TEXT,
        topic TEXT NOT NULL
          CHECK (topic IN ('sales', 'support', 'security', 'partnerships', 'other')),
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new'
          CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
        notification_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (notification_status IN ('pending', 'sent', 'failed')),
        provider_message_id TEXT,
        source_hash TEXT NOT NULL,
        privacy_version TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX contact_request_source_time_idx
        ON contact_request(source_hash, created_at DESC);
      CREATE INDEX contact_request_email_time_idx
        ON contact_request(email, created_at DESC);
      CREATE INDEX contact_request_status_time_idx
        ON contact_request(status, created_at DESC);
    `,
  },
  {
    id: '0014_published_service',
    sql: `
      CREATE TABLE published_service (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL
          REFERENCES workspace(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        protocol TEXT NOT NULL DEFAULT 'http'
          CHECK (protocol = 'http'),
        target_port INTEGER NOT NULL
          CHECK (target_port BETWEEN 1024 AND 65535 AND target_port != 7777),
        state TEXT NOT NULL DEFAULT 'active'
          CHECK (state IN ('active', 'revoked')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revoked_at INTEGER,
        UNIQUE (workspace_id, name),
        CHECK (
          (state = 'active' AND revoked_at IS NULL)
          OR (state = 'revoked' AND revoked_at IS NOT NULL)
        )
      );

      CREATE INDEX published_service_workspace_state_idx
        ON published_service(workspace_id, state, created_at);
      CREATE INDEX published_service_slug_state_idx
        ON published_service(slug, state);
    `,
  },
  {
    id: '0015_published_service_access_expiry',
    sql: `
      CREATE TABLE published_service_next (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL
          REFERENCES workspace(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        protocol TEXT NOT NULL DEFAULT 'http'
          CHECK (protocol = 'http'),
        target_port INTEGER NOT NULL
          CHECK (target_port BETWEEN 1024 AND 65535 AND target_port != 7777),
        state TEXT NOT NULL DEFAULT 'active'
          CHECK (state IN ('active', 'revoked')),
        visibility TEXT NOT NULL
          CHECK (visibility IN ('public', 'private')),
        auth_policy TEXT NOT NULL
          CHECK (auth_policy IN ('none', 'token')),
        access_token_hash TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revoked_at INTEGER,
        UNIQUE (workspace_id, name),
        CHECK (expires_at > created_at),
        CHECK (
          (visibility = 'public' AND auth_policy = 'none' AND access_token_hash IS NULL)
          OR (
            visibility = 'private'
            AND auth_policy = 'token'
            AND length(access_token_hash) = 64
            AND access_token_hash NOT GLOB '*[^0-9a-f]*'
          )
        ),
        CHECK (
          (state = 'active' AND revoked_at IS NULL)
          OR (state = 'revoked' AND revoked_at IS NOT NULL)
        )
      );

      INSERT INTO published_service_next (
        id, workspace_id, name, slug, protocol, target_port, state,
        visibility, auth_policy, access_token_hash, expires_at,
        created_at, updated_at, revoked_at
      )
      SELECT
        id, workspace_id, name, slug, protocol, target_port, state,
        'public', 'none', NULL,
        MAX(created_at + 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000 + 86400000),
        created_at, updated_at, revoked_at
      FROM published_service;

      DROP TABLE published_service;
      ALTER TABLE published_service_next RENAME TO published_service;

      CREATE INDEX published_service_workspace_state_idx
        ON published_service(workspace_id, state, expires_at, created_at);
      CREATE INDEX published_service_slug_state_idx
        ON published_service(slug, state, expires_at);
    `,
  },
] as const

export type WorkspaceState = 'pending' | 'provisioning' | 'ready' | 'stopped' | 'failed'
export type ProvisioningJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type WorkerHostState = 'unknown' | 'healthy' | 'draining' | 'unavailable'

export interface PersonalWorkspace {
  id: string
  memberId: string
  organizationId: string
  workerWorkspaceId: string | null
  workerHostId: string | null
  reservedMemoryBytes: number
  reservedCpuMillis: number
  reservedDiskBytes: number
  reservedWorkspaceSlots: number
  state: WorkspaceState
  createdAt: number
  updatedAt: number
}

export interface WorkerHost {
  id: string
  name: string
  provider: string
  region: string
  baseURL: string
  credentialKeyId: string
  enabled: boolean
  schedulable: boolean
  state: WorkerHostState
  totalMemoryBytes: number
  reservedMemoryBytes: number
  totalCpuMillis: number
  reservedCpuMillis: number
  totalDiskBytes: number
  reservedDiskBytes: number
  totalWorkspaceSlots: number
  reservedWorkspaceSlots: number
  lastHeartbeatAt: number | null
  lastErrorCode: string | null
  createdAt: number
  updatedAt: number
}

export interface RegisterWorkerHostInput {
  id: string
  name: string
  provider: string
  region: string
  baseURL: string
  credentialKeyId: string
  totalMemoryBytes: number
  totalCpuMillis: number
  totalDiskBytes: number
  totalWorkspaceSlots: number
  enabled?: boolean
  schedulable?: boolean
  now?: () => number
}

export interface RecordWorkerHealthInput {
  workerHostId: string
  state: Extract<WorkerHostState, 'healthy' | 'unavailable'>
  errorCode?: string | null
  heartbeatObserved?: boolean
  capacity?: {
    totalMemoryBytes: number
    reservedMemoryBytes: number
    totalCpuMillis: number
    reservedCpuMillis: number
    totalDiskBytes: number
    reservedDiskBytes: number
    totalWorkspaceSlots: number
    reservedWorkspaceSlots: number
  }
  now?: () => number
}

export interface WorkerPlacementRequirements {
  memoryBytes: number
  cpuMillis: number
  diskBytes: number
  workspaceSlots?: number
}

export interface AssignWorkspaceWorkerOptions {
  workspaceId: string
  requirements: WorkerPlacementRequirements
  heartbeatMaxAgeMs?: number
  now?: () => number
}

export interface WorkerPlacementAssignment {
  workspace: PersonalWorkspace
  workerHost: WorkerHost
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

export type OrganizationRole = 'owner' | 'admin' | 'member'

export interface OrganizationMemberSummary {
  membershipId: string
  userId: string
  name: string
  email: string
  role: OrganizationRole
  disabled: boolean
  joinedAt: number
}

export interface OrganizationOperatorSummary {
  workspaceId: string | null
  membershipId: string
  name: string
  email: string
  state: WorkspaceState | 'not_created'
  disabled: boolean
  createdAt: number | null
  updatedAt: number | null
}

export interface OrganizationAdminSummary {
  organizationId: string
  name: string
  slug: string
  actorRole: OrganizationRole
  joinCodeLookupKey: string | null
  admins: OrganizationMemberSummary[]
}

export interface UsageSummaryAccessOptions {
  userId: string
  organizationId: string
  since: number
  rangeDays: 7 | 30 | 90
}

export interface OrganizationAccessOptions {
  userId: string
  organizationId: string
}

export type AuditEventResult = 'success' | 'failure'
export type AuditMetadataValue = string | number | boolean | null

export interface AuditEvent {
  eventId: string
  organizationId: string
  actorUserId: string
  action: string
  targetType: string
  targetId: string
  result: AuditEventResult
  sourceIpHash: string | null
  metadata: Record<string, AuditMetadataValue>
  occurredAt: number
}

export interface RecordAuditEventOptions extends OrganizationAccessOptions {
  eventId?: string
  action: string
  targetType: string
  targetId: string
  result?: AuditEventResult
  sourceIpHash?: string | null
  metadata?: Record<string, AuditMetadataValue>
  now?: () => number
}

export interface ListOrganizationAuditEventsOptions extends OrganizationAccessOptions {
  limit?: number
  before?: number | null
}

export type ContactTopic = 'sales' | 'support' | 'security' | 'partnerships' | 'other'
export type ContactRequestStatus = 'new' | 'contacted' | 'qualified' | 'closed'
export type ContactNotificationStatus = 'pending' | 'sent' | 'failed'

export interface ContactRequest {
  id: string
  name: string
  email: string
  organization: string | null
  topic: ContactTopic
  message: string
  status: ContactRequestStatus
  notificationStatus: ContactNotificationStatus
  providerMessageId: string | null
  sourceHash: string
  privacyVersion: string
  createdAt: number
  updatedAt: number
}

export type PublishedServiceState = 'active' | 'revoked'
export type PublishedServiceVisibility = 'public' | 'private'
export type PublishedServiceAuthPolicy = 'none' | 'token'

export const publishedServiceMinimumTTLSeconds = 5 * 60
export const publishedServiceDefaultTTLSeconds = 24 * 60 * 60
export const publishedServiceMaximumTTLSeconds = 7 * 24 * 60 * 60

export interface PublishedService {
  id: string
  workspaceId: string
  name: string
  slug: string
  protocol: 'http'
  targetPort: number
  state: PublishedServiceState
  visibility: PublishedServiceVisibility
  authPolicy: PublishedServiceAuthPolicy
  accessTokenHash: string | null
  expiresAt: number
  createdAt: number
  updatedAt: number
  revokedAt: number | null
}

export interface WorkspaceOwnerIdentity {
  workspaceId: string
  userId: string
  organizationId: string
}

export class PublishedServiceLimitError extends Error {
  readonly code = 'published_service_limit_reached'

  constructor() {
    super('Published service limit reached')
    this.name = 'PublishedServiceLimitError'
  }
}

export interface CreateContactRequestInput {
  id: string
  name: string
  email: string
  organization?: string | null
  topic: ContactTopic
  message: string
  sourceHash: string
  privacyVersion: string
  now?: () => number
  windowMs?: number
  maximumPerSource?: number
  maximumPerEmail?: number
}

export interface ContactRequestCursor {
  createdAt: number
  id: string
}

export interface ListContactRequestsOptions {
  status?: ContactRequestStatus
  limit?: number
  before?: ContactRequestCursor | null
}

export class ContactRateLimitError extends Error {
  readonly code = 'contact_rate_limited'

  constructor() {
    super('Too many contact requests')
    this.name = 'ContactRateLimitError'
  }
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

export class OrganizationAccessDeniedError extends Error {
  readonly code = 'organization_access_denied'

  constructor() {
    super('The user cannot administer this organization')
    this.name = 'OrganizationAccessDeniedError'
  }
}

export class OrganizationMemberMutationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'OrganizationMemberMutationError'
    this.code = code
  }
}

interface WorkspaceRow {
  id: string
  member_id: string
  organization_id: string
  worker_workspace_id: string | null
  worker_host_id: string | null
  reserved_memory_bytes: number
  reserved_cpu_millis: number
  reserved_disk_bytes: number
  reserved_workspace_slots: number
  state: WorkspaceState
  created_at: number
  updated_at: number
}

interface WorkerHostRow {
  id: string
  name: string
  provider: string
  region: string
  base_url: string
  credential_key_id: string
  enabled: number
  schedulable: number
  state: WorkerHostState
  total_memory_bytes: number
  reserved_memory_bytes: number
  total_cpu_millis: number
  reserved_cpu_millis: number
  total_disk_bytes: number
  reserved_disk_bytes: number
  total_workspace_slots: number
  reserved_workspace_slots: number
  last_heartbeat_at: number | null
  last_error_code: string | null
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

interface ContactRequestRow {
  id: string
  name: string
  email: string
  organization: string | null
  topic: ContactTopic
  message: string
  status: ContactRequestStatus
  notification_status: ContactNotificationStatus
  provider_message_id: string | null
  source_hash: string
  privacy_version: string
  created_at: number
  updated_at: number
}

interface PublishedServiceRow {
  id: string
  workspace_id: string
  name: string
  slug: string
  protocol: 'http'
  target_port: number
  state: PublishedServiceState
  visibility: PublishedServiceVisibility
  auth_policy: PublishedServiceAuthPolicy
  access_token_hash: string | null
  expires_at: number
  created_at: number
  updated_at: number
  revoked_at: number | null
}

function toPersonalWorkspace(row: WorkspaceRow): PersonalWorkspace {
  return {
    id: row.id,
    memberId: row.member_id,
    organizationId: row.organization_id,
    workerWorkspaceId: row.worker_workspace_id,
    workerHostId: row.worker_host_id,
    reservedMemoryBytes: row.reserved_memory_bytes,
    reservedCpuMillis: row.reserved_cpu_millis,
    reservedDiskBytes: row.reserved_disk_bytes,
    reservedWorkspaceSlots: row.reserved_workspace_slots,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toWorkerHost(row: WorkerHostRow): WorkerHost {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    region: row.region,
    baseURL: row.base_url,
    credentialKeyId: row.credential_key_id,
    enabled: row.enabled === 1,
    schedulable: row.schedulable === 1,
    state: row.state,
    totalMemoryBytes: row.total_memory_bytes,
    reservedMemoryBytes: row.reserved_memory_bytes,
    totalCpuMillis: row.total_cpu_millis,
    reservedCpuMillis: row.reserved_cpu_millis,
    totalDiskBytes: row.total_disk_bytes,
    reservedDiskBytes: row.reserved_disk_bytes,
    totalWorkspaceSlots: row.total_workspace_slots,
    reservedWorkspaceSlots: row.reserved_workspace_slots,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastErrorCode: row.last_error_code,
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

function toContactRequest(row: ContactRequestRow): ContactRequest {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organization: row.organization,
    topic: row.topic,
    message: row.message,
    status: row.status,
    notificationStatus: row.notification_status,
    providerMessageId: row.provider_message_id,
    sourceHash: row.source_hash,
    privacyVersion: row.privacy_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPublishedService(row: PublishedServiceRow): PublishedService {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    protocol: row.protocol,
    targetPort: row.target_port,
    state: row.state,
    visibility: row.visibility,
    authPolicy: row.auth_policy,
    accessTokenHash: row.access_token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
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

function publishedServiceName(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(normalized)) {
    throw new Error('Published service name is invalid')
  }
  return normalized
}

function publishedServiceText(value: string, field: string, maximum = 128): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${field} is invalid`)
  }
  return normalized
}

function publishedServicePort(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1024 || value > 65535 || value === 7777) {
    throw new Error('Published service port is invalid')
  }
  return value
}

export function getWorkspaceOwnerIdentity(
  database: Database,
  workspaceId: string,
): WorkspaceOwnerIdentity | null {
  const row = database.query<{
    workspace_id: string
    user_id: string
    organization_id: string
  }, [string]>(`
    SELECT
      workspace.id AS workspace_id,
      member.userId AS user_id,
      workspace.organization_id
    FROM workspace
    INNER JOIN member ON member.id = workspace.member_id
    LEFT JOIN organization_member_state AS member_state
      ON member_state.member_id = member.id
    WHERE workspace.id = ?
      AND member.organizationId = workspace.organization_id
      AND COALESCE(member_state.disabled, 0) = 0
    LIMIT 1
  `).get(workspaceId.trim())
  return row
    ? {
        workspaceId: row.workspace_id,
        userId: row.user_id,
        organizationId: row.organization_id,
      }
    : null
}

export function getPublishedServiceBySlug(
  database: Database,
  slug: string,
  now: number = Date.now(),
): PublishedService | null {
  const row = database.query<PublishedServiceRow, [string, number]>(`
    SELECT published_service.*
    FROM published_service
    INNER JOIN workspace ON workspace.id = published_service.workspace_id
    INNER JOIN member ON member.id = workspace.member_id
    LEFT JOIN organization_member_state AS member_state
      ON member_state.member_id = member.id
    WHERE published_service.slug = ?
      AND published_service.state = 'active'
      AND published_service.expires_at > ?
      AND workspace.state = 'ready'
      AND member.organizationId = workspace.organization_id
      AND COALESCE(member_state.disabled, 0) = 0
    LIMIT 1
  `).get(slug.trim(), now)
  return row ? toPublishedService(row) : null
}

export function listPublishedServices(
  database: Database,
  workspaceId: string,
  now: number = Date.now(),
): PublishedService[] {
  return database.query<PublishedServiceRow, [string, number]>(`
    SELECT * FROM published_service
    WHERE workspace_id = ? AND state = 'active' AND expires_at > ?
    ORDER BY created_at, name
  `).all(workspaceId.trim(), now).map(toPublishedService)
}

export function upsertPublishedService(
  database: Database,
  input: {
    id: string
    workspaceId: string
    name: string
    slug: string
    targetPort: number
    visibility: PublishedServiceVisibility
    authPolicy: PublishedServiceAuthPolicy
    accessTokenHash?: string | null
    expiresAt: number
    maximumActive?: number
    now?: () => number
  },
): PublishedService {
  const id = publishedServiceText(input.id, 'Published service id')
  const workspaceId = publishedServiceText(input.workspaceId, 'Workspace id')
  const name = publishedServiceName(input.name)
  const slug = publishedServiceText(input.slug, 'Published service slug')
  const targetPort = publishedServicePort(input.targetPort)
  const visibility = input.visibility
  const authPolicy = input.authPolicy
  const accessTokenHash = input.accessTokenHash?.trim() || null
  const maximumActive = input.maximumActive ?? 5
  if (!Number.isSafeInteger(maximumActive) || maximumActive < 1 || maximumActive > 100) {
    throw new Error('Published service limit is invalid')
  }

  return database.transaction(() => {
    const workspace = getWorkspaceById(database, workspaceId)
    if (!workspace) throw new Error('Workspace was not found')
    const existing = database.query<PublishedServiceRow, [string, string]>(`
      SELECT * FROM published_service
      WHERE workspace_id = ? AND name = ?
      LIMIT 1
    `).get(workspaceId, name)
    const timestamp = (input.now ?? Date.now)()
    if (!Number.isSafeInteger(input.expiresAt)) {
      throw new Error('Published service expiry is invalid')
    }
    const ttlMs = input.expiresAt - timestamp
    if (
      ttlMs < publishedServiceMinimumTTLSeconds * 1000
      || ttlMs > publishedServiceMaximumTTLSeconds * 1000
    ) {
      throw new Error('Published service TTL is invalid')
    }
    if (
      (visibility === 'public' && (authPolicy !== 'none' || accessTokenHash !== null))
      || (
        visibility === 'private'
        && (authPolicy !== 'token' || !/^[a-f0-9]{64}$/.test(accessTokenHash ?? ''))
      )
    ) {
      throw new Error('Published service access policy is invalid')
    }
    if (visibility !== 'public' && visibility !== 'private') {
      throw new Error('Published service visibility is invalid')
    }
    if (!existing || existing.state !== 'active' || existing.expires_at <= timestamp) {
      const active = database.query<{ count: number }, [string, number]>(`
        SELECT COUNT(*) AS count FROM published_service
        WHERE workspace_id = ? AND state = 'active' AND expires_at > ?
      `).get(workspaceId, timestamp)?.count ?? 0
      if (active >= maximumActive) throw new PublishedServiceLimitError()
    }

    database.prepare(`
      INSERT INTO published_service (
        id, workspace_id, name, slug, protocol, target_port, state,
        visibility, auth_policy, access_token_hash, expires_at,
        created_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, 'http', ?, 'active', ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(workspace_id, name) DO UPDATE SET
        target_port = excluded.target_port,
        state = 'active',
        visibility = excluded.visibility,
        auth_policy = excluded.auth_policy,
        access_token_hash = excluded.access_token_hash,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at,
        revoked_at = NULL
    `).run(
      id, workspaceId, name, slug, targetPort,
      visibility, authPolicy, accessTokenHash, input.expiresAt,
      timestamp, timestamp,
    )
    const service = database.query<PublishedServiceRow, [string, string]>(`
      SELECT * FROM published_service
      WHERE workspace_id = ? AND name = ?
      LIMIT 1
    `).get(workspaceId, name)
    if (!service) throw new Error('Published service could not be resolved')
    return toPublishedService(service)
  }).immediate()
}

export function revokePublishedService(
  database: Database,
  input: { workspaceId: string; name: string; now?: () => number },
): PublishedService | null {
  const workspaceId = publishedServiceText(input.workspaceId, 'Workspace id')
  const name = publishedServiceName(input.name)
  const existing = database.query<PublishedServiceRow, [string, string]>(`
    SELECT * FROM published_service
    WHERE workspace_id = ? AND name = ?
    LIMIT 1
  `).get(workspaceId, name)
  if (!existing) return null
  if (existing.state === 'active') {
    const timestamp = (input.now ?? Date.now)()
    database.prepare(`
      UPDATE published_service
      SET state = 'revoked', updated_at = ?, revoked_at = ?
      WHERE workspace_id = ? AND name = ?
    `).run(timestamp, timestamp, workspaceId, name)
  }
  const service = database.query<PublishedServiceRow, [string, string]>(`
    SELECT * FROM published_service
    WHERE workspace_id = ? AND name = ?
    LIMIT 1
  `).get(workspaceId, name)
  return service ? toPublishedService(service) : null
}

function boundedContactText(
  value: string,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const normalized = value.trim()
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${field} must contain between ${minimum} and ${maximum} characters`)
  }
  return normalized
}

export function getContactRequestById(
  database: Database,
  requestId: string,
): ContactRequest | null {
  const row = database.query<ContactRequestRow, [string]>(
    'SELECT * FROM contact_request WHERE id = ?',
  ).get(requestId)
  return row ? toContactRequest(row) : null
}

export function createContactRequest(
  database: Database,
  input: CreateContactRequestInput,
): { request: ContactRequest; created: boolean } {
  const id = boundedContactText(input.id, 'id', 1, 128)
  const name = boundedContactText(input.name, 'name', 1, 120)
  const email = boundedContactText(input.email, 'email', 3, 254).toLowerCase()
  const organization = input.organization?.trim().slice(0, 160) || null
  const message = boundedContactText(input.message, 'message', 10, 4000)
  const sourceHash = boundedContactText(input.sourceHash, 'sourceHash', 16, 128)
  const privacyVersion = boundedContactText(
    input.privacyVersion,
    'privacyVersion',
    1,
    64,
  )
  const now = input.now ?? Date.now
  const windowMs = input.windowMs ?? 60 * 60 * 1000
  const maximumPerSource = input.maximumPerSource ?? 5
  const maximumPerEmail = input.maximumPerEmail ?? 3
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error('Contact rate-limit window must be a positive integer')
  }
  if (!Number.isSafeInteger(maximumPerSource) || maximumPerSource <= 0) {
    throw new Error('Contact source limit must be a positive integer')
  }
  if (!Number.isSafeInteger(maximumPerEmail) || maximumPerEmail <= 0) {
    throw new Error('Contact email limit must be a positive integer')
  }

  return database.transaction(() => {
    const existing = getContactRequestById(database, id)
    if (existing) return { request: existing, created: false }

    const timestamp = now()
    const since = timestamp - windowMs
    const counts = database.query<{
      source_count: number
      email_count: number
    }, [string, number, string, number]>(`
      SELECT
        (SELECT COUNT(*) FROM contact_request
          WHERE source_hash = ? AND created_at >= ?) AS source_count,
        (SELECT COUNT(*) FROM contact_request
          WHERE email = ? AND created_at >= ?) AS email_count
    `).get(sourceHash, since, email, since)
    if (
      (counts?.source_count ?? 0) >= maximumPerSource
      || (counts?.email_count ?? 0) >= maximumPerEmail
    ) {
      throw new ContactRateLimitError()
    }

    database.prepare(`
      INSERT INTO contact_request (
        id, name, email, organization, topic, message, source_hash,
        privacy_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      email,
      organization,
      input.topic,
      message,
      sourceHash,
      privacyVersion,
      timestamp,
      timestamp,
    )
    const request = getContactRequestById(database, id)
    if (!request) throw new Error('Contact request could not be resolved')
    return { request, created: true }
  }).immediate()
}

export function setContactNotificationResult(
  database: Database,
  input: {
    requestId: string
    status: Extract<ContactNotificationStatus, 'sent' | 'failed'>
    providerMessageId?: string | null
    now?: () => number
  },
): ContactRequest {
  const result = database.prepare(`
    UPDATE contact_request
    SET notification_status = ?,
        provider_message_id = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    input.status,
    input.providerMessageId?.trim() || null,
    (input.now ?? Date.now)(),
    input.requestId,
  )
  if (result.changes !== 1) throw new Error('Contact request was not found')
  const request = getContactRequestById(database, input.requestId)
  if (!request) throw new Error('Contact request disappeared')
  return request
}

export function listContactRequests(
  database: Database,
  options: ListContactRequestsOptions = {},
): { requests: ContactRequest[]; nextCursor: ContactRequestCursor | null } {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200)
  const before = options.before ?? null
  const rows = options.status
    ? database.query<ContactRequestRow, [ContactRequestStatus, number, number, string, number]>(`
        SELECT *
        FROM contact_request
        WHERE status = ?
          AND (created_at < ? OR (created_at = ? AND id < ?))
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(
        options.status,
        before?.createdAt ?? Number.MAX_SAFE_INTEGER,
        before?.createdAt ?? Number.MAX_SAFE_INTEGER,
        before?.id ?? '\uffff',
        limit + 1,
      )
    : database.query<ContactRequestRow, [number, number, string, number]>(`
        SELECT *
        FROM contact_request
        WHERE created_at < ? OR (created_at = ? AND id < ?)
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(
        before?.createdAt ?? Number.MAX_SAFE_INTEGER,
        before?.createdAt ?? Number.MAX_SAFE_INTEGER,
        before?.id ?? '\uffff',
        limit + 1,
      )
  const hasMore = rows.length > limit
  const requests = rows.slice(0, limit).map(toContactRequest)
  const last = hasMore ? requests.at(-1) : undefined
  return {
    requests,
    nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
  }
}

export function updateContactRequestStatus(
  database: Database,
  input: {
    requestId: string
    status: ContactRequestStatus
    now?: () => number
  },
): ContactRequest | null {
  if (!['new', 'contacted', 'qualified', 'closed'].includes(input.status)) {
    throw new Error('Contact request status is invalid')
  }
  const result = database.prepare(`
    UPDATE contact_request
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).run(input.status, (input.now ?? Date.now)(), input.requestId)
  if (result.changes !== 1) return null
  return getContactRequestById(database, input.requestId)
}

export function deleteContactRequestsCreatedBefore(
  database: Database,
  before: number,
): number {
  if (!Number.isSafeInteger(before) || before < 0) {
    throw new Error('Contact retention cutoff must be a non-negative safe integer')
  }
  return Number(database.prepare(
    'DELETE FROM contact_request WHERE created_at < ?',
  ).run(before).changes)
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
      worker_host_id,
      reserved_memory_bytes,
      reserved_cpu_millis,
      reserved_disk_bytes,
      reserved_workspace_slots,
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
      workspace.worker_host_id,
      workspace.reserved_memory_bytes,
      workspace.reserved_cpu_millis,
      workspace.reserved_disk_bytes,
      workspace.reserved_workspace_slots,
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

// Internal control-plane lookup. Authorization must happen before this helper
// is used for a browser-originated operation.
export function getWorkspaceById(
  database: Database,
  workspaceId: string,
): PersonalWorkspace | null {
  const row = database.query<WorkspaceRow, [string]>(
    'SELECT * FROM workspace WHERE id = ?',
  ).get(workspaceId)
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

function requiredWorkerText(value: string, field: string, maximum = 160): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required`)
  if (normalized.length > maximum) throw new Error(`${field} is too long`)
  return normalized
}

export function upsertWorkerHost(
  database: Database,
  input: RegisterWorkerHostInput,
): WorkerHost {
  const id = requiredWorkerText(input.id, 'id', 128)
  const name = requiredWorkerText(input.name, 'name', 128)
  const provider = requiredWorkerText(input.provider, 'provider', 64)
  const region = requiredWorkerText(input.region, 'region', 64)
  const baseURL = requiredWorkerText(input.baseURL, 'baseURL', 512).replace(/\/$/, '')
  const credentialKeyId = requiredWorkerText(
    input.credentialKeyId,
    'credentialKeyId',
    128,
  )
  const totalMemoryBytes = nonNegativeInteger(input.totalMemoryBytes, 'totalMemoryBytes')
  const totalCpuMillis = nonNegativeInteger(input.totalCpuMillis, 'totalCpuMillis')
  const totalDiskBytes = nonNegativeInteger(input.totalDiskBytes, 'totalDiskBytes')
  const totalWorkspaceSlots = nonNegativeInteger(
    input.totalWorkspaceSlots,
    'totalWorkspaceSlots',
  )
  if (totalWorkspaceSlots === 0) throw new Error('totalWorkspaceSlots must be positive')
  const existing = getWorkerHost(database, id)
  if (
    existing
    && (
      totalMemoryBytes < existing.reservedMemoryBytes
      || totalCpuMillis < existing.reservedCpuMillis
      || totalDiskBytes < existing.reservedDiskBytes
      || totalWorkspaceSlots < existing.reservedWorkspaceSlots
    )
  ) {
    throw new Error('Worker capacity cannot be lower than its current reservations')
  }
  let parsedURL: URL
  try {
    parsedURL = new URL(baseURL)
  } catch {
    throw new Error('baseURL must be an absolute URL')
  }
  if (!['http:', 'https:'].includes(parsedURL.protocol)) {
    throw new Error('baseURL must use HTTP or HTTPS')
  }
  const timestamp = (input.now ?? Date.now)()
  database.prepare(`
    INSERT INTO worker_host (
      id, name, provider, region, base_url, credential_key_id,
      enabled, schedulable, state,
      total_memory_bytes, total_cpu_millis, total_disk_bytes,
      total_workspace_slots, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unknown', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      provider = excluded.provider,
      region = excluded.region,
      base_url = excluded.base_url,
      credential_key_id = excluded.credential_key_id,
      enabled = excluded.enabled,
      schedulable = excluded.schedulable,
      total_memory_bytes = excluded.total_memory_bytes,
      total_cpu_millis = excluded.total_cpu_millis,
      total_disk_bytes = excluded.total_disk_bytes,
      total_workspace_slots = excluded.total_workspace_slots,
      updated_at = excluded.updated_at
  `).run(
    id,
    name,
    provider,
    region,
    baseURL,
    credentialKeyId,
    input.enabled === false ? 0 : 1,
    input.schedulable === false ? 0 : 1,
    totalMemoryBytes,
    totalCpuMillis,
    totalDiskBytes,
    totalWorkspaceSlots,
    timestamp,
    timestamp,
  )
  const workerHost = database.query<WorkerHostRow, [string]>(
    'SELECT * FROM worker_host WHERE id = ?',
  ).get(id)
  if (!workerHost) throw new Error('Worker host could not be resolved')
  return toWorkerHost(workerHost)
}

export function getWorkerHost(database: Database, workerHostId: string): WorkerHost | null {
  const row = database.query<WorkerHostRow, [string]>(
    'SELECT * FROM worker_host WHERE id = ?',
  ).get(workerHostId)
  return row ? toWorkerHost(row) : null
}

export function listWorkerHosts(database: Database): WorkerHost[] {
  return database.query<WorkerHostRow, []>(
    'SELECT * FROM worker_host ORDER BY name, id',
  ).all().map(toWorkerHost)
}

export function setWorkerHostScheduling(
  database: Database,
  {
    workerHostId,
    enabled,
    schedulable,
    state,
    now = Date.now,
  }: {
    workerHostId: string
    enabled?: boolean
    schedulable?: boolean
    state?: WorkerHostState
    now?: () => number
  },
): WorkerHost {
  const result = database.prepare(`
    UPDATE worker_host
    SET enabled = COALESCE(?, enabled),
        schedulable = COALESCE(?, schedulable),
        state = COALESCE(?, state),
        updated_at = ?
    WHERE id = ?
  `).run(
    enabled === undefined ? null : enabled ? 1 : 0,
    schedulable === undefined ? null : schedulable ? 1 : 0,
    state ?? null,
    now(),
    workerHostId,
  )
  if (result.changes !== 1) throw new Error('Worker host was not found')
  const workerHost = getWorkerHost(database, workerHostId)
  if (!workerHost) throw new Error('Worker host disappeared')
  return workerHost
}

export function recordWorkerHealth(
  database: Database,
  input: RecordWorkerHealthInput,
): WorkerHost {
  const timestamp = (input.now ?? Date.now)()
  const heartbeatObserved = input.heartbeatObserved ?? true
  const errorCode = input.errorCode?.trim().slice(0, 64) || null
  const reportedCapacity = input.capacity
    ? {
        totalMemoryBytes: nonNegativeInteger(input.capacity.totalMemoryBytes, 'totalMemoryBytes'),
        reservedMemoryBytes: nonNegativeInteger(input.capacity.reservedMemoryBytes, 'reservedMemoryBytes'),
        totalCpuMillis: nonNegativeInteger(input.capacity.totalCpuMillis, 'totalCpuMillis'),
        reservedCpuMillis: nonNegativeInteger(input.capacity.reservedCpuMillis, 'reservedCpuMillis'),
        totalDiskBytes: nonNegativeInteger(input.capacity.totalDiskBytes, 'totalDiskBytes'),
        reservedDiskBytes: nonNegativeInteger(input.capacity.reservedDiskBytes, 'reservedDiskBytes'),
        totalWorkspaceSlots: nonNegativeInteger(input.capacity.totalWorkspaceSlots, 'totalWorkspaceSlots'),
        reservedWorkspaceSlots: nonNegativeInteger(input.capacity.reservedWorkspaceSlots, 'reservedWorkspaceSlots'),
      }
    : null
  return database.transaction(() => {
    const result = database.prepare(`
      UPDATE worker_host
      SET state = CASE WHEN state = 'draining' THEN state ELSE ? END,
          last_heartbeat_at = CASE WHEN ? THEN ? ELSE last_heartbeat_at END,
          last_error_code = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      input.state,
      heartbeatObserved ? 1 : 0,
      timestamp,
      errorCode,
      timestamp,
      input.workerHostId,
    )
    if (result.changes !== 1) throw new Error('Worker host was not found')
    const host = database.query<WorkerHostRow, [string]>(
      'SELECT * FROM worker_host WHERE id = ?',
    ).get(input.workerHostId)
    if (!host) throw new Error('Worker host disappeared')
    database.prepare(`
      INSERT INTO worker_health_sample (
        worker_host_id, observed_at, state,
        reserved_memory_bytes, reserved_cpu_millis, reserved_disk_bytes,
        reserved_workspace_slots, error_code,
        total_memory_bytes, total_cpu_millis, total_disk_bytes,
        total_workspace_slots
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      host.id,
      timestamp,
      input.state,
      reportedCapacity?.reservedMemoryBytes ?? host.reserved_memory_bytes,
      reportedCapacity?.reservedCpuMillis ?? host.reserved_cpu_millis,
      reportedCapacity?.reservedDiskBytes ?? host.reserved_disk_bytes,
      reportedCapacity?.reservedWorkspaceSlots ?? host.reserved_workspace_slots,
      errorCode,
      reportedCapacity?.totalMemoryBytes ?? host.total_memory_bytes,
      reportedCapacity?.totalCpuMillis ?? host.total_cpu_millis,
      reportedCapacity?.totalDiskBytes ?? host.total_disk_bytes,
      reportedCapacity?.totalWorkspaceSlots ?? host.total_workspace_slots,
    )
    database.prepare(`
      DELETE FROM worker_health_sample
      WHERE worker_host_id = ?
        AND id NOT IN (
          SELECT id
          FROM worker_health_sample
          WHERE worker_host_id = ?
          ORDER BY observed_at DESC, id DESC
          LIMIT 1000
        )
    `).run(host.id, host.id)
    return toWorkerHost(host)
  }).immediate()
}

export function assignWorkspaceWorker(
  database: Database,
  {
    workspaceId,
    requirements,
    heartbeatMaxAgeMs = 30000,
    now = Date.now,
  }: AssignWorkspaceWorkerOptions,
): WorkerPlacementAssignment {
  const memoryBytes = nonNegativeInteger(requirements.memoryBytes, 'memoryBytes')
  const cpuMillis = nonNegativeInteger(requirements.cpuMillis, 'cpuMillis')
  const diskBytes = nonNegativeInteger(requirements.diskBytes, 'diskBytes')
  const workspaceSlots = nonNegativeInteger(
    requirements.workspaceSlots ?? 1,
    'workspaceSlots',
  )
  if (workspaceSlots === 0) throw new Error('workspaceSlots must be positive')
  if (!Number.isFinite(heartbeatMaxAgeMs) || heartbeatMaxAgeMs < 0) {
    throw new Error('heartbeatMaxAgeMs must be non-negative')
  }

  const findWorkspace = database.query<WorkspaceRow, [string]>(
    'SELECT * FROM workspace WHERE id = ?',
  )
  const findWorker = database.query<WorkerHostRow, [string]>(
    'SELECT * FROM worker_host WHERE id = ?',
  )
  const findCandidate = database.query<WorkerHostRow, [number, number, number, number, number]>(`
    SELECT *
    FROM worker_host
    WHERE enabled = 1
      AND schedulable = 1
      AND state = 'healthy'
      AND last_heartbeat_at >= ?
      AND total_memory_bytes - reserved_memory_bytes >= ?
      AND total_cpu_millis - reserved_cpu_millis >= ?
      AND total_disk_bytes - reserved_disk_bytes >= ?
      AND total_workspace_slots - reserved_workspace_slots >= ?
    ORDER BY
      CAST(reserved_workspace_slots AS REAL) / total_workspace_slots,
      CASE WHEN total_memory_bytes = 0 THEN 0
        ELSE CAST(reserved_memory_bytes AS REAL) / total_memory_bytes END,
      CASE WHEN total_cpu_millis = 0 THEN 0
        ELSE CAST(reserved_cpu_millis AS REAL) / total_cpu_millis END,
      CASE WHEN total_disk_bytes = 0 THEN 0
        ELSE CAST(reserved_disk_bytes AS REAL) / total_disk_bytes END,
      id
    LIMIT 1
  `)
  const reserve = database.prepare(`
    UPDATE worker_host
    SET reserved_memory_bytes = reserved_memory_bytes + ?,
        reserved_cpu_millis = reserved_cpu_millis + ?,
        reserved_disk_bytes = reserved_disk_bytes + ?,
        reserved_workspace_slots = reserved_workspace_slots + ?,
        updated_at = ?
    WHERE id = ?
      AND total_memory_bytes - reserved_memory_bytes >= ?
      AND total_cpu_millis - reserved_cpu_millis >= ?
      AND total_disk_bytes - reserved_disk_bytes >= ?
      AND total_workspace_slots - reserved_workspace_slots >= ?
  `)
  const assign = database.prepare(`
    UPDATE workspace
    SET worker_host_id = ?,
        reserved_memory_bytes = ?,
        reserved_cpu_millis = ?,
        reserved_disk_bytes = ?,
        reserved_workspace_slots = ?,
        updated_at = ?
    WHERE id = ? AND worker_host_id IS NULL
  `)

  return database.transaction(() => {
    const workspace = findWorkspace.get(workspaceId)
    if (!workspace) throw new Error('Workspace was not found')
    if (workspace.worker_host_id) {
      const assignedHost = findWorker.get(workspace.worker_host_id)
      if (!assignedHost) throw new Error('Assigned worker host was not found')
      return {
        workspace: toPersonalWorkspace(workspace),
        workerHost: toWorkerHost(assignedHost),
      }
    }

    const timestamp = now()
    const candidate = findCandidate.get(
      timestamp - Math.floor(heartbeatMaxAgeMs),
      memoryBytes,
      cpuMillis,
      diskBytes,
      workspaceSlots,
    )
    if (!candidate) throw new WorkerPlacementUnavailableError()
    const reserved = reserve.run(
      memoryBytes,
      cpuMillis,
      diskBytes,
      workspaceSlots,
      timestamp,
      candidate.id,
      memoryBytes,
      cpuMillis,
      diskBytes,
      workspaceSlots,
    )
    if (reserved.changes !== 1) throw new WorkerPlacementUnavailableError()
    const assigned = assign.run(
      candidate.id,
      memoryBytes,
      cpuMillis,
      diskBytes,
      workspaceSlots,
      timestamp,
      workspace.id,
    )
    if (assigned.changes !== 1) throw new Error('Workspace assignment changed concurrently')
    const updatedWorkspace = findWorkspace.get(workspace.id)
    const updatedHost = findWorker.get(candidate.id)
    if (!updatedWorkspace || !updatedHost) throw new Error('Worker assignment disappeared')
    return {
      workspace: toPersonalWorkspace(updatedWorkspace),
      workerHost: toWorkerHost(updatedHost),
    }
  }).immediate()
}

export class WorkerPlacementUnavailableError extends Error {
  readonly code = 'worker_placement_unavailable'

  constructor() {
    super('No healthy worker host has enough available capacity')
    this.name = 'WorkerPlacementUnavailableError'
  }
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

function requireOrganizationAdmin(
  database: Database,
  { userId, organizationId }: OrganizationAccessOptions,
): OrganizationRole {
  const actor = database.query<{ role: OrganizationRole; disabled: number }, [string, string]>(`
    SELECT member.role,
      COALESCE(organization_member_state.disabled, 0) AS disabled
    FROM member
    LEFT JOIN organization_member_state
      ON organization_member_state.member_id = member.id
    WHERE member.userId = ? AND member.organizationId = ?
    LIMIT 1
  `).get(userId, organizationId)
  if (!actor || actor.disabled === 1 || !['owner', 'admin'].includes(actor.role)) {
    throw new OrganizationAccessDeniedError()
  }
  return actor.role
}

function requireEnabledOrganizationMember(
  database: Database,
  { userId, organizationId }: OrganizationAccessOptions,
): void {
  if (!isOrganizationMemberEnabled(database, { userId, organizationId })) {
    throw new OrganizationAccessDeniedError()
  }
}

const auditIdentifierPattern = /^[a-z0-9][a-z0-9._:-]{0,127}$/i

function requireAuditIdentifier(value: string, field: string): string {
  const normalized = value.trim()
  if (!auditIdentifierPattern.test(normalized)) {
    throw new TypeError(`${field} must be a non-empty audit identifier`)
  }
  return normalized
}

function serializeAuditMetadata(
  metadata: Record<string, AuditMetadataValue> = {},
): string {
  const entries = Object.entries(metadata)
  if (entries.length > 16) throw new TypeError('audit metadata may contain at most 16 fields')
  const normalized: Record<string, AuditMetadataValue> = {}
  for (const [key, value] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (!auditIdentifierPattern.test(key)) {
      throw new TypeError('audit metadata keys must be identifiers')
    }
    if (
      value !== null
      && typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'boolean'
    ) {
      throw new TypeError('audit metadata values must be scalar')
    }
    if (typeof value === 'string' && value.length > 256) {
      throw new TypeError('audit metadata strings may contain at most 256 characters')
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('audit metadata numbers must be finite')
    }
    normalized[key] = value
  }
  const serialized = JSON.stringify(normalized)
  if (new TextEncoder().encode(serialized).byteLength > 4_096) {
    throw new TypeError('audit metadata may contain at most 4096 bytes')
  }
  return serialized
}

export function recordAuditEvent(
  database: Database,
  options: RecordAuditEventOptions,
): AuditEvent {
  requireEnabledOrganizationMember(database, options)
  const eventId = options.eventId ?? randomUUID()
  const action = requireAuditIdentifier(options.action, 'action')
  const targetType = requireAuditIdentifier(options.targetType, 'targetType')
  const targetId = requireAuditIdentifier(options.targetId, 'targetId')
  const sourceIpHash = options.sourceIpHash?.trim() || null
  if (sourceIpHash !== null && !/^[a-f0-9]{32,128}$/i.test(sourceIpHash)) {
    throw new TypeError('sourceIpHash must be a hexadecimal digest')
  }
  const metadataJson = serializeAuditMetadata(options.metadata)
  const occurredAt = (options.now ?? Date.now)()
  const result = options.result ?? 'success'
  database.prepare(`
    INSERT INTO audit_event (
      event_id, organization_id, actor_user_id, action, target_type,
      target_id, result, source_ip_hash, metadata_json, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    options.organizationId,
    options.userId,
    action,
    targetType,
    targetId,
    result,
    sourceIpHash,
    metadataJson,
    occurredAt,
  )
  return {
    eventId,
    organizationId: options.organizationId,
    actorUserId: options.userId,
    action,
    targetType,
    targetId,
    result,
    sourceIpHash,
    metadata: JSON.parse(metadataJson) as Record<string, AuditMetadataValue>,
    occurredAt,
  }
}

export function listOrganizationAuditEvents(
  database: Database,
  options: ListOrganizationAuditEventsOptions,
): AuditEvent[] {
  requireOrganizationAdmin(database, options)
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200)
  const before = options.before ?? Number.MAX_SAFE_INTEGER
  const rows = database.query<{
    event_id: string
    organization_id: string
    actor_user_id: string
    action: string
    target_type: string
    target_id: string
    result: AuditEventResult
    source_ip_hash: string | null
    metadata_json: string
    occurred_at: number
  }, [string, number, number]>(`
    SELECT event_id, organization_id, actor_user_id, action, target_type,
      target_id, result, source_ip_hash, metadata_json, occurred_at
    FROM audit_event
    WHERE organization_id = ? AND occurred_at < ?
    ORDER BY occurred_at DESC, event_id DESC
    LIMIT ?
  `).all(options.organizationId, before, limit)
  return rows.map(row => ({
    eventId: row.event_id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    result: row.result,
    sourceIpHash: row.source_ip_hash,
    metadata: JSON.parse(row.metadata_json) as Record<string, AuditMetadataValue>,
    occurredAt: Number(row.occurred_at),
  }))
}

export function isOrganizationMemberEnabled(
  database: Database,
  { userId, organizationId }: OrganizationAccessOptions,
): boolean {
  const row = database.query<{ enabled: number }, [string, string]>(`
    SELECT CASE WHEN COALESCE(organization_member_state.disabled, 0) = 0
      THEN 1 ELSE 0 END AS enabled
    FROM member
    LEFT JOIN organization_member_state
      ON organization_member_state.member_id = member.id
    WHERE member.userId = ? AND member.organizationId = ?
    LIMIT 1
  `).get(userId, organizationId)
  return row?.enabled === 1
}

export function getOrganizationMembers(
  database: Database,
  options: OrganizationAccessOptions,
): { actorRole: OrganizationRole; members: OrganizationMemberSummary[] } {
  const actorRole = requireOrganizationAdmin(database, options)
  const rows = database.query<{
    membership_id: string
    user_id: string
    name: string
    email: string
    role: OrganizationRole
    disabled: number
    joined_at: number
  }, [string]>(`
    SELECT member.id AS membership_id,
      member.userId AS user_id,
      user.name,
      user.email,
      member.role,
      COALESCE(organization_member_state.disabled, 0) AS disabled,
      member.createdAt AS joined_at
    FROM member
    INNER JOIN user ON user.id = member.userId
    LEFT JOIN organization_member_state
      ON organization_member_state.member_id = member.id
    WHERE member.organizationId = ?
    ORDER BY
      CASE member.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
      user.name COLLATE NOCASE,
      member.id
  `).all(options.organizationId)
  return {
    actorRole,
    members: rows.map(row => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      disabled: row.disabled === 1,
      joinedAt: Number(row.joined_at),
    })),
  }
}

export function setOrganizationMemberDisabled(
  database: Database,
  options: OrganizationAccessOptions & {
    membershipId: string
    disabled: boolean
    now?: () => number
  },
): OrganizationMemberSummary {
  requireOrganizationAdmin(database, options)
  const target = database.query<{
    user_id: string
    role: OrganizationRole
  }, [string, string]>(`
    SELECT userId AS user_id, role
    FROM member
    WHERE id = ? AND organizationId = ?
    LIMIT 1
  `).get(options.membershipId, options.organizationId)
  if (!target) {
    throw new OrganizationMemberMutationError('member_not_found', 'Organization member not found')
  }
  if (target.role === 'owner') {
    throw new OrganizationMemberMutationError('owner_protected', 'The organization owner cannot be disabled')
  }
  if (target.user_id === options.userId) {
    throw new OrganizationMemberMutationError('self_protected', 'You cannot disable your own membership')
  }
  const timestamp = (options.now ?? Date.now)()
  database.prepare(`
    INSERT INTO organization_member_state (
      member_id, disabled, disabled_by, disabled_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(member_id) DO UPDATE SET
      disabled = excluded.disabled,
      disabled_by = excluded.disabled_by,
      disabled_at = excluded.disabled_at,
      updated_at = excluded.updated_at
  `).run(
    options.membershipId,
    options.disabled ? 1 : 0,
    options.disabled ? options.userId : null,
    options.disabled ? timestamp : null,
    timestamp,
  )
  const member = getOrganizationMembers(database, options).members.find(
    candidate => candidate.membershipId === options.membershipId,
  )
  if (!member) throw new Error('Organization member could not be reloaded')
  return member
}

export function getOrganizationOperators(
  database: Database,
  options: OrganizationAccessOptions,
): OrganizationOperatorSummary[] {
  requireOrganizationAdmin(database, options)
  const rows = database.query<{
    workspace_id: string | null
    membership_id: string
    name: string
    email: string
    workspace_state: WorkspaceState | null
    disabled: number
    created_at: number | null
    updated_at: number | null
  }, [string]>(`
    SELECT workspace.id AS workspace_id,
      member.id AS membership_id,
      user.name,
      user.email,
      workspace.state AS workspace_state,
      COALESCE(organization_member_state.disabled, 0) AS disabled,
      workspace.created_at,
      workspace.updated_at
    FROM member
    INNER JOIN user ON user.id = member.userId
    LEFT JOIN workspace ON workspace.member_id = member.id
    LEFT JOIN organization_member_state
      ON organization_member_state.member_id = member.id
    WHERE member.organizationId = ?
    ORDER BY user.name COLLATE NOCASE, member.id
  `).all(options.organizationId)
  return rows.map(row => ({
    workspaceId: row.workspace_id,
    membershipId: row.membership_id,
    name: row.name,
    email: row.email,
    state: row.workspace_state ?? 'not_created',
    disabled: row.disabled === 1,
    createdAt: row.created_at === null ? null : Number(row.created_at),
    updatedAt: row.updated_at === null ? null : Number(row.updated_at),
  }))
}

export function getOrganizationAdminSummary(
  database: Database,
  options: OrganizationAccessOptions,
): OrganizationAdminSummary {
  const actorRole = requireOrganizationAdmin(database, options)
  const organization = database.query<{
    name: string
    slug: string
    lookup_key: string | null
  }, [string]>(`
    SELECT organization.name,
      organization.slug,
      organization_join_code.lookup_key
    FROM organization
    LEFT JOIN organization_join_code
      ON organization_join_code.organization_id = organization.id
    WHERE organization.id = ?
    LIMIT 1
  `).get(options.organizationId)
  if (!organization) throw new OrganizationAccessDeniedError()
  const admins = getOrganizationMembers(database, options).members.filter(
    member => member.role === 'owner' || member.role === 'admin',
  )
  return {
    organizationId: options.organizationId,
    name: organization.name,
    slug: organization.slug,
    actorRole,
    joinCodeLookupKey: organization.lookup_key,
    admins,
  }
}

export function rotateOrganizationJoinCode(
  database: Database,
  options: OrganizationAccessOptions & { lookupKey: string; now?: () => number },
): string {
  requireOrganizationAdmin(database, options)
  const timestamp = (options.now ?? Date.now)()
  database.prepare(`
    INSERT INTO organization_join_code (
      organization_id, lookup_key, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(organization_id) DO UPDATE SET
      lookup_key = excluded.lookup_key,
      created_by = excluded.created_by,
      updated_at = excluded.updated_at
  `).run(
    options.organizationId,
    options.lookupKey,
    options.userId,
    timestamp,
    timestamp,
  )
  return options.lookupKey
}

export function resolveOrganizationJoinCode(
  database: Database,
  lookupKey: string,
): { organizationId: string; lookupKey: string } | null {
  const row = database.query<{
    organization_id: string
    lookup_key: string
  }, [string]>(`
    SELECT organization_id, lookup_key
    FROM organization_join_code
    WHERE lookup_key = ?
    LIMIT 1
  `).get(lookupKey)
  return row
    ? { organizationId: row.organization_id, lookupKey: row.lookup_key }
    : null
}

export function joinOrganizationById(
  database: Database,
  {
    userId,
    organizationId,
    createId = randomUUID,
    now = Date.now,
  }: OrganizationAccessOptions & { createId?: () => string; now?: () => number },
): string {
  const user = database.query<{ id: string }, [string]>(
    'SELECT id FROM user WHERE id = ? LIMIT 1',
  ).get(userId)
  if (!user) throw new OrganizationMemberMutationError('user_not_found', 'User not found')
  const organization = database.query<{ id: string }, [string]>(
    'SELECT id FROM organization WHERE id = ? LIMIT 1',
  ).get(organizationId)
  if (!organization) {
    throw new OrganizationMemberMutationError('organization_not_found', 'Organization not found')
  }
  const existing = database.query<{ id: string }, [string, string]>(`
    SELECT id FROM member WHERE userId = ? AND organizationId = ? LIMIT 1
  `).get(userId, organizationId)
  if (existing) return existing.id
  const membershipId = createId()
  database.prepare(`
    INSERT INTO member (id, organizationId, userId, role, createdAt)
    VALUES (?, ?, ?, 'member', ?)
  `).run(membershipId, organizationId, userId, now())
  return membershipId
}

export function updateOrganizationName(
  database: Database,
  options: OrganizationAccessOptions & { name: string },
): void {
  requireOrganizationAdmin(database, options)
  const name = options.name.trim()
  if (!name || name.length > 120) {
    throw new OrganizationMemberMutationError(
      'invalid_organization_name',
      'Organization name must contain between 1 and 120 characters',
    )
  }
  database.prepare('UPDATE organization SET name = ? WHERE id = ?')
    .run(name, options.organizationId)
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
