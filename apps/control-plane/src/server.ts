import {
  CONTROL_PLANE_API_VERSION,
  type CloudErrorResponse,
  type ControlPlaneStatus,
  type EnsurePersonalWorkspaceRequest,
  type EnsureWorkspaceRunningResponse,
  type HealthResponse,
  type OperatorRuntimeResponse,
  type OrganizationAdminResponse,
  type OrganizationMembersResponse,
  type OrganizationOperatorsResponse,
  type JoinOrganizationRequest,
  type JoinOrganizationResponse,
  type PersonalWorkspaceResponse,
  type PersonalUsageResponse,
  type OrganizationUsageResponse,
  type RestartWorkspaceResponse,
  type RotateOrganizationJoinCodeResponse,
  type UpdateOrganizationMemberRequest,
  type UpdateOrganizationRequest,
} from '@nebula-cloud/contracts'
import {
  OrganizationAccessDeniedError,
  OrganizationMemberMutationError,
  UsageAccessDeniedError,
  WorkspaceMembershipNotFoundError,
} from '@nebula-cloud/database'

const service = 'nebula-cloud-control-plane' as const
const personalUsagePath = '/api/usage/me'
const organizationUsagePath = /^\/api\/organizations\/([^/]+)\/usage$/
const organizationMembersPath = /^\/api\/organizations\/([^/]+)\/members$/
const organizationMemberPath = /^\/api\/organizations\/([^/]+)\/members\/([^/]+)$/
const organizationOperatorsPath = /^\/api\/organizations\/([^/]+)\/operators$/
const organizationAdminPath = /^\/api\/organizations\/([^/]+)\/admin$/
const organizationJoinCodePath = /^\/api\/organizations\/([^/]+)\/admin\/join-code$/
const organizationPath = /^\/api\/organizations\/([^/]+)$/
const operatorRuntimePath = /^\/api\/workspaces\/([^/]+)\/operator$/

// Workspace replacement may legitimately run for up to two minutes. Bun's
// ten-second default would close the request while the worker was converging
// and incorrectly surface a 502 after an otherwise successful restart.
export const CONTROL_PLANE_IDLE_TIMEOUT_SECONDS = 255

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
  restartWorkspace?: (input: {
    workspaceId: string
    userId: string
    organizationId: string
  }) => Promise<RestartWorkspaceResponse | null>
  getOperatorRuntime?: (input: {
    workspaceId: string
    userId: string
    organizationId: string
  }) => Promise<OperatorRuntimeResponse | null>
  proxyRuntime?: (input: {
    request: Request
    workspaceId: string
    runtimePath: string
    userId: string
    organizationId: string
  }) => Promise<Response>
  getPersonalUsage?: (input: {
    userId: string
    organizationId: string
    since: number
    rangeDays: 7 | 30 | 90
  }) => PersonalUsageResponse
  getOrganizationUsage?: (input: {
    userId: string
    organizationId: string
    since: number
    rangeDays: 7 | 30 | 90
  }) => OrganizationUsageResponse
  getOrganizationMembers?: (input: {
    userId: string
    organizationId: string
  }) => OrganizationMembersResponse
  setOrganizationMemberDisabled?: (input: {
    userId: string
    organizationId: string
    membershipId: string
    disabled: boolean
  }) => OrganizationMembersResponse['members'][number]
  getOrganizationOperators?: (input: {
    userId: string
    organizationId: string
  }) => OrganizationOperatorsResponse
  getOrganizationAdmin?: (input: {
    userId: string
    organizationId: string
  }) => OrganizationAdminResponse
  rotateOrganizationJoinCode?: (input: {
    userId: string
    organizationId: string
  }) => RotateOrganizationJoinCodeResponse
  joinOrganization?: (input: {
    userId: string
    code: string
  }) => JoinOrganizationResponse
  updateOrganization?: (input: {
    userId: string
    organizationId: string
    name: string
  }) => void
  reconcileUsage?: (input: {
    userId: string
    organizationId: string
  }) => Promise<void>
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  })
}

function usageRange(url: URL): { days: 7 | 30 | 90; since: number } | Response {
  const raw = url.searchParams.get('days') ?? '30'
  const days = Number(raw)
  if (days !== 7 && days !== 30 && days !== 90) {
    return json({
      error: 'days must be one of 7, 30, or 90',
      code: 'invalid_request',
    } satisfies CloudErrorResponse, 400)
  }
  return {
    days,
    since: Date.now() - days * 24 * 60 * 60 * 1000,
  }
}

export function createControlPlaneHandler({
  version = 'dev',
  isReady = () => true,
  authHandler,
  resolveSession,
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  restartWorkspace,
  getOperatorRuntime,
  proxyRuntime,
  getPersonalUsage,
  getOrganizationUsage,
  getOrganizationMembers,
  setOrganizationMemberDisabled,
  getOrganizationOperators,
  getOrganizationAdmin,
  rotateOrganizationJoinCode,
  joinOrganization,
  updateOrganization,
  reconcileUsage,
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

    if (request.method === 'POST' && url.pathname === '/api/organizations/join') {
      const session = resolveSession ? await resolveSession(request) : null
      if (!session) {
        return json({ error: 'authentication required', code: 'authentication_required' } satisfies CloudErrorResponse, 401)
      }
      if (!joinOrganization) {
        return json({ error: 'organization joining is unavailable', code: 'organization_join_unavailable', retryable: true } satisfies CloudErrorResponse, 503)
      }
      let body: JoinOrganizationRequest
      try {
        body = await request.json() as JoinOrganizationRequest
      } catch {
        return json({ error: 'request body must be valid JSON', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
      }
      if (typeof body.code !== 'string' || !body.code.trim()) {
        return json({ error: 'organization code is required', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
      }
      try {
        return json(joinOrganization({ userId: session.userId, code: body.code }))
      } catch (error) {
        if (error instanceof OrganizationMemberMutationError) {
          return json({ error: error.message, code: error.code } satisfies CloudErrorResponse, 400)
        }
        return json({ error: 'organization could not be joined', code: 'organization_join_failed' } satisfies CloudErrorResponse, 500)
      }
    }

    const membersMatch = url.pathname.match(organizationMembersPath)
    const memberMatch = url.pathname.match(organizationMemberPath)
    const operatorsMatch = url.pathname.match(organizationOperatorsPath)
    const adminMatch = url.pathname.match(organizationAdminPath)
    const joinCodeMatch = url.pathname.match(organizationJoinCodePath)
    const organizationMatch = url.pathname.match(organizationPath)
    if (
      membersMatch || memberMatch || operatorsMatch || adminMatch
      || joinCodeMatch || (organizationMatch && request.method === 'PATCH')
    ) {
      const session = resolveSession ? await resolveSession(request) : null
      if (!session) {
        return json({ error: 'authentication required', code: 'authentication_required' } satisfies CloudErrorResponse, 401)
      }
      const encodedOrganizationId = (
        membersMatch?.[1] ?? memberMatch?.[1] ?? operatorsMatch?.[1]
        ?? adminMatch?.[1] ?? joinCodeMatch?.[1] ?? organizationMatch?.[1]
      )!
      let organizationId: string
      try {
        organizationId = decodeURIComponent(encodedOrganizationId)
      } catch {
        return json({ error: 'organization id is invalid', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
      }
      if (session.activeOrganizationId !== organizationId) {
        return json({ error: 'organization access denied', code: 'organization_access_denied' } satisfies CloudErrorResponse, 403)
      }
      try {
        if (request.method === 'GET' && membersMatch && getOrganizationMembers) {
          return json(getOrganizationMembers({ userId: session.userId, organizationId }))
        }
        if (request.method === 'PATCH' && memberMatch && setOrganizationMemberDisabled) {
          let membershipId: string
          try {
            membershipId = decodeURIComponent(memberMatch[2])
          } catch {
            return json({ error: 'membership id is invalid', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
          }
          const body = await request.json() as UpdateOrganizationMemberRequest
          if (typeof body.disabled !== 'boolean') {
            return json({ error: 'disabled must be a boolean', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
          }
          return json(setOrganizationMemberDisabled({
            userId: session.userId,
            organizationId,
            membershipId,
            disabled: body.disabled,
          }))
        }
        if (request.method === 'GET' && operatorsMatch && getOrganizationOperators) {
          return json(getOrganizationOperators({ userId: session.userId, organizationId }))
        }
        if (request.method === 'GET' && adminMatch && getOrganizationAdmin) {
          return json(getOrganizationAdmin({ userId: session.userId, organizationId }))
        }
        if (request.method === 'POST' && joinCodeMatch && rotateOrganizationJoinCode) {
          return json(rotateOrganizationJoinCode({ userId: session.userId, organizationId }))
        }
        if (request.method === 'PATCH' && organizationMatch && updateOrganization) {
          const body = await request.json() as UpdateOrganizationRequest
          if (typeof body.name !== 'string') {
            return json({ error: 'organization name is required', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
          }
          updateOrganization({ userId: session.userId, organizationId, name: body.name })
          return json({ organizationId, name: body.name.trim() })
        }
        return json({ error: 'route not found', code: 'not_found' } satisfies CloudErrorResponse, 404)
      } catch (error) {
        if (error instanceof OrganizationAccessDeniedError) {
          return json({ error: error.message, code: error.code } satisfies CloudErrorResponse, 403)
        }
        if (error instanceof OrganizationMemberMutationError) {
          return json({ error: error.message, code: error.code } satisfies CloudErrorResponse, 400)
        }
        return json({ error: 'organization operation failed', code: 'organization_operation_failed' } satisfies CloudErrorResponse, 500)
      }
    }

    const operatorMatch = url.pathname.match(operatorRuntimePath)
    if (request.method === 'GET' && operatorMatch) {
      const session = resolveSession ? await resolveSession(request) : null
      if (!session) {
        return json({
          error: 'authentication required',
          code: 'authentication_required',
        } satisfies CloudErrorResponse, 401)
      }
      if (!session.activeOrganizationId || !getOperatorRuntime) {
        return json({
          error: 'operator metadata is unavailable',
          code: 'operator_metadata_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }
      let workspaceId: string
      try {
        workspaceId = decodeURIComponent(operatorMatch[1])
      } catch {
        return json({
          error: 'invalid workspace id',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }
      try {
        const operator = await getOperatorRuntime({
          workspaceId,
          userId: session.userId,
          organizationId: session.activeOrganizationId,
        })
        if (!operator) {
          return json({
            error: 'operator not found',
            code: 'operator_not_found',
          } satisfies CloudErrorResponse, 404)
        }
        return json(operator)
      } catch {
        return json({
          error: 'operator metadata could not be loaded',
          code: 'operator_metadata_failed',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }
    }

    if (request.method === 'GET' && url.pathname === personalUsagePath) {
      const range = usageRange(url)
      if (range instanceof Response) return range
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
      if (!getPersonalUsage) {
        return json({
          error: 'usage reporting is unavailable',
          code: 'usage_reporting_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }
      try {
        if (reconcileUsage) {
          try {
            await reconcileUsage({
              userId: session.userId,
              organizationId: session.activeOrganizationId,
            })
          } catch {
            // Reconciliation is a compatibility fallback. Previously recorded
            // usage must remain available if a runtime is temporarily offline.
          }
        }
        const usage = getPersonalUsage({
          userId: session.userId,
          organizationId: session.activeOrganizationId,
          since: range.since,
          rangeDays: range.days,
        })
        return json({
          ...usage,
          // Keep the wire response explicit so every dashboard revision gets
          // the per-model time series required to draw one line per model.
          modelTimeline: usage.modelTimeline ?? [],
        } satisfies PersonalUsageResponse)
      } catch (error) {
        if (error instanceof WorkspaceMembershipNotFoundError) {
          return json({
            error: 'organization membership required',
            code: error.code,
          } satisfies CloudErrorResponse, 403)
        }
        return json({
          error: 'usage summary could not be loaded',
          code: 'usage_summary_failed',
          retryable: true,
        } satisfies CloudErrorResponse, 500)
      }
    }

    const organizationUsageRoute = url.pathname.match(organizationUsagePath)
    if (request.method === 'GET' && organizationUsageRoute) {
      const range = usageRange(url)
      if (range instanceof Response) return range
      const session = resolveSession ? await resolveSession(request) : null
      if (!session) {
        return json({
          error: 'authentication required',
          code: 'authentication_required',
        } satisfies CloudErrorResponse, 401)
      }
      let organizationId: string
      try {
        organizationId = decodeURIComponent(organizationUsageRoute[1])
      } catch {
        return json({
          error: 'organizationId is invalid',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }
      if (!session.activeOrganizationId || session.activeOrganizationId !== organizationId) {
        return json({
          error: 'organization usage is unavailable',
          code: 'usage_access_denied',
        } satisfies CloudErrorResponse, 403)
      }
      if (!getOrganizationUsage) {
        return json({
          error: 'usage reporting is unavailable',
          code: 'usage_reporting_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }
      try {
        if (reconcileUsage) {
          try {
            await reconcileUsage({
              userId: session.userId,
              organizationId,
            })
          } catch {
            // Keep serving the durable ledger when live reconciliation fails.
          }
        }
        return json(getOrganizationUsage({
          userId: session.userId,
          organizationId,
          since: range.since,
          rangeDays: range.days,
        }))
      } catch (error) {
        if (error instanceof UsageAccessDeniedError) {
          return json({
            error: 'organization usage is unavailable',
            code: error.code,
          } satisfies CloudErrorResponse, 403)
        }
        return json({
          error: 'usage summary could not be loaded',
          code: 'usage_summary_failed',
          retryable: true,
        } satisfies CloudErrorResponse, 500)
      }
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

    const restartRoute = url.pathname.match(
      /^\/api\/workspaces\/([^/]+)\/restart$/,
    )
    if (request.method === 'POST' && restartRoute) {
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
      if (!restartWorkspace) {
        return json({
          error: 'workspace restart is unavailable',
          code: 'workspace_restart_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }

      let workspaceId: string
      try {
        workspaceId = decodeURIComponent(restartRoute[1])
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
        const restarted = await restartWorkspace({
          workspaceId,
          userId: session.userId,
          organizationId: session.activeOrganizationId,
        })
        if (!restarted) {
          return json({
            error: 'workspace not found',
            code: 'workspace_not_found',
          } satisfies CloudErrorResponse, 404)
        }
        return json(restarted)
      } catch {
        return json({
          error: 'workspace could not be restarted',
          code: 'workspace_restart_failed',
          retryable: true,
        } satisfies CloudErrorResponse, 502)
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
