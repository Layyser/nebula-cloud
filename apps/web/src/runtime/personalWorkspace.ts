import type {
  CloudErrorResponse,
  PersonalWorkspaceResponse,
  RestartWorkspaceResponse,
} from '@nebula-cloud/contracts'
import {
  notifySessionExpired,
  observeAuthenticationResponse,
} from '../auth/sessionLifecycle'

interface CloudRequestOptions {
  fetch?: typeof globalThis.fetch
  onSessionExpired?: () => void
}

export async function ensurePersonalWorkspace(
  organizationId: string,
  {
    fetch: request = globalThis.fetch,
    onSessionExpired = notifySessionExpired,
  }: CloudRequestOptions = {},
): Promise<PersonalWorkspaceResponse['workspace']> {
  const response = observeAuthenticationResponse(await request('/api/workspaces/personal', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId }),
  }), onSessionExpired)

  if (!response.ok) {
    const error = await response.json().catch(() => null) as CloudErrorResponse | null
    throw new Error(error?.error || `Personal workspace request failed (${response.status})`)
  }

  const payload = await response.json() as PersonalWorkspaceResponse
  if (!payload.workspace?.id) {
    throw new Error('Control plane returned an invalid personal workspace')
  }
  return payload.workspace
}

export async function restartWorkspace(
  workspaceId: string,
  {
    fetch: request = globalThis.fetch,
    onSessionExpired = notifySessionExpired,
  }: CloudRequestOptions = {},
): Promise<RestartWorkspaceResponse> {
  const response = observeAuthenticationResponse(await request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/restart`,
    {
      method: 'POST',
      credentials: 'include',
    },
  ), onSessionExpired)

  if (!response.ok) {
    const error = await response.json().catch(() => null) as CloudErrorResponse | null
    throw new Error(error?.error || `Operator restart failed (${response.status})`)
  }

  const payload = await response.json() as RestartWorkspaceResponse
  if (payload.workspaceId !== workspaceId || payload.state !== 'ready') {
    throw new Error('Control plane returned an invalid restart response')
  }
  return payload
}
