import {
  CONTROL_PLANE_IDLE_TIMEOUT_SECONDS,
  createControlPlaneHandler,
} from './server'
import { initializePersistence } from './persistence'
import {
  assignStripeOperatorSeat,
  assignWorkspaceWorker,
  createContactRequest,
  createPlanAccount,
  deleteContactRequestsCreatedBefore,
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  getOrganizationAdminSummary,
  getOrganizationInvitationStatus,
  getOrganizationDashboardSummary,
  getOrganizationMembers,
  getOrganizationOperators,
  getOrganizationUsageSummary,
  getPersonalUsageSummary,
  getPersonalWorkspace,
  listPlanAccountsForUser,
  getPublishedServiceBySlug,
  getPublishedServiceByIngressPort,
  getPublishedServiceByName,
  getWorkspaceOwnerIdentity,
  getWorkspaceById,
  hasActiveOperatorEntitlement,
  isPlatformControlPaused,
  isOrganizationMemberEnabled,
  joinOrganizationById,
  listContactRequests,
  listOrganizationAuditEvents,
  listPlatformControls,
  listPublishedServices,
  listTCPPublishedServices,
  OrganizationMemberMutationError,
  OperatorEntitlementRequiredError,
  PlatformControlPausedError,
  recordAuditEvent,
  recordPlatformOperationAuditEvent,
  recordUsageEvent,
  resolveOrganizationJoinCode,
  resolveWorkspaceAccess,
  revokePublishedService,
  revokeOrganizationPublishedServices,
  revokeOperatorEntitlement,
  revokeStripeOperatorSeat,
  rotateOrganizationJoinCode,
  setOrganizationMemberDisabled,
  setPlatformControl,
  setContactNotificationResult,
  upsertWorkerHost,
  updateContactRequestStatus,
  updateOrganizationName,
  upsertPublishedService,
  upsertOperatorEntitlement,
} from '@nebula-cloud/database'
import {
  contactNotificationEmail,
  createFilesystemEmailSender,
  createResendEmailSender,
} from '@nebula-cloud/auth'
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import { ProvisioningProcessor } from './provisioningProcessor'
import {
  MapWorkerCredentialProvider,
  WorkerClientFactory,
  WorkerDirectory,
} from './workerDirectory'
import { RuntimeGateway } from './runtimeGateway'
import {
  attachConsoleBrowser,
  closeConsoleBridge,
  ConsoleGateway,
  forwardConsoleInput,
  type ConsoleBridgeData,
} from './consoleGateway'
import { prepareConsoleUpgrade } from './consoleUpgrade'
import { WorkerAdministration } from './workerAdministration'
import { loadWorkerCredentials } from './workerCredentials'
import { WorkerHealthMonitor } from './workerHealthMonitor'
import { PublishedServiceGateway } from './publishedServiceGateway'
import { workspacePublicationAuthenticated } from './workspacePublicationAuth'
import { parsePublishedServiceOrigin } from './publishedServiceRouting'
import { hashPublishedServiceToken } from './publishedServiceAccess'
import { TCPIngress } from './tcpIngress'
import { StripeWebhookProcessor } from './stripeWebhook'
import { PublicationConnectionLimiter } from './publicationConnectionLimiter'
import { PublicationBandwidthLimiter } from './publicationBandwidthLimiter'
import { TCPPublicationReconciler } from './tcpPublicationReconciler'
import { createDiagnosticEmailSender } from './diagnosticEmailSender'
import { ResendWebhookProcessor } from './resendWebhook'
import { AuthRateLimiter } from './authRateLimiter'
import { resolveClientAddress } from './clientAddress'
import { safeLogJSON } from './safeLog'
import { allowedSignUpEmailsFromEnvironment } from './signUpPolicy'

const hostname = process.env.NEBULA_CLOUD_BIND?.trim() || '127.0.0.1'
const port = Number.parseInt(process.env.NEBULA_CLOUD_PORT || '7790', 10)
const version = process.env.NEBULA_CLOUD_VERSION || 'dev'
const databasePath = process.env.NEBULA_CLOUD_DATABASE_PATH?.trim() || './data/nebula-cloud.sqlite'
const authBaseURL = process.env.BETTER_AUTH_URL?.trim() || `http://${hostname}:${port}`
const authSecret = process.env.BETTER_AUTH_SECRET?.trim() || ''
const publicAppURL = process.env.NEBULA_PUBLIC_APP_URL?.trim()
  || 'http://localhost:5173'
const publishedServiceOrigin = parsePublishedServiceOrigin(
  process.env.NEBULA_PUBLISHED_SERVICE_ORIGIN,
)
const emailTransport = process.env.NEBULA_EMAIL_TRANSPORT?.trim().toLowerCase()
  || 'disabled'
const emailOutboxDirectory = process.env.NEBULA_EMAIL_OUTBOX_DIR?.trim()
  || './data/email-outbox'
const emailFrom = process.env.NEBULA_EMAIL_FROM?.trim() || ''
const resendApiKey = process.env.RESEND_API_KEY?.trim() || ''
const resendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() || ''
const contactToEmail = process.env.NEBULA_CONTACT_TO_EMAIL?.trim()
  || 'sales@nubols.com'
const requireEmailVerification = parseBooleanEnvironment(
  'NEBULA_REQUIRE_EMAIL_VERIFICATION',
  process.env.NEBULA_REQUIRE_EMAIL_VERIFICATION,
  false,
)
const allowedSignUpEmails = allowedSignUpEmailsFromEnvironment()
const organizationCodeSecret = process.env.NEBULA_ORGANIZATION_CODE_SECRET?.trim()
  || authSecret
const contactSourceHashSecret = process.env.NEBULA_CONTACT_SOURCE_HASH_SECRET?.trim()
  || organizationCodeSecret
const runtimeEnvironment = process.env.NODE_ENV?.trim().toLowerCase() || 'development'
const trustedOrigins = (process.env.NEBULA_CLOUD_TRUSTED_ORIGINS
  || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const workerURL = process.env.NEBULA_WORKER_URL?.trim() || ''
const workerToken = process.env.NEBULA_WORKER_TOKEN?.trim() || ''
const workspaceImage = process.env.NEBULA_WORKSPACE_IMAGE?.trim()
  || 'nebula-workspace:dev'
const workerId = process.env.NEBULA_WORKER_ID?.trim() || 'local-worker'
const workerCredentialKeyId = process.env.NEBULA_WORKER_CREDENTIAL_KEY_ID?.trim()
  || 'local-worker-token'
const workerCredentialsFile = process.env.NEBULA_WORKER_CREDENTIALS_FILE?.trim()
const platformAdminToken = process.env.NEBULA_PLATFORM_ADMIN_TOKEN?.trim() || ''
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || ''
const trustLocalProxy = parseBooleanEnvironment(
  'NEBULA_CLOUD_TRUST_LOCAL_PROXY',
  process.env.NEBULA_CLOUD_TRUST_LOCAL_PROXY,
  runtimeEnvironment === 'production',
)

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`)
  }
  return value
}

const gibibyte = 1024 * 1024 * 1024
const workerCapacity = {
  memoryBytes: positiveIntegerEnvironment('NEBULA_WORKER_TOTAL_MEMORY_BYTES', 16 * gibibyte),
  cpuMillis: positiveIntegerEnvironment('NEBULA_WORKER_TOTAL_CPU_MILLIS', 8000),
  diskBytes: positiveIntegerEnvironment('NEBULA_WORKER_TOTAL_DISK_BYTES', 100 * gibibyte),
  workspaceSlots: positiveIntegerEnvironment('NEBULA_WORKER_TOTAL_WORKSPACE_SLOTS', 4),
}
const workspaceReservation = {
  memoryBytes: positiveIntegerEnvironment('NEBULA_WORKSPACE_MEMORY_RESERVATION_BYTES', 4 * gibibyte),
  cpuMillis: positiveIntegerEnvironment('NEBULA_WORKSPACE_CPU_RESERVATION_MILLIS', 2000),
  diskBytes: positiveIntegerEnvironment('NEBULA_WORKSPACE_DISK_RESERVATION_BYTES', 5 * gibibyte),
  workspaceSlots: 1,
}
const workerHealthIntervalMs = positiveIntegerEnvironment(
  'NEBULA_WORKER_HEALTH_INTERVAL_MS',
  10000,
)
const workerHealthTimeoutMs = positiveIntegerEnvironment(
  'NEBULA_WORKER_HEALTH_TIMEOUT_MS',
  5000,
)
const workerHeartbeatStaleMs = positiveIntegerEnvironment(
  'NEBULA_WORKER_HEARTBEAT_STALE_MS',
  30000,
)
const entitlementsRequired = parseBooleanEnvironment(
  'NEBULA_ENTITLEMENTS_REQUIRED',
  process.env.NEBULA_ENTITLEMENTS_REQUIRED,
  false,
)
const tcpIngressEnabled = parseBooleanEnvironment(
  'NEBULA_TCP_INGRESS_ENABLED',
  process.env.NEBULA_TCP_INGRESS_ENABLED,
  false,
)
const tcpIngressBind = process.env.NEBULA_TCP_INGRESS_BIND?.trim() || '127.0.0.1'
const tcpIngressHost = process.env.NEBULA_TCP_INGRESS_HOST?.trim() || 'tcp.nubols.com'
const tcpIngressPortMinimum = positiveIntegerEnvironment('NEBULA_TCP_INGRESS_PORT_MIN', 20000)
const tcpIngressPortMaximum = positiveIntegerEnvironment('NEBULA_TCP_INGRESS_PORT_MAX', 20999)
const tcpPublicationReconcileIntervalMs = positiveIntegerEnvironment(
  'NEBULA_TCP_PUBLICATION_RECONCILE_INTERVAL_MS',
  5_000,
)
const workspacePublicationLimit = positiveIntegerEnvironment(
  'NEBULA_WORKSPACE_PUBLICATION_LIMIT',
  5,
)
const organizationPublicationLimit = positiveIntegerEnvironment(
  'NEBULA_ORGANIZATION_PUBLICATION_LIMIT',
  20,
)
const publicationConnectionLimits = {
  global: positiveIntegerEnvironment('NEBULA_PUBLICATION_MAX_CONNECTIONS', 512),
  perWorker: positiveIntegerEnvironment('NEBULA_PUBLICATION_MAX_CONNECTIONS_PER_WORKER', 256),
  perOrganization: positiveIntegerEnvironment(
    'NEBULA_PUBLICATION_MAX_CONNECTIONS_PER_ORGANIZATION',
    64,
  ),
  perRoute: positiveIntegerEnvironment('NEBULA_PUBLICATION_MAX_CONNECTIONS_PER_ROUTE', 32),
}
const mebibyte = 1024 * 1024
const publicationBandwidthLimits = {
  windowMs: positiveIntegerEnvironment('NEBULA_PUBLICATION_BANDWIDTH_WINDOW_MS', 60_000),
  globalBytes: positiveIntegerEnvironment(
    'NEBULA_PUBLICATION_BANDWIDTH_BYTES_PER_WINDOW',
    2048 * mebibyte,
  ),
  perWorkerBytes: positiveIntegerEnvironment(
    'NEBULA_PUBLICATION_BANDWIDTH_BYTES_PER_WORKER_WINDOW',
    1024 * mebibyte,
  ),
  perOrganizationBytes: positiveIntegerEnvironment(
    'NEBULA_PUBLICATION_BANDWIDTH_BYTES_PER_ORGANIZATION_WINDOW',
    256 * mebibyte,
  ),
  perRouteBytes: positiveIntegerEnvironment(
    'NEBULA_PUBLICATION_BANDWIDTH_BYTES_PER_ROUTE_WINDOW',
    128 * mebibyte,
  ),
}
if (tcpIngressPortMinimum > tcpIngressPortMaximum
  || (tcpIngressPortMinimum <= 7777 && tcpIngressPortMaximum >= 7777)
  || tcpIngressPortMaximum > 65535) {
  throw new Error('NEBULA_TCP_INGRESS_PORT_MIN/MAX are invalid')
}
if (workspacePublicationLimit > 100 || organizationPublicationLimit > 10_000) {
  throw new Error('Publication limits exceed their safe maximums')
}
const publicationConnectionLimiter = new PublicationConnectionLimiter(publicationConnectionLimits)
const publicationBandwidthLimiter = new PublicationBandwidthLimiter(publicationBandwidthLimits)
const contactRetentionDays = positiveIntegerEnvironment(
  'NEBULA_CONTACT_RETENTION_DAYS',
  730,
)
if (contactRetentionDays > 36500) {
  throw new Error('NEBULA_CONTACT_RETENTION_DAYS must not exceed 36500')
}

function organizationCodeSignature(organizationId: string, lookupKey: string): string {
  return createHmac('sha256', organizationCodeSecret)
    .update(`${organizationId}:${lookupKey}`)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase()
}

function organizationCode(organizationId: string, lookupKey: string): string {
  return `NBL-${lookupKey}-${organizationCodeSignature(organizationId, lookupKey)}`
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
}

function authorizePlatformAdministration(request: Request): boolean {
  const authorization = request.headers.get('authorization') ?? ''
  const prefix = 'Bearer '
  return Boolean(platformAdminToken)
    && authorization.startsWith(prefix)
    && safeEqual(authorization.slice(prefix.length), platformAdminToken)
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('NEBULA_CLOUD_PORT must be an integer between 1 and 65535')
}
if (authSecret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters')
}
if (!['disabled', 'filesystem', 'resend'].includes(emailTransport)) {
  throw new Error('NEBULA_EMAIL_TRANSPORT must be disabled, filesystem, or resend')
}
if (emailTransport === 'resend' && (!resendApiKey || !emailFrom)) {
  throw new Error('Resend email transport requires RESEND_API_KEY and NEBULA_EMAIL_FROM')
}
if (runtimeEnvironment === 'production') {
  if (emailTransport !== 'resend') {
    throw new Error('Production requires a non-filesystem transactional email transport')
  }
  if (!requireEmailVerification) {
    throw new Error('Production requires email verification')
  }
  if (!process.env.NEBULA_CONTACT_SOURCE_HASH_SECRET?.trim()) {
    throw new Error('Production requires NEBULA_CONTACT_SOURCE_HASH_SECRET')
  }
  if (!resendWebhookSecret) {
    throw new Error('Production requires RESEND_WEBHOOK_SECRET')
  }
}
if (platformAdminToken && platformAdminToken.length < 32) {
  throw new Error('NEBULA_PLATFORM_ADMIN_TOKEN must contain at least 32 characters')
}

const providerEmailSender = emailTransport === 'filesystem'
  ? createFilesystemEmailSender({ directory: emailOutboxDirectory })
  : emailTransport === 'resend'
    ? createResendEmailSender({ apiKey: resendApiKey, from: emailFrom })
    : undefined
let emailDiagnosticDatabase: Database | null = null
const emailSender = providerEmailSender
  ? createDiagnosticEmailSender({
      sender: providerEmailSender,
      provider: emailTransport,
      recipientHashSecret: contactSourceHashSecret,
      database: () => {
        if (!emailDiagnosticDatabase) throw new Error('Email diagnostics database is unavailable')
        return emailDiagnosticDatabase
      },
    })
  : undefined

const { database, auth } = await initializePersistence({
  databasePath,
  authSecret,
  authBaseURL,
  appBaseURL: publicAppURL,
  trustedOrigins,
  emailSender,
  requireEmailVerification,
  allowedSignUpEmails,
})
emailDiagnosticDatabase = database
const authRateLimiter = new AuthRateLimiter({
  database,
  hashSecret: contactSourceHashSecret,
})
const stripeWebhookProcessor = stripeWebhookSecret
  ? new StripeWebhookProcessor({ database, webhookSecret: stripeWebhookSecret })
  : null
const resendWebhookProcessor = resendWebhookSecret
  ? new ResendWebhookProcessor({ database, webhookSecret: resendWebhookSecret })
  : null

function purgeExpiredContactRequests(): number {
  const retentionMs = contactRetentionDays * 24 * 60 * 60 * 1000
  return deleteContactRequestsCreatedBefore(
    database,
    Math.max(0, Date.now() - retentionMs),
  )
}

const expiredContactRequests = purgeExpiredContactRequests()
if (expiredContactRequests > 0) {
  console.info(JSON.stringify({
    event: 'expired_contact_requests_deleted',
    count: expiredContactRequests,
    retentionDays: contactRetentionDays,
  }))
}

if (Boolean(workerURL) !== Boolean(workerToken)) {
  database.close()
  throw new Error('NEBULA_WORKER_URL and NEBULA_WORKER_TOKEN must be configured together')
}

const workerCredentials = loadWorkerCredentials({
  filePath: workerCredentialsFile,
  legacyCredential: workerToken
    ? { keyId: workerCredentialKeyId, secret: workerToken }
    : undefined,
})
if (workerURL) {
  upsertWorkerHost(database, {
    id: workerId,
    name: workerId,
    provider: process.env.NEBULA_WORKER_PROVIDER?.trim() || 'local',
    region: process.env.NEBULA_WORKER_REGION?.trim() || 'local',
    baseURL: workerURL,
    credentialKeyId: workerCredentialKeyId,
    totalMemoryBytes: workerCapacity.memoryBytes,
    totalCpuMillis: workerCapacity.cpuMillis,
    totalDiskBytes: workerCapacity.diskBytes,
    totalWorkspaceSlots: workerCapacity.workspaceSlots,
  })
}

const clientFactory = new WorkerClientFactory({
  credentials: new MapWorkerCredentialProvider(workerCredentials),
  workspaceImage,
})
const workerDirectory = new WorkerDirectory({
  database,
  clientFactory,
  placementRequirements: workspaceReservation,
  heartbeatMaxAgeMs: workerHeartbeatStaleMs,
})
const workerHealthMonitor = new WorkerHealthMonitor({
  database,
  clients: clientFactory,
  intervalMs: workerHealthIntervalMs,
  timeoutMs: workerHealthTimeoutMs,
  staleAfterMs: workerHeartbeatStaleMs,
})
await workerHealthMonitor.pollOnce()
workerHealthMonitor.start()

const legacyWorkspaceIds = database.query<{ id: string }, []>(`
  SELECT id FROM workspace
  WHERE worker_workspace_id IS NOT NULL AND worker_host_id IS NULL
  ORDER BY created_at, id
`).all()
for (const workspace of legacyWorkspaceIds) {
  try {
    assignWorkspaceWorker(database, {
      workspaceId: workspace.id,
      requirements: workspaceReservation,
      heartbeatMaxAgeMs: workerHeartbeatStaleMs,
    })
  } catch (error) {
    console.error(safeLogJSON({
      event: 'legacy_workspace_assignment_failed',
      workspaceId: workspace.id,
      message: error instanceof Error ? error.message : 'unknown error',
    }))
  }
}

function workspaceHasOperatorEntitlement(workspaceId: string): boolean {
  if (!entitlementsRequired) return true
  const workspace = getWorkspaceById(database, workspaceId)
  return workspace !== null && hasActiveOperatorEntitlement(database, {
    membershipId: workspace.memberId,
    organizationId: workspace.organizationId,
  })
}

function resolveEntitledWorkspaceAccess(
  input: Parameters<typeof resolveWorkspaceAccess>[1],
) {
  const workspace = resolveWorkspaceAccess(database, input)
  if (!workspace || !workspaceHasOperatorEntitlement(workspace.id)) return null
  return workspace
}

const provisioningProcessor = new ProvisioningProcessor({
  database,
  worker: workerDirectory,
  processorId: `control-plane-${randomUUID()}`,
  authorizeWorkspace: workspaceHasOperatorEntitlement,
  canProcess: () => !isPlatformControlPaused(database, 'workspace_start'),
})

const runtimeGateway = new RuntimeGateway({
  worker: workerDirectory,
  resolveWorkspace: resolveEntitledWorkspaceAccess,
  recordUsageEvent: input => recordUsageEvent(database, input),
})

const publishedServiceGateway = new PublishedServiceGateway({
  worker: workerDirectory,
  resolveService: slug => {
    const service = getPublishedServiceBySlug(database, slug)
    return service && workspaceHasOperatorEntitlement(service.workspaceId)
      ? service
      : null
  },
  resolveConnectionScope: publication => {
    const workspace = getWorkspaceById(database, publication.workspaceId)
    return workspace?.workerHostId
      ? {
          workerId: workspace.workerHostId,
          organizationId: workspace.organizationId,
          routeId: publication.id,
        }
      : null
  },
  connectionLimiter: publicationConnectionLimiter,
  bandwidthLimiter: publicationBandwidthLimiter,
})

function publishedServiceURL(slug: string): string {
  if (publishedServiceOrigin) return publishedServiceOrigin.urlForSlug(slug)
  return `${publicAppURL.replace(/\/$/, '')}/p/${encodeURIComponent(slug)}`
}

function publishedServiceSummary(service: ReturnType<typeof upsertPublishedService>) {
  const publicUrl = service.protocol === 'tcp'
    ? `tcp://${tcpIngressHost}:${service.ingressPort}`
    : publishedServiceURL(service.slug)
  return {
    id: service.id,
    name: service.name,
    protocol: service.protocol,
    targetPort: service.targetPort,
    ingressPort: service.ingressPort,
    state: 'active' as const,
    visibility: service.visibility,
    authPolicy: service.authPolicy,
    publicUrl,
    expiresAt: service.expiresAt,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  }
}

function planAccountSummary(account: ReturnType<typeof createPlanAccount>) {
  return {
    id: account.id,
    accountType: account.accountType,
    plan: account.plan,
    organizationId: account.organizationId,
    organizationName: account.organizationName,
    organizationSlug: account.organizationSlug,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}

const tcpIngress = tcpIngressEnabled
  ? new TCPIngress({
      bindHost: tcpIngressBind,
      resolveRoute: ingressPort => {
        if (isPlatformControlPaused(database, 'publication')) return null
        const service = getPublishedServiceByIngressPort(database, ingressPort)
        if (!service || !workspaceHasOperatorEntitlement(service.workspaceId)) return null
        const workspace = getWorkspaceById(database, service.workspaceId)
        return workspace?.workerHostId
          ? {
              routeId: service.id,
              ingressPort,
              workspaceId: service.workspaceId,
              organizationId: workspace.organizationId,
              workerId: workspace.workerHostId,
              targetPort: service.targetPort,
            }
          : null
      },
      resolveWorker: workspaceId => {
        const connection = workerDirectory.tcpConnectionForWorkspace(workspaceId)
        return connection
      },
      connectionLimiter: publicationConnectionLimiter,
      bandwidthLimiter: publicationBandwidthLimiter,
    })
  : null
const tcpPublicationReconciler = tcpIngress
  ? new TCPPublicationReconciler({
      ingress: tcpIngress,
      desiredPorts: () => listTCPPublishedServices(database).map(service => {
        if (service.ingressPort === null) throw new Error('TCP publication has no ingress port')
        return service.ingressPort
      }),
      intervalMs: tcpPublicationReconcileIntervalMs,
      onError: error => console.error(safeLogJSON({
        event: 'tcp_publication_reconciliation_failed',
        message: error instanceof Error ? error.message : 'unknown error',
      })),
    })
  : null
await tcpPublicationReconciler?.start()

const consoleGateway = new ConsoleGateway({
  resolveWorkerConnection: workspaceId => workerDirectory.connectionForWorkspace(workspaceId),
  resolveWorkspace: resolveEntitledWorkspaceAccess,
})
const workerAdministration = new WorkerAdministration(database)

function parseBooleanEnvironment(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value.trim() === '') return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  throw new Error(`${name} must be true, false, 1, or 0`)
}

const controlPlaneHandler = createControlPlaneHandler({
  version,
  handleStripeWebhook: stripeWebhookProcessor
    ? (rawBody, signature) => stripeWebhookProcessor.process(rawBody, signature)
    : undefined,
  handleResendWebhook: resendWebhookProcessor
    ? (rawBody, headers) => resendWebhookProcessor.process(rawBody, headers)
    : undefined,
  publishedServiceHostnameSuffix: publishedServiceOrigin?.hostnameSuffix,
  authorizeWorkerAdministration: platformAdminToken
    ? authorizePlatformAdministration
    : undefined,
  listWorkerHosts: () => ({ workers: workerAdministration.list() }),
  registerWorkerHost: input => workerAdministration.register(input),
  updateWorkerHost: ({ workerHostId, update, actor }) => {
    const worker = workerAdministration.update(workerHostId, update)
    if (worker && update.action && actor) {
      recordPlatformOperationAuditEvent(database, {
        actor,
        action: `worker.${update.action}`,
        targetType: 'worker_host',
        targetId: workerHostId,
        metadata: {
          reason: update.reason ?? null,
          enabled: worker.enabled,
          schedulable: worker.schedulable,
          state: worker.state,
        },
      })
    }
    return worker
  },
  authorizePlatformAdministration: platformAdminToken
    ? authorizePlatformAdministration
    : undefined,
  listPlatformControls: () => ({ controls: listPlatformControls(database) }),
  updatePlatformControl: ({ name, update, actor }) => setPlatformControl(database, {
    name,
    paused: update.paused,
    reason: update.reason,
    actor,
  }),
  platformControlPaused: name => isPlatformControlPaused(database, name),
  revokeOrganizationPublications: async ({ organizationId, actor, reason }) => {
    const publications = revokeOrganizationPublishedServices(database, { organizationId })
    await Promise.all(publications.flatMap(publication => (
      publication.protocol === 'tcp' && publication.ingressPort !== null && tcpIngress
        ? [tcpIngress.deactivate(publication.ingressPort)]
        : []
    )))
    recordPlatformOperationAuditEvent(database, {
      actor,
      action: 'organization.publications_revoked',
      targetType: 'organization',
      targetId: organizationId,
      metadata: {
        reason,
        revokedServices: publications.length,
        tcpServices: publications.filter(publication => publication.protocol === 'tcp').length,
      },
    })
    return { organizationId, revokedServices: publications.length }
  },
  authorizeEntitlementAdministration: platformAdminToken
    ? authorizePlatformAdministration
    : undefined,
  upsertOperatorEntitlement: input => {
    const entitlement = upsertOperatorEntitlement(database, input)
    console.info(JSON.stringify({
      event: 'operator_entitlement_updated',
      membershipId: entitlement.membershipId,
      organizationId: entitlement.organizationId,
      state: entitlement.state,
      source: entitlement.source,
      startsAt: entitlement.startsAt,
      endsAt: entitlement.endsAt,
    }))
    return entitlement
  },
  revokeOperatorEntitlement: input => {
    const entitlement = revokeOperatorEntitlement(database, input)
    if (entitlement) {
      console.info(JSON.stringify({
        event: 'operator_entitlement_revoked',
        membershipId: entitlement.membershipId,
        organizationId: entitlement.organizationId,
      }))
    }
    return entitlement
  },
  authorizeContactAdministration: platformAdminToken
    ? authorizePlatformAdministration
    : undefined,
  listContactRequests: input => {
    purgeExpiredContactRequests()
    const result = listContactRequests(database, input)
    return {
      requests: result.requests.map(request => {
        const { sourceHash: _sourceHash, ...record } = request
        return record
      }),
      nextCursor: result.nextCursor,
    }
  },
  updateContactRequestStatus: input => {
    const request = updateContactRequestStatus(database, input)
    if (!request) return null
    const { sourceHash: _sourceHash, ...record } = request
    return record
  },
  reconcileUsage: runtimeGateway
    ? async ({ userId, organizationId }) => {
        const workspace = ensurePersonalWorkspace(database, {
          userId,
          organizationId,
        })
        if (!workspaceHasOperatorEntitlement(workspace.id)) return
        await runtimeGateway.reconcileWorkspaceUsage({
          workspaceId: workspace.id,
          userId,
          organizationId,
        })
      }
    : undefined,
  authHandler: (request, clientAddress) => authRateLimiter.handle(
    request,
    clientAddress,
    auth.handler,
  ),
  resolveSession: async request => {
    const session = await auth.api.getSession({
      headers: request.headers,
    })
    if (!session) return null
    const activeOrganizationId = session.session.activeOrganizationId
    return {
      userId: session.user.id,
      email: session.user.email,
      activeOrganizationId: activeOrganizationId
        && isOrganizationMemberEnabled(database, {
          userId: session.user.id,
          organizationId: activeOrganizationId,
        })
        ? activeOrganizationId
        : null,
    }
  },
  getInvitationStatus: ({ invitationId, userEmail }) => (
    getOrganizationInvitationStatus(database, { invitationId, userEmail })
  ),
  listPlanAccounts: ({ userId }) => ({
    accounts: listPlanAccountsForUser(database, userId).map(planAccountSummary),
  }),
  createPlanAccount: input => planAccountSummary(createPlanAccount(database, input)),
  ensurePersonalWorkspace: ({ userId, organizationId }) => {
    const existing = getPersonalWorkspace(database, { userId, organizationId })
    if (!existing && isPlatformControlPaused(database, 'provisioning')) {
      throw new PlatformControlPausedError('provisioning')
    }
    const workspace = existing ?? ensurePersonalWorkspace(database, { userId, organizationId })
    return {
      id: workspace.id,
      organizationId: workspace.organizationId,
      state: workspace.state,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    }
  },
  ensureWorkspaceRunning: ({ userId, organizationId }) => {
    const existing = getPersonalWorkspace(database, { userId, organizationId })
    if (!existing && isPlatformControlPaused(database, 'provisioning')) {
      throw new PlatformControlPausedError('provisioning')
    }
    const workspace = existing ?? ensurePersonalWorkspace(database, { userId, organizationId })
    if (!workspaceHasOperatorEntitlement(workspace.id)) {
      throw new OperatorEntitlementRequiredError()
    }
    if (workspace.state !== 'ready' && isPlatformControlPaused(database, 'workspace_start')) {
      throw new PlatformControlPausedError('workspace_start')
    }
    const result = ensureWorkspaceRunning(database, {
      userId,
      organizationId,
    })
    recordAuditEvent(database, {
      userId,
      organizationId,
      action: 'operator.ensure_running_requested',
      targetType: 'workspace',
      targetId: result.workspace.id,
      metadata: {
        state: result.workspace.state,
        scheduled: result.job !== null,
      },
    })
    return {
      workspace: {
        id: result.workspace.id,
        organizationId: result.workspace.organizationId,
        state: result.workspace.state,
        createdAt: result.workspace.createdAt,
        updatedAt: result.workspace.updatedAt,
      },
      job: result.job
        ? {
            id: result.job.id,
            workspaceId: result.job.workspaceId,
            operation: result.job.operation,
            status: result.job.status,
            attempt: result.job.attempt,
            availableAt: result.job.availableAt,
            createdAt: result.job.createdAt,
            updatedAt: result.job.updatedAt,
          }
        : null,
    }
  },
  restartWorkspace: workerDirectory
    ? async ({ workspaceId, userId, organizationId }) => {
        if (isPlatformControlPaused(database, 'workspace_start')) {
          throw new PlatformControlPausedError('workspace_start')
        }
        const workspace = resolveEntitledWorkspaceAccess({
          workspaceId,
          userId,
          organizationId,
        })
        if (!workspace) return null
        if (!workspace.workerWorkspaceId) {
          throw new Error('Workspace has not been assigned to a worker')
        }
        const restarted = await workerDirectory.restartWorkspace({
          workspaceId: workspace.id,
          operationId: `cloud-restart-${randomUUID()}`,
        })
        recordAuditEvent(database, {
          userId,
          organizationId,
          action: 'operator.restart_requested',
          targetType: 'workspace',
          targetId: workspaceId,
          metadata: { workerWorkspaceId: workspace.workerWorkspaceId },
        })
        return {
          workspaceId,
          state: restarted.observedState as 'ready',
        }
      }
    : undefined,
  getOperatorRuntime: workerDirectory
    ? async ({ workspaceId, userId, organizationId }) => {
        const workspace = resolveEntitledWorkspaceAccess({
          workspaceId,
          userId,
          organizationId,
        })
        if (!workspace?.workerWorkspaceId) return null
        const operator = await workerDirectory.getWorkspace({
          workspaceId: workspace.id,
        })
        return {
          workspaceId,
          state: operator.observedState,
          image: operator.image,
          resources: {
            memoryRequestBytes: operator.resources.memory_request_bytes,
            memoryLimitBytes: operator.resources.memory_limit_bytes,
            cpuRequest: operator.resources.cpu_request,
            cpuLimit: operator.resources.cpu_limit,
            pidsLimit: operator.resources.pids_limit,
            diskLimitBytes: operator.resources.disk_limit_bytes,
          },
        }
      }
    : undefined,
  proxyRuntime: runtimeGateway
    ? input => runtimeGateway.proxy(input)
    : undefined,
  authenticateWorkspacePublication: async ({ request, workspaceId }) => {
    return await workspacePublicationAuthenticated({
      request,
      workspaceId,
      worker: workerDirectory,
      workspaceEnabled: id => (
        getWorkspaceOwnerIdentity(database, id) !== null
        && workspaceHasOperatorEntitlement(id)
      ),
    })
  },
  listWorkspacePublications: ({ workspaceId }) => ({
    publications: listPublishedServices(database, workspaceId).map(publishedServiceSummary),
  }),
  upsertWorkspacePublication: async ({ workspaceId, name, protocol, port, visibility, ttlSeconds }) => {
    if (isPlatformControlPaused(database, 'publication')) {
      throw new PlatformControlPausedError('publication')
    }
    if (protocol === 'tcp' && !tcpIngress) {
      throw new Error('TCP ingress is not enabled')
    }
    const owner = getWorkspaceOwnerIdentity(database, workspaceId)
    if (!owner) throw new Error('Workspace owner was not found')
    const accessToken = visibility === 'private'
      ? randomBytes(32).toString('base64url')
      : undefined
    const timestamp = Date.now()
    const previous = getPublishedServiceByName(database, workspaceId, name)
    const publication = upsertPublishedService(database, {
      id: randomUUID(),
      workspaceId,
      name,
      slug: randomBytes(18).toString('hex'),
      protocol,
      targetPort: port,
      visibility,
      authPolicy: visibility === 'private' ? 'token' : 'none',
      accessTokenHash: accessToken
        ? hashPublishedServiceToken(accessToken)
        : null,
      expiresAt: ttlSeconds === null ? null : timestamp + ttlSeconds * 1000,
      now: () => timestamp,
      tcpIngressPortMinimum: tcpIngressPortMinimum,
      tcpIngressPortMaximum: tcpIngressPortMaximum,
      maximumActive: workspacePublicationLimit,
      maximumOrganizationActive: organizationPublicationLimit,
    })
    if (
      previous?.protocol === 'tcp'
      && previous.ingressPort !== null
      && (publication.protocol !== 'tcp' || publication.ingressPort !== previous.ingressPort)
    ) {
      await tcpIngress?.deactivate(previous.ingressPort)
    }
    if (publication.protocol === 'tcp') {
      if (publication.ingressPort === null || !tcpIngress) {
        revokePublishedService(database, { workspaceId, name, now: () => timestamp })
        throw new Error('TCP publication ingress could not be allocated')
      }
      try {
        await tcpIngress.activate(publication.ingressPort)
      } catch (error) {
        revokePublishedService(database, { workspaceId, name, now: () => timestamp })
        throw error
      }
    }
    recordAuditEvent(database, {
      userId: owner.userId,
      organizationId: owner.organizationId,
      action: 'workspace.service_published',
      targetType: 'published_service',
      targetId: publication.id,
      metadata: {
        name: publication.name,
        protocol: publication.protocol,
        targetPort: publication.targetPort,
        visibility: publication.visibility,
        authPolicy: publication.authPolicy,
        expiresAt: publication.expiresAt,
      },
    })
    return {
      publication: publishedServiceSummary(publication),
      ...(accessToken ? { accessToken } : {}),
    }
  },
  revokeWorkspacePublication: async ({ workspaceId, name }) => {
    const owner = getWorkspaceOwnerIdentity(database, workspaceId)
    if (!owner) return false
    const publication = revokePublishedService(database, { workspaceId, name })
    if (!publication) return false
    if (publication.protocol === 'tcp' && publication.ingressPort !== null) {
      await tcpIngress?.deactivate(publication.ingressPort)
    }
    recordAuditEvent(database, {
      userId: owner.userId,
      organizationId: owner.organizationId,
      action: 'workspace.service_revoked',
      targetType: 'published_service',
      targetId: publication.id,
      metadata: {
        name: publication.name,
        protocol: publication.protocol,
        targetPort: publication.targetPort,
        visibility: publication.visibility,
        authPolicy: publication.authPolicy,
        expiresAt: publication.expiresAt,
      },
    })
    return true
  },
  proxyPublishedService: input => publishedServiceGateway.proxy(input),
  getPersonalUsage: input => getPersonalUsageSummary(database, input),
  getOrganizationUsage: input => getOrganizationUsageSummary(database, input),
  getOrganizationMembers: input => getOrganizationMembers(database, input),
  setOrganizationMemberDisabled: input => {
    const member = setOrganizationMemberDisabled(database, input)
    recordAuditEvent(database, {
      userId: input.userId,
      organizationId: input.organizationId,
      action: input.disabled
        ? 'organization.member_disabled'
        : 'organization.member_enabled',
      targetType: 'membership',
      targetId: input.membershipId,
      metadata: { targetUserId: member.userId, role: member.role },
    })
    return member
  },
  assignStripeOperatorSeat: input => assignStripeOperatorSeat(database, input),
  revokeStripeOperatorSeat: input => revokeStripeOperatorSeat(database, input),
  getOrganizationOperators: input => ({
    operators: getOrganizationOperators(database, input),
  }),
  getOrganizationDashboard: input => getOrganizationDashboardSummary(database, {
    ...input,
    heartbeatMaxAgeMs: workerHeartbeatStaleMs,
  }),
  getOrganizationAdmin: input => {
    const summary = getOrganizationAdminSummary(database, input)
    return {
      organization: {
        id: summary.organizationId,
        name: summary.name,
        slug: summary.slug,
      },
      actorRole: summary.actorRole,
      joinCode: summary.joinCodeLookupKey
        ? organizationCode(summary.organizationId, summary.joinCodeLookupKey)
        : null,
      admins: summary.admins,
    }
  },
  getOrganizationAudit: input => ({
    events: listOrganizationAuditEvents(database, input),
  }),
  rotateOrganizationJoinCode: input => {
    const lookupKey = randomBytes(6).toString('hex').toUpperCase()
    rotateOrganizationJoinCode(database, { ...input, lookupKey })
    recordAuditEvent(database, {
      userId: input.userId,
      organizationId: input.organizationId,
      action: 'organization.access_code_rotated',
      targetType: 'organization',
      targetId: input.organizationId,
    })
    return { joinCode: organizationCode(input.organizationId, lookupKey) }
  },
  joinOrganization: ({ userId, code }) => {
    const normalized = code.trim().toUpperCase()
    const match = /^NBL-([A-F0-9]{12})-([A-F0-9]{12})$/.exec(normalized)
    if (!match) {
      throw new OrganizationMemberMutationError('invalid_organization_code', 'Invalid organization code')
    }
    const resolved = resolveOrganizationJoinCode(database, match[1])
    if (!resolved) {
      throw new OrganizationMemberMutationError('invalid_organization_code', 'Invalid organization code')
    }
    const expected = organizationCodeSignature(resolved.organizationId, resolved.lookupKey)
    if (!safeEqual(expected, match[2])) {
      throw new OrganizationMemberMutationError('invalid_organization_code', 'Invalid organization code')
    }
    const membershipId = joinOrganizationById(database, {
      userId,
      organizationId: resolved.organizationId,
    })
    recordAuditEvent(database, {
      userId,
      organizationId: resolved.organizationId,
      action: 'organization.access_code_used',
      targetType: 'membership',
      targetId: membershipId,
    })
    return {
      organizationId: resolved.organizationId,
      membershipId,
    }
  },
  updateOrganization: input => {
    updateOrganizationName(database, input)
    recordAuditEvent(database, {
      userId: input.userId,
      organizationId: input.organizationId,
      action: 'organization.name_updated',
      targetType: 'organization',
      targetId: input.organizationId,
    })
  },
  trustedContactOrigins: trustedOrigins,
  submitContact: emailSender
    ? async input => {
        purgeExpiredContactRequests()
        const sourceHash = createHmac('sha256', contactSourceHashSecret)
          .update(input.sourceAddress || 'unavailable')
          .digest('hex')
        const stored = createContactRequest(database, {
          id: input.submissionId,
          name: input.name,
          email: input.email,
          organization: input.organization,
          topic: input.topic,
          message: input.message,
          sourceHash,
          privacyVersion: input.privacyVersion,
        })
        if (stored.request.notificationStatus !== 'sent') {
          try {
            const receipt = await emailSender.send(contactNotificationEmail({
              to: contactToEmail,
              name: stored.request.name,
              email: stored.request.email,
              organization: stored.request.organization,
              topic: stored.request.topic,
              message: stored.request.message,
              requestId: stored.request.id,
            }))
            setContactNotificationResult(database, {
              requestId: stored.request.id,
              status: 'sent',
              providerMessageId: receipt.providerMessageId,
            })
          } catch (error) {
            setContactNotificationResult(database, {
              requestId: stored.request.id,
              status: 'failed',
            })
            throw error
          }
        }
        return { requestId: stored.request.id, status: 'received' }
      }
    : undefined,
})

const server = Bun.serve({
  hostname,
  port,
  idleTimeout: CONTROL_PLANE_IDLE_TIMEOUT_SECONDS,
  async fetch(request, bunServer) {
    const url = new URL(request.url)
    const consoleRoute = url.pathname.match(
      /^\/api\/workspaces\/([^/]+)\/console(?:\/([^/]+))?$/,
    )
    if (!consoleRoute) {
      const directAddress = bunServer.requestIP(request)?.address ?? null
      return await controlPlaneHandler(request, {
        clientAddress: resolveClientAddress(request, {
          directAddress,
          trustLocalProxy,
        }),
      })
    }
    const prepared = await prepareConsoleUpgrade({
      request,
      encodedWorkspaceId: consoleRoute[1],
      encodedTerminalId: consoleRoute[2],
      trustedOrigins,
      resolveSession: async consoleRequest => {
        const session = await auth.api.getSession({
          headers: consoleRequest.headers,
        })
        return session
          ? {
              userId: session.user.id,
              activeOrganizationId: session.session.activeOrganizationId,
            }
          : null
      },
      consoleGateway,
    })
    if (prepared instanceof Response) return prepared
    if (bunServer.upgrade(request, { data: prepared })) return
    closeConsoleBridge(prepared, 1011, 'Browser upgrade failed')
    return Response.json({
      error: 'Console upgrade failed',
      code: 'console_upgrade_failed',
      retryable: true,
    }, { status: 500 })
  },
  websocket: {
    data: {} as ConsoleBridgeData,
    maxPayloadLength: 64 * 1024,
    idleTimeout: 255,
    perMessageDeflate: false,
    open(socket) {
      attachConsoleBrowser(socket.data, socket)
    },
    message(socket, payload) {
      forwardConsoleInput(socket.data, payload)
    },
    close(socket) {
      closeConsoleBridge(socket.data, 1000, 'Browser disconnected')
    },
  },
})
provisioningProcessor?.start()

let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  provisioningProcessor.stop()
  workerHealthMonitor.stop()
  server.stop(true)
  void tcpIngress?.close()
  database.close()
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)

console.info(safeLogJSON({
  event: 'control_plane_started',
  port,
}))
