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
