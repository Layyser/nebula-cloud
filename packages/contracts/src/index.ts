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

export interface CloudErrorResponse {
  error: string
  code: string
  retryable?: boolean
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
