import {
  CONTROL_PLANE_API_VERSION,
  type CloudErrorResponse,
  type ContactRequest,
  type ContactRequestRecord,
  type ContactRequestsResponse,
  type ContactRequestStatus,
  type ContactResponse,
  type ControlPlaneStatus,
  type EnsurePersonalWorkspaceRequest,
  type EnsureWorkspaceRunningResponse,
  type HealthResponse,
  type OperatorRuntimeResponse,
  type OrganizationAdminResponse,
  type OrganizationAuditResponse,
  type OrganizationDashboardResponse,
  type OrganizationMembersResponse,
  type OrganizationOperatorsResponse,
  type JoinOrganizationRequest,
  type JoinOrganizationResponse,
  type PersonalWorkspaceResponse,
  type PublishedServiceResponse,
  type PublishedServicesResponse,
  type PersonalUsageResponse,
  type OrganizationUsageResponse,
  type RestartWorkspaceResponse,
  type RotateOrganizationJoinCodeResponse,
  type RegisterWorkerHostRequest,
  type UpdateWorkerHostRequest,
  type UpdateOrganizationMemberRequest,
  type UpdateOrganizationRequest,
  type WorkerHostsResponse,
  type WorkerHostSummary,
} from '@nebula-cloud/contracts'
import {
  OrganizationAccessDeniedError,
  ContactRateLimitError,
  OrganizationMemberMutationError,
  publishedServiceMaximumTTLSeconds,
  publishedServiceMinimumTTLSeconds,
  UsageAccessDeniedError,
  WorkspaceMembershipNotFoundError,
} from '@nebula-cloud/database'
import { matchPublishedServiceHostname } from './publishedServiceRouting'

const service = 'nebula-cloud-control-plane' as const
const personalUsagePath = '/api/usage/me'
const contactPath = '/api/contact'
const contactAdministrationPath = '/internal/v1/contact-requests'
const contactAdministrationExportPath = '/internal/v1/contact-requests/export.csv'
const contactAdministrationMemberPath = /^\/internal\/v1\/contact-requests\/([^/]+)$/
const organizationUsagePath = /^\/api\/organizations\/([^/]+)\/usage$/
const organizationMembersPath = /^\/api\/organizations\/([^/]+)\/members$/
const organizationMemberPath = /^\/api\/organizations\/([^/]+)\/members\/([^/]+)$/
const organizationOperatorsPath = /^\/api\/organizations\/([^/]+)\/operators$/
const organizationDashboardPath = /^\/api\/organizations\/([^/]+)\/dashboard$/
const organizationAdminPath = /^\/api\/organizations\/([^/]+)\/admin$/
const organizationAuditPath = /^\/api\/organizations\/([^/]+)\/audit$/
const organizationJoinCodePath = /^\/api\/organizations\/([^/]+)\/admin\/join-code$/
const organizationPath = /^\/api\/organizations\/([^/]+)$/
const operatorRuntimePath = /^\/api\/workspaces\/([^/]+)\/operator$/
const workspacePublicationsPath = /^\/api\/workspaces\/([^/]+)\/publications$/
const workspacePublicationPath = /^\/api\/workspaces\/([^/]+)\/publications\/([^/]+)$/
const publishedServicePath = /^\/p\/([^/]+)(\/.*)?$/
const workerAdministrationPath = '/internal/v1/workers'
const workerAdministrationMemberPath = /^\/internal\/v1\/workers\/([^/]+)$/

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
  authenticateWorkspacePublication?: (input: {
    request: Request
    workspaceId: string
  }) => Promise<boolean>
  listWorkspacePublications?: (input: {
    workspaceId: string
  }) => PublishedServicesResponse
  upsertWorkspacePublication?: (input: {
    workspaceId: string
    name: string
    port: number
    protocol: 'http' | 'tcp'
    visibility: 'public' | 'private'
    ttlSeconds: number | null
  }) => PublishedServiceResponse | Promise<PublishedServiceResponse>
  revokeWorkspacePublication?: (input: {
    workspaceId: string
    name: string
  }) => boolean | Promise<boolean>
  proxyPublishedService?: (input: {
    request: Request
    slug: string
    servicePath: string
  }) => Promise<Response>
  publishedServiceHostnameSuffix?: string
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
  getOrganizationDashboard?: (input: {
    userId: string
    organizationId: string
    since: number
  }) => OrganizationDashboardResponse
  getOrganizationAdmin?: (input: {
    userId: string
    organizationId: string
  }) => OrganizationAdminResponse
  getOrganizationAudit?: (input: {
    userId: string
    organizationId: string
    limit: number
    before: number | null
  }) => OrganizationAuditResponse
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
  authorizeWorkerAdministration?: (
    request: Request,
  ) => boolean | Promise<boolean>
  listWorkerHosts?: () => WorkerHostsResponse
  registerWorkerHost?: (input: RegisterWorkerHostRequest) => WorkerHostSummary
  updateWorkerHost?: (input: {
    workerHostId: string
    update: UpdateWorkerHostRequest
  }) => WorkerHostSummary | null
  authorizeContactAdministration?: (
    request: Request,
  ) => boolean | Promise<boolean>
  listContactRequests?: (input: {
    status?: ContactRequestStatus
    limit: number
    before: { createdAt: number; id: string } | null
  }) => {
    requests: ContactRequestRecord[]
    nextCursor: { createdAt: number; id: string } | null
  }
  updateContactRequestStatus?: (input: {
    requestId: string
    status: ContactRequestStatus
  }) => ContactRequestRecord | null
  trustedContactOrigins?: string[]
  submitContact?: (input: ContactRequest & {
    sourceAddress: string | null
  }) => Promise<ContactResponse>
}

export interface ControlPlaneRequestContext {
  clientAddress?: string | null
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed)
  return Object.keys(value).every(key => allowedKeys.has(key))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function isWorkerCapacity(
  value: unknown,
  partial = false,
): value is RegisterWorkerHostRequest['capacity'] {
  if (!isRecord(value)) return false
  const keys = ['memoryBytes', 'cpuMillis', 'diskBytes', 'workspaceSlots'] as const
  if (!hasOnlyKeys(value, keys)) return false
  if (partial && Object.keys(value).length === 0) return false
  return keys.every(key => {
    const field = value[key]
    return partial && field === undefined ? true : isPositiveSafeInteger(field)
  })
}

function isRegisterWorkerHostRequest(value: unknown): value is RegisterWorkerHostRequest {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, [
    'id', 'name', 'provider', 'region', 'baseURL', 'credentialKeyId',
    'capacity', 'enabled', 'schedulable',
  ])) return false
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.name)
    && isNonEmptyString(value.provider)
    && isNonEmptyString(value.region)
    && isNonEmptyString(value.baseURL)
    && isNonEmptyString(value.credentialKeyId)
    && isWorkerCapacity(value.capacity)
    && (value.enabled === undefined || typeof value.enabled === 'boolean')
    && (value.schedulable === undefined || typeof value.schedulable === 'boolean')
}

function isUpdateWorkerHostRequest(value: unknown): value is UpdateWorkerHostRequest {
  if (!isRecord(value) || Object.keys(value).length === 0) return false
  if (!hasOnlyKeys(value, [
    'name', 'provider', 'region', 'baseURL', 'credentialKeyId', 'capacity', 'action',
  ])) return false
  for (const key of ['name', 'provider', 'region', 'baseURL', 'credentialKeyId'] as const) {
    if (value[key] !== undefined && !isNonEmptyString(value[key])) return false
  }
  if (value.capacity !== undefined && !isWorkerCapacity(value.capacity, true)) return false
  return value.action === undefined || [
    'enable', 'disable', 'drain', 'resume',
  ].includes(String(value.action))
}

const contactTopics = new Set(['sales', 'support', 'security', 'partnerships', 'other'])
const contactStatuses = new Set<ContactRequestStatus>([
  'new', 'contacted', 'qualified', 'closed',
])
const contactRequestMaximumBytes = 16 * 1024
const contactAdministrationMaximumBytes = 1024
const contactExportMaximumRows = 5000
const publicationRequestMaximumBytes = 1024

function isPublishedServiceName(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(value)
}

function isPublishedServicePort(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && Number(value) >= 1024
    && Number(value) <= 65535
    && Number(value) !== 7777
}

function contactStatus(value: string | null): ContactRequestStatus | undefined | null {
  if (value === null || value === '') return undefined
  return contactStatuses.has(value as ContactRequestStatus)
    ? value as ContactRequestStatus
    : null
}

function encodeContactCursor(cursor: { createdAt: number; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeContactCursor(value: string | null): {
  createdAt: number
  id: string
} | null | undefined {
  if (value === null || value === '') return null
  if (value.length > 512) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (
      !isRecord(parsed)
      || !hasOnlyKeys(parsed, ['createdAt', 'id'])
      || !Number.isSafeInteger(parsed.createdAt)
      || Number(parsed.createdAt) < 0
      || typeof parsed.id !== 'string'
      || parsed.id.length < 1
      || parsed.id.length > 128
    ) return undefined
    return { createdAt: Number(parsed.createdAt), id: parsed.id }
  } catch {
    return undefined
  }
}

function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function contactRequestsCSV(requests: ContactRequestRecord[]): string {
  const header = [
    'id', 'created_at', 'updated_at', 'status', 'notification_status',
    'provider_message_id', 'topic', 'name', 'email', 'organization',
    'message', 'privacy_version',
  ]
  const rows = requests.map(request => [
    request.id,
    new Date(request.createdAt).toISOString(),
    new Date(request.updatedAt).toISOString(),
    request.status,
    request.notificationStatus,
    request.providerMessageId,
    request.topic,
    request.name,
    request.email,
    request.organization,
    request.message,
    request.privacyVersion,
  ].map(csvCell).join(','))
  return `${header.map(csvCell).join(',')}\r\n${rows.join('\r\n')}\r\n`
}

async function readBoundedJSON(request: Request, maximumBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error('request_too_large')
  }
  if (!request.body) throw new Error('invalid_json')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    length += chunk.value.byteLength
    if (length > maximumBytes) {
      await reader.cancel()
      throw new Error('request_too_large')
    }
    chunks.push(chunk.value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('invalid_json')
  }
}

function contactRequest(value: unknown): ContactRequest | null {
  if (!isRecord(value)) return null
  if (!hasOnlyKeys(value, [
    'submissionId', 'name', 'email', 'organization', 'topic', 'message',
    'privacyVersion', 'website',
  ])) return null
  if (
    typeof value.submissionId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.submissionId)
    || typeof value.name !== 'string'
    || value.name.trim().length < 1
    || value.name.trim().length > 120
    || typeof value.email !== 'string'
    || value.email.trim().length < 3
    || value.email.trim().length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())
    || (value.organization !== undefined && (
      typeof value.organization !== 'string' || value.organization.trim().length > 160
    ))
    || typeof value.topic !== 'string'
    || !contactTopics.has(value.topic)
    || typeof value.message !== 'string'
    || value.message.trim().length < 10
    || value.message.trim().length > 4000
    || typeof value.privacyVersion !== 'string'
    || value.privacyVersion.trim().length < 1
    || value.privacyVersion.trim().length > 64
    || (value.website !== undefined && (
      typeof value.website !== 'string' || value.website.length > 256
    ))
  ) return null
  return {
    submissionId: value.submissionId,
    name: value.name.trim(),
    email: value.email.trim().toLowerCase(),
    ...(value.organization?.trim() ? { organization: value.organization.trim() } : {}),
    topic: value.topic as ContactRequest['topic'],
    message: value.message.trim(),
    privacyVersion: value.privacyVersion.trim(),
    ...(value.website ? { website: value.website } : {}),
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
  authenticateWorkspacePublication,
  listWorkspacePublications,
  upsertWorkspacePublication,
  revokeWorkspacePublication,
  proxyPublishedService,
  getPersonalUsage,
  getOrganizationUsage,
  getOrganizationMembers,
  setOrganizationMemberDisabled,
  getOrganizationOperators,
  getOrganizationDashboard,
  getOrganizationAdmin,
  getOrganizationAudit,
  rotateOrganizationJoinCode,
  joinOrganization,
  updateOrganization,
  reconcileUsage,
  authorizeWorkerAdministration,
  listWorkerHosts,
  registerWorkerHost,
  updateWorkerHost,
  authorizeContactAdministration,
  listContactRequests,
  updateContactRequestStatus,
  trustedContactOrigins = [],
  submitContact,
  publishedServiceHostnameSuffix,
}: ControlPlaneHandlerOptions = {}): (
  request: Request,
  context?: ControlPlaneRequestContext,
) => Promise<Response> {
  const allowedContactOrigins = new Set(trustedContactOrigins)
  return async (request, context = {}) => {
    const url = new URL(request.url)

    const publishedHost = matchPublishedServiceHostname(
      url.hostname,
      publishedServiceHostnameSuffix,
    )
    if (publishedHost.kind === 'invalid') {
      return json({ error: 'published service not found', code: 'not_found' } satisfies CloudErrorResponse, 404)
    }
    const publishedMatch = url.pathname.match(publishedServicePath)
    if (publishedHost.kind === 'service' || publishedMatch) {
      if (request.method === 'CONNECT' || request.method === 'TRACE') {
        return json({ error: 'method not allowed', code: 'method_not_allowed' } satisfies CloudErrorResponse, 405)
      }
      if (request.headers.has('upgrade')) {
        return json({ error: 'protocol upgrades are not supported', code: 'upgrade_not_supported' } satisfies CloudErrorResponse, 426)
      }
      if (!proxyPublishedService) {
        return json({ error: 'published service not found', code: 'not_found' } satisfies CloudErrorResponse, 404)
      }
      try {
        return await proxyPublishedService({
          request,
          slug: publishedHost.kind === 'service'
            ? publishedHost.slug
            : publishedMatch![1],
          servicePath: publishedHost.kind === 'service'
            ? `${url.pathname}${url.search}`
            : `${publishedMatch![2] || '/'}${url.search}`,
        })
      } catch {
        return json({ error: 'published service is unavailable', code: 'published_service_unavailable', retryable: true } satisfies CloudErrorResponse, 503)
      }
    }

    const publicationCollectionMatch = url.pathname.match(workspacePublicationsPath)
    const publicationMemberMatch = url.pathname.match(workspacePublicationPath)
    if (publicationCollectionMatch || publicationMemberMatch) {
      if (!authenticateWorkspacePublication) {
        return json({ error: 'workspace publication is unavailable', code: 'workspace_publication_unavailable', retryable: true } satisfies CloudErrorResponse, 503)
      }
      let workspaceId: string
      let name: string | null = null
      try {
        workspaceId = decodeURIComponent(
          publicationCollectionMatch?.[1] ?? publicationMemberMatch![1],
        )
        name = publicationMemberMatch
          ? decodeURIComponent(publicationMemberMatch[2]).toLowerCase()
          : null
      } catch {
        return json({ error: 'publication route is invalid', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
      }
      if (!workspaceId.trim() || (name !== null && !isPublishedServiceName(name))) {
        return json({ error: 'publication route is invalid', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
      }
      if (!await authenticateWorkspacePublication({ request, workspaceId })) {
        return json({ error: 'workspace authentication required', code: 'workspace_authentication_required' } satisfies CloudErrorResponse, 401)
      }
      if (request.method === 'GET' && publicationCollectionMatch) {
        return listWorkspacePublications
          ? json(listWorkspacePublications({ workspaceId }))
          : json({ error: 'workspace publication is unavailable', code: 'workspace_publication_unavailable', retryable: true } satisfies CloudErrorResponse, 503)
      }
      if (request.method === 'PUT' && name !== null) {
        if (!upsertWorkspacePublication) {
          return json({ error: 'workspace publication is unavailable', code: 'workspace_publication_unavailable', retryable: true } satisfies CloudErrorResponse, 503)
        }
        let body: unknown
        try {
          body = await readBoundedJSON(request, publicationRequestMaximumBytes)
        } catch {
          return json({ error: 'request body must be valid JSON', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
        }
        if (!isRecord(body) || !hasOnlyKeys(body, ['port', 'protocol', 'visibility', 'ttlSeconds']) || !isPublishedServicePort(body.port)) {
          return json({ error: 'publication request is invalid', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
        }
        const visibility = body.visibility ?? 'public'
        const protocol = body.protocol ?? 'http'
        const ttlSeconds = body.ttlSeconds ?? null
        if (
          (protocol !== 'http' && protocol !== 'tcp')
          || (protocol === 'tcp' && visibility !== 'public')
          || (visibility !== 'public' && visibility !== 'private')
          || (
            ttlSeconds !== null
            && (
              !Number.isSafeInteger(ttlSeconds)
              || Number(ttlSeconds) < publishedServiceMinimumTTLSeconds
              || Number(ttlSeconds) > publishedServiceMaximumTTLSeconds
            )
          )
        ) {
          return json({
            error: `protocol must be http or tcp; TCP publications are public passthrough only; visibility must be public or private and ttlSeconds must be null or ${publishedServiceMinimumTTLSeconds}-${publishedServiceMaximumTTLSeconds}`,
            code: 'invalid_request',
          } satisfies CloudErrorResponse, 400)
        }
        try {
          return json(await upsertWorkspacePublication({
            workspaceId,
            name,
            port: body.port,
            protocol,
            visibility,
            ttlSeconds: ttlSeconds === null ? null : Number(ttlSeconds),
          }))
        } catch (error) {
          if (
            error instanceof Error
            && 'code' in error
            && (error.code === 'published_service_limit_reached'
              || error.code === 'published_service_ingress_capacity_reached')
          ) {
            return json({
              error: error.code === 'published_service_ingress_capacity_reached'
                ? 'TCP ingress capacity reached'
                : 'published service limit reached',
              code: error.code,
            } satisfies CloudErrorResponse, 409)
          }
          return json({ error: 'workspace publication failed', code: 'workspace_publication_failed', retryable: true } satisfies CloudErrorResponse, 503)
        }
      }
      if (request.method === 'DELETE' && name !== null) {
        if (!revokeWorkspacePublication) {
          return json({ error: 'workspace publication is unavailable', code: 'workspace_publication_unavailable', retryable: true } satisfies CloudErrorResponse, 503)
        }
        return await revokeWorkspacePublication({ workspaceId, name })
          ? new Response(null, { status: 204 })
          : json({ error: 'published service not found', code: 'not_found' } satisfies CloudErrorResponse, 404)
      }
      return json({ error: 'route not found', code: 'not_found' } satisfies CloudErrorResponse, 404)
    }

    if (request.method === 'POST' && url.pathname === contactPath) {
      const origin = request.headers.get('origin')
      if (!origin || !allowedContactOrigins.has(origin)) {
        return json({
          error: 'contact request origin is not allowed',
          code: 'contact_origin_denied',
        } satisfies CloudErrorResponse, 403)
      }
      if (!submitContact) {
        return json({
          error: 'contact requests are temporarily unavailable',
          code: 'contact_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }
      let parsed: unknown
      try {
        parsed = await readBoundedJSON(request, contactRequestMaximumBytes)
      } catch (error) {
        const tooLarge = error instanceof Error && error.message === 'request_too_large'
        return json({
          error: tooLarge ? 'contact request is too large' : 'request body must be valid JSON',
          code: tooLarge ? 'request_too_large' : 'invalid_request',
        } satisfies CloudErrorResponse, tooLarge ? 413 : 400)
      }
      const input = contactRequest(parsed)
      if (!input) {
        return json({
          error: 'contact request is invalid',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }
      if (input.website) {
        return json({ requestId: input.submissionId, status: 'received' } satisfies ContactResponse, 202)
      }
      try {
        return json(await submitContact({
          ...input,
          sourceAddress: context.clientAddress ?? null,
        }), 202)
      } catch (error) {
        if (error instanceof ContactRateLimitError) {
          return json({
            error: 'contact request limit reached; please try again later',
            code: error.code,
            retryable: true,
          } satisfies CloudErrorResponse, 429)
        }
        return json({
          error: 'contact request could not be delivered',
          code: 'contact_delivery_failed',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }
    }

    const contactMemberMatch = url.pathname.match(contactAdministrationMemberPath)
    if (
      url.pathname === contactAdministrationPath
      || url.pathname === contactAdministrationExportPath
      || contactMemberMatch
    ) {
      if (!authorizeContactAdministration) {
        return json({
          error: 'contact administration is unavailable',
          code: 'contact_administration_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }
      if (!await authorizeContactAdministration(request)) {
        return json({
          error: 'contact administrator authentication required',
          code: 'contact_administrator_authentication_required',
        } satisfies CloudErrorResponse, 401)
      }
      if (!listContactRequests || !updateContactRequestStatus) {
        return json({
          error: 'contact administration is unavailable',
          code: 'contact_administration_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }

      const status = contactStatus(url.searchParams.get('status'))
      if (status === null) {
        return json({
          error: 'contact request status is invalid',
          code: 'invalid_request',
        } satisfies CloudErrorResponse, 400)
      }

      if (request.method === 'GET' && url.pathname === contactAdministrationPath) {
        const limit = Number(url.searchParams.get('limit') ?? '50')
        const before = decodeContactCursor(url.searchParams.get('cursor'))
        if (!Number.isInteger(limit) || limit < 1 || limit > 200 || before === undefined) {
          return json({
            error: 'contact request pagination is invalid',
            code: 'invalid_request',
          } satisfies CloudErrorResponse, 400)
        }
        const result = listContactRequests({ status, limit, before })
        return json({
          requests: result.requests,
          nextCursor: result.nextCursor ? encodeContactCursor(result.nextCursor) : null,
        } satisfies ContactRequestsResponse)
      }

      if (request.method === 'GET' && url.pathname === contactAdministrationExportPath) {
        const requests: ContactRequestRecord[] = []
        let before: { createdAt: number; id: string } | null = null
        let nextCursor: { createdAt: number; id: string } | null = null
        do {
          const result = listContactRequests({ status, limit: 200, before })
          requests.push(...result.requests)
          nextCursor = result.nextCursor
          before = nextCursor
        } while (nextCursor && requests.length < contactExportMaximumRows)
        return new Response(contactRequestsCSV(requests), {
          headers: {
            'cache-control': 'no-store',
            'content-disposition': 'attachment; filename="nubols-contact-requests.csv"',
            'content-type': 'text/csv; charset=utf-8',
            ...(nextCursor ? { 'x-nubols-export-truncated': 'true' } : {}),
          },
        })
      }

      if (request.method === 'PATCH' && contactMemberMatch) {
        let requestId: string
        try {
          requestId = decodeURIComponent(contactMemberMatch[1])
        } catch {
          return json({ error: 'contact request id is invalid', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
        }
        let body: unknown
        try {
          body = await readBoundedJSON(request, contactAdministrationMaximumBytes)
        } catch {
          return json({ error: 'request body must be valid JSON', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
        }
        const requestedStatus = isRecord(body) && typeof body.status === 'string'
          ? contactStatus(body.status)
          : null
        if (
          !isRecord(body)
          || !hasOnlyKeys(body, ['status'])
          || requestedStatus == null
        ) {
          return json({ error: 'contact request update is invalid', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
        }
        const contact = updateContactRequestStatus({ requestId, status: requestedStatus })
        return contact
          ? json(contact)
          : json({ error: 'contact request not found', code: 'not_found' } satisfies CloudErrorResponse, 404)
      }

      return json({ error: 'route not found', code: 'not_found' } satisfies CloudErrorResponse, 404)
    }

    const workerMemberMatch = url.pathname.match(workerAdministrationMemberPath)
    if (url.pathname === workerAdministrationPath || workerMemberMatch) {
      if (!authorizeWorkerAdministration) {
        return json({
          error: 'worker administration is unavailable',
          code: 'worker_administration_unavailable',
          retryable: true,
        } satisfies CloudErrorResponse, 503)
      }
      if (!await authorizeWorkerAdministration(request)) {
        return json({
          error: 'worker administrator authentication required',
          code: 'worker_administrator_authentication_required',
        } satisfies CloudErrorResponse, 401)
      }

      if (request.method === 'GET' && url.pathname === workerAdministrationPath) {
        return listWorkerHosts
          ? json(listWorkerHosts())
          : json({
              error: 'worker administration is unavailable',
              code: 'worker_administration_unavailable',
              retryable: true,
            } satisfies CloudErrorResponse, 503)
      }

      if (request.method === 'POST' && url.pathname === workerAdministrationPath) {
        if (!registerWorkerHost) {
          return json({
            error: 'worker registration is unavailable',
            code: 'worker_registration_unavailable',
            retryable: true,
          } satisfies CloudErrorResponse, 503)
        }
        try {
          const body = await request.json() as RegisterWorkerHostRequest
          if (!isRegisterWorkerHostRequest(body)) {
            return json({
              error: 'worker registration is invalid',
              code: 'invalid_request',
            } satisfies CloudErrorResponse, 400)
          }
          return json(registerWorkerHost(body), 201)
        } catch (error) {
          return json({
            error: error instanceof Error ? error.message : 'worker registration failed',
            code: 'invalid_request',
          } satisfies CloudErrorResponse, 400)
        }
      }

      if (request.method === 'PATCH' && workerMemberMatch) {
        if (!updateWorkerHost) {
          return json({
            error: 'worker updates are unavailable',
            code: 'worker_update_unavailable',
            retryable: true,
          } satisfies CloudErrorResponse, 503)
        }
        let workerHostId: string
        try {
          workerHostId = decodeURIComponent(workerMemberMatch[1])
        } catch {
          return json({ error: 'worker id is invalid', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
        }
        try {
          const update = await request.json() as UpdateWorkerHostRequest
          if (!isUpdateWorkerHostRequest(update)) {
            return json({
              error: 'worker update is invalid',
              code: 'invalid_request',
            } satisfies CloudErrorResponse, 400)
          }
          const worker = updateWorkerHost({ workerHostId, update })
          return worker
            ? json(worker)
            : json({ error: 'worker host not found', code: 'not_found' } satisfies CloudErrorResponse, 404)
        } catch (error) {
          return json({
            error: error instanceof Error ? error.message : 'worker update failed',
            code: 'invalid_request',
          } satisfies CloudErrorResponse, 400)
        }
      }

      return json({ error: 'route not found', code: 'not_found' } satisfies CloudErrorResponse, 404)
    }

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
    const dashboardMatch = url.pathname.match(organizationDashboardPath)
    const adminMatch = url.pathname.match(organizationAdminPath)
    const auditMatch = url.pathname.match(organizationAuditPath)
    const joinCodeMatch = url.pathname.match(organizationJoinCodePath)
    const organizationMatch = url.pathname.match(organizationPath)
    if (
      membersMatch || memberMatch || operatorsMatch || dashboardMatch || adminMatch || auditMatch
      || joinCodeMatch || (organizationMatch && request.method === 'PATCH')
    ) {
      const session = resolveSession ? await resolveSession(request) : null
      if (!session) {
        return json({ error: 'authentication required', code: 'authentication_required' } satisfies CloudErrorResponse, 401)
      }
      const encodedOrganizationId = (
        membersMatch?.[1] ?? memberMatch?.[1] ?? operatorsMatch?.[1] ?? dashboardMatch?.[1]
        ?? adminMatch?.[1] ?? auditMatch?.[1] ?? joinCodeMatch?.[1] ?? organizationMatch?.[1]
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
        if (request.method === 'GET' && dashboardMatch && getOrganizationDashboard) {
          return json(getOrganizationDashboard({
            userId: session.userId,
            organizationId,
            since: Date.now() - 30 * 24 * 60 * 60 * 1000,
          }))
        }
        if (request.method === 'GET' && adminMatch && getOrganizationAdmin) {
          return json(getOrganizationAdmin({ userId: session.userId, organizationId }))
        }
        if (request.method === 'GET' && auditMatch && getOrganizationAudit) {
          const limit = Number(url.searchParams.get('limit') ?? '50')
          const beforeValue = url.searchParams.get('before')
          const before = beforeValue === null ? null : Number(beforeValue)
          if (
            !Number.isInteger(limit) || limit < 1 || limit > 200
            || (before !== null && (!Number.isSafeInteger(before) || before < 1))
          ) {
            return json({ error: 'invalid audit pagination', code: 'invalid_request' } satisfies CloudErrorResponse, 400)
          }
          return json(getOrganizationAudit({
            userId: session.userId,
            organizationId,
            limit,
            before,
          }))
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
