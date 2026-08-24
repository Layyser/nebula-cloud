export const CONTROL_PLANE_API_VERSION = 'v1' as const

export interface HealthResponse {
  service: 'nebula-cloud-control-plane'
  status: 'live' | 'ready' | 'not_ready'
  version: string
}

export interface ControlPlaneStatus {
  service: 'nebula-cloud-control-plane'
  apiVersion: typeof CONTROL_PLANE_API_VERSION
  version: string
  ready: boolean
  capabilities: string[]
}

export type WorkerHostState = 'unknown' | 'healthy' | 'draining' | 'unavailable'

export interface WorkerHostSummary {
  id: string
  name: string
  provider: string
  region: string
  baseURL: string
  credentialKeyId: string
  enabled: boolean
  schedulable: boolean
  state: WorkerHostState
  capacity: {
    memoryBytes: number
    cpuMillis: number
    diskBytes: number
    workspaceSlots: number
  }
  reserved: {
    memoryBytes: number
    cpuMillis: number
    diskBytes: number
    workspaceSlots: number
  }
  lastHeartbeatAt: number | null
  lastErrorCode: string | null
  createdAt: number
  updatedAt: number
}

export interface WorkerHostsResponse {
  workers: WorkerHostSummary[]
}

export interface RegisterWorkerHostRequest {
  id: string
  name: string
  provider: string
  region: string
  baseURL: string
  credentialKeyId: string
  capacity: WorkerHostSummary['capacity']
  enabled?: boolean
  schedulable?: boolean
}

export type WorkerHostLifecycleAction =
  | 'enable'
  | 'disable'
  | 'drain'
  | 'resume'

export interface UpdateWorkerHostRequest {
  name?: string
  provider?: string
  region?: string
  baseURL?: string
  credentialKeyId?: string
  capacity?: Partial<WorkerHostSummary['capacity']>
  action?: WorkerHostLifecycleAction
}

export interface CloudErrorResponse {
  error: string
  code: string
  retryable?: boolean
}

export type ContactTopic = 'sales' | 'support' | 'security' | 'partnerships' | 'other'

export interface ContactRequest {
  submissionId: string
  name: string
  email: string
  organization?: string
  topic: ContactTopic
  message: string
  privacyVersion: string
  website?: string
}

export interface ContactResponse {
  requestId: string
  status: 'received'
}

export type ContactRequestStatus = 'new' | 'contacted' | 'qualified' | 'closed'
export type ContactNotificationStatus = 'pending' | 'sent' | 'failed'

export interface ContactRequestRecord {
  id: string
  name: string
  email: string
  organization: string | null
  topic: ContactTopic
  message: string
  status: ContactRequestStatus
  notificationStatus: ContactNotificationStatus
  providerMessageId: string | null
  privacyVersion: string
  createdAt: number
  updatedAt: number
}

export interface ContactRequestsResponse {
  requests: ContactRequestRecord[]
  nextCursor: string | null
}

export interface UpdateContactRequestRequest {
  status: ContactRequestStatus
}

export type PersonalWorkspaceState =
  | 'pending'
  | 'provisioning'
  | 'ready'
  | 'stopped'
  | 'failed'

export interface EnsurePersonalWorkspaceRequest {
  organizationId: string
}

export interface PersonalWorkspaceResponse {
  workspace: {
    id: string
    organizationId: string
    state: PersonalWorkspaceState
    createdAt: number
    updatedAt: number
  }
}

export type ProvisioningJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface ProvisioningJobSummary {
  id: string
  workspaceId: string
  operation: 'ensure_running'
  status: ProvisioningJobStatus
  attempt: number
  availableAt: number
  createdAt: number
  updatedAt: number
}

export interface EnsureWorkspaceRunningResponse extends PersonalWorkspaceResponse {
  job: ProvisioningJobSummary | null
}

export interface RestartWorkspaceResponse {
  workspaceId: string
  state: 'ready'
}

export interface OperatorRuntimeResponse {
  workspaceId: string
  state: string
  image: string
  resources: {
    memoryRequestBytes: number
    memoryLimitBytes: number
    cpuRequest: number
    cpuLimit: number
    pidsLimit: number
    diskLimitBytes: number
  }
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

export interface PersonalUsageResponse {
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

export interface OrganizationUsageResponse {
  organizationId: string
  rangeDays: 7 | 30 | 90
  totals: UsageTotals
  members: OrganizationMemberUsageSummary[]
}

export type OrganizationRole = 'owner' | 'admin' | 'member'

export interface OrganizationMember {
  membershipId: string
  userId: string
  name: string
  email: string
  role: OrganizationRole
  disabled: boolean
  joinedAt: number
}

export interface OrganizationMembersResponse {
  actorRole: OrganizationRole
  members: OrganizationMember[]
}

export interface UpdateOrganizationMemberRequest {
  disabled: boolean
}

export interface OrganizationOperator {
  workspaceId: string | null
  membershipId: string
  name: string
  email: string
  state: PersonalWorkspaceState | 'not_created'
  disabled: boolean
  createdAt: number | null
  updatedAt: number | null
}

export interface OrganizationOperatorsResponse {
  operators: OrganizationOperator[]
}

export interface OrganizationAdminResponse {
  organization: {
    id: string
    name: string
    slug: string
  }
  actorRole: OrganizationRole
  joinCode: string | null
  admins: OrganizationMember[]
}

export interface RotateOrganizationJoinCodeResponse {
  joinCode: string
}

export interface JoinOrganizationRequest {
  code: string
}

export interface JoinOrganizationResponse {
  organizationId: string
  membershipId: string
}

export interface UpdateOrganizationRequest {
  name: string
}

export type AuditEventResult = 'success' | 'failure'
export type AuditMetadataValue = string | number | boolean | null

export interface OrganizationAuditEvent {
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

export interface OrganizationAuditResponse {
  events: OrganizationAuditEvent[]
}
