import {
  CONTROL_PLANE_API_VERSION,
  type CloudErrorResponse,
  type ControlPlaneStatus,
  type EnsurePersonalWorkspaceRequest,
  type EnsureWorkspaceRunningResponse,
  type HealthResponse,
  type PersonalWorkspaceResponse,
} from '@nebula-cloud/contracts'
import { WorkspaceMembershipNotFoundError } from '@nebula-cloud/database'

const service = 'nebula-cloud-control-plane' as const

export interface ControlPlaneHandlerOptions {
  version?: string
  isReady?: () => boolean
  authHandler?: (request: Request) => Response | Promise<Response>
  resolveSession?: (
    request: Request,
  ) => Promise<{
    userId: string
    activeOrganizationId?: string | null
  } | null>
  ensurePersonalWorkspace?: (input: {
    userId: string
    organizationId: string
  }) => PersonalWorkspaceResponse['workspace']
  ensureWorkspaceRunning?: (input: {
    userId: string
    organizationId: string
  }) => EnsureWorkspaceRunningResponse
  proxyRuntime?: (input: {
    request: Request
    workspaceId: string
    runtimePath: string
    userId: string
    organizationId: string
  }) => Promise<Response>
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  })
}

export function createControlPlaneHandler({
  version = 'dev',
  isReady = () => true,
  authHandler,
  resolveSession,
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  proxyRuntime,
}: ControlPlaneHandlerOptions = {}): (request: Request) => Promise<Response> {
  return async request => {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/auth/')) {
      if (authHandler) return await authHandler(request)
      return json({
        error: 'authentication is unavailable',
        code: 'auth_unavailable',
        retryable: true,
      } satisfies CloudErrorResponse, 503)
    }

    if (request.method === 'POST' && url.pathname === '/api/workspaces/personal') {
      const session = resolveSession ? await resolveSession(request) : null
      if (!session) {
        return json({
          error: 'authentication required',
          code: 'authentication_required',
        } satisfies CloudErrorResponse, 401)
      }
      if (!ensurePersonalWorkspace) {
        return json({
          error: 'workspace resolution is unavailable',
          code: 'workspace_resolution_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }

      let body: EnsurePersonalWorkspaceRequest
      try {
        body = await request.json() as EnsurePersonalWorkspaceRequest
      } catch {
        return json({
          error: 'request body must be valid JSON',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }
      if (typeof body.organizationId !== 'string' || !body.organizationId.trim()) {
        return json({
          error: 'organizationId is required',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }

      try {
        const workspace = ensurePersonalWorkspace({
          userId: session.userId,
          organizationId: body.organizationId,
        })
        return json({ workspace } satisfies PersonalWorkspaceResponse)
      } catch (error) {
        if (error instanceof WorkspaceMembershipNotFoundError) {
          return json({
            error: 'organization membership required',
            code: error.code,
          } satisfies CloudErrorResponse, 403)
        }
        return json({
          error: 'personal workspace could not be resolved',
          code: 'workspace_resolution_failed',
          retryable: true,
        } satisfies CloudErrorResponse, 500)
      }
    }

    if (
      request.method === 'POST'
      && url.pathname === '/api/workspaces/personal/ensure-running'
    ) {
      const session = resolveSession ? await resolveSession(request) : null
      if (!session) {
        return json({
          error: 'authentication required',
          code: 'authentication_required',
        } satisfies CloudErrorResponse, 401)
      }
      if (!ensureWorkspaceRunning) {
        return json({
          error: 'workspace provisioning is unavailable',
          code: 'workspace_provisioning_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }

      let body: EnsurePersonalWorkspaceRequest
      try {
        body = await request.json() as EnsurePersonalWorkspaceRequest
      } catch {
        return json({
          error: 'request body must be valid JSON',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }
      if (typeof body.organizationId !== 'string' || !body.organizationId.trim()) {
        return json({
          error: 'organizationId is required',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }

      try {
        return json(ensureWorkspaceRunning({
          userId: session.userId,
          organizationId: body.organizationId,
        }))
      } catch (error) {
        if (error instanceof WorkspaceMembershipNotFoundError) {
          return json({
            error: 'organization membership required',
            code: error.code,
          } satisfies CloudErrorResponse, 403)
        }
        return json({
          error: 'workspace provisioning could not be scheduled',
          code: 'workspace_provisioning_failed',
          retryable: true,
        } satisfies CloudErrorResponse, 500)
      }
    }

    const runtimeRoute = url.pathname.match(
      /^\/api\/workspaces\/([^/]+)\/runtime(?:\/(.*))?$/,
    )
    if (runtimeRoute) {
      const session = resolveSession ? await resolveSession(request) : null
      if (!session) {
        return json({
          error: 'authentication required',
          code: 'authentication_required',
        } satisfies CloudErrorResponse, 401)
      }
      if (!session.activeOrganizationId) {
        return json({
          error: 'an active organization is required',
          code: 'active_organization_required',
        } satisfies CloudErrorResponse, 403)
      }
      if (!proxyRuntime) {
        return json({
          error: 'runtime gateway is unavailable',
          code: 'runtime_gateway_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }

      let workspaceId: string
      try {
        workspaceId = decodeURIComponent(runtimeRoute[1])
      } catch {
        return json({
          error: 'workspaceId is invalid',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }
      if (!workspaceId.trim()) {
        return json({
          error: 'workspaceId is required',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }

      try {
        return await proxyRuntime({
          request,
          workspaceId,
          runtimePath: runtimeRoute[2] ? `/${runtimeRoute[2]}` : '/',
          userId: session.userId,
          organizationId: session.activeOrganizationId,
        })
      } catch {
        return json({
          error: 'runtime gateway failed',
          code: 'runtime_gateway_failed',
          retryable: true,
        } satisfies CloudErrorResponse, 502)
      }
    }

    if (request.method === 'GET' && url.pathname === '/health/live') {
      return json({
        service,
        status: 'live',
        version,
      } satisfies HealthResponse)
    }

    if (request.method === 'GET' && url.pathname === '/health/ready') {
      const ready = isReady()
      return json({
        service,
        status: ready ? 'ready' : 'not_ready',
        version,
      } satisfies HealthResponse, ready ? 200 : 503)
    }

    if (request.method === 'GET' && url.pathname === '/internal/v1/status') {
      const ready = isReady()
      return json({
        service,
        apiVersion: CONTROL_PLANE_API_VERSION,
        version,
        ready,
        capabilities: [],
      } satisfies ControlPlaneStatus)
    }

    return json({
      error: 'route not found',
      code: 'not_found',
    } satisfies CloudErrorResponse, 404)
  }
}
