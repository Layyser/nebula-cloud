import {
  createHttpRuntimeTransport,
  type RuntimeTransport,
} from '@nebula/runtime-ui/transport'

export interface CloudRuntimeTransportOptions {
  workspaceId: string
  gatewayBase?: string
}

function workspaceRuntimeBase(workspaceId: string, gatewayBase: string): string {
  const base = gatewayBase.replace(/\/$/, '')
  return `${base}/${encodeURIComponent(workspaceId)}/runtime`
}

/**
 * Routes the shared runtime UI through the authenticated Cloud gateway.
 * Browser sessions authenticate with the control plane; private runtime
 * addresses and credentials never enter this client-side contract.
 */
export function createCloudRuntimeTransport({
  workspaceId,
  gatewayBase = '/api/workspaces',
}: CloudRuntimeTransportOptions): RuntimeTransport {
  if (!workspaceId.trim()) throw new Error('workspaceId is required')
  return createHttpRuntimeTransport(workspaceRuntimeBase(workspaceId, gatewayBase), {
    credentials: 'include',
  })
}
