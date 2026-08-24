import {
  CONTROL_PLANE_IDLE_TIMEOUT_SECONDS,
  createControlPlaneHandler,
} from './server'
import { initializePersistence } from './persistence'
import {
  assignWorkspaceWorker,
  createContactRequest,
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  getOrganizationAdminSummary,
  getOrganizationMembers,
  getOrganizationOperators,
  getOrganizationUsageSummary,
  getPersonalUsageSummary,
  isOrganizationMemberEnabled,
  joinOrganizationById,
  listOrganizationAuditEvents,
  OrganizationMemberMutationError,
  recordAuditEvent,
  recordUsageEvent,
  resolveOrganizationJoinCode,
  resolveWorkspaceAccess,
  rotateOrganizationJoinCode,
  setOrganizationMemberDisabled,
  setContactNotificationResult,
  upsertWorkerHost,
  updateOrganizationName,
} from '@nebula-cloud/database'
import {
  contactNotificationEmail,
  createFilesystemEmailSender,
  createResendEmailSender,
} from '@nebula-cloud/auth'
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
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

const hostname = process.env.NEBULA_CLOUD_BIND?.trim() || '127.0.0.1'
const port = Number.parseInt(process.env.NEBULA_CLOUD_PORT || '7790', 10)
const version = process.env.NEBULA_CLOUD_VERSION || 'dev'
const databasePath = process.env.NEBULA_CLOUD_DATABASE_PATH?.trim() || './data/nebula-cloud.sqlite'
const authBaseURL = process.env.BETTER_AUTH_URL?.trim() || `http://${hostname}:${port}`
const authSecret = process.env.BETTER_AUTH_SECRET?.trim() || ''
const publicAppURL = process.env.NEBULA_PUBLIC_APP_URL?.trim()
  || 'http://localhost:5173'
const emailTransport = process.env.NEBULA_EMAIL_TRANSPORT?.trim().toLowerCase()
  || 'disabled'
const emailOutboxDirectory = process.env.NEBULA_EMAIL_OUTBOX_DIR?.trim()
  || './data/email-outbox'
const emailFrom = process.env.NEBULA_EMAIL_FROM?.trim() || ''
const resendApiKey = process.env.RESEND_API_KEY?.trim() || ''
const contactToEmail = process.env.NEBULA_CONTACT_TO_EMAIL?.trim()
  || 'sales@nubols.com'
const requireEmailVerification = parseBooleanEnvironment(
  'NEBULA_REQUIRE_EMAIL_VERIFICATION',
  process.env.NEBULA_REQUIRE_EMAIL_VERIFICATION,
  false,
)
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
}
if (platformAdminToken && platformAdminToken.length < 32) {
  throw new Error('NEBULA_PLATFORM_ADMIN_TOKEN must contain at least 32 characters')
}

const emailSender = emailTransport === 'filesystem'
  ? createFilesystemEmailSender({ directory: emailOutboxDirectory })
  : emailTransport === 'resend'
    ? createResendEmailSender({ apiKey: resendApiKey, from: emailFrom })
    : undefined

const { database, auth } = await initializePersistence({
  databasePath,
  authSecret,
  authBaseURL,
  appBaseURL: publicAppURL,
  trustedOrigins,
  emailSender,
  requireEmailVerification,
})

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
    console.error(JSON.stringify({
      event: 'legacy_workspace_assignment_failed',
      workspaceId: workspace.id,
      message: error instanceof Error ? error.message : 'unknown error',
    }))
  }
}

const provisioningProcessor = new ProvisioningProcessor({
  database,
  worker: workerDirectory,
  processorId: `control-plane-${randomUUID()}`,
})

const runtimeGateway = new RuntimeGateway({
  worker: workerDirectory,
  resolveWorkspace: input => resolveWorkspaceAccess(database, input),
  recordUsageEvent: input => recordUsageEvent(database, input),
})

const consoleGateway = new ConsoleGateway({
  resolveWorkerConnection: workspaceId => workerDirectory.connectionForWorkspace(workspaceId),
  resolveWorkspace: input => resolveWorkspaceAccess(database, input),
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
  authorizeWorkerAdministration: platformAdminToken
    ? request => {
        const authorization = request.headers.get('authorization') ?? ''
        const prefix = 'Bearer '
        return authorization.startsWith(prefix)
          && safeEqual(authorization.slice(prefix.length), platformAdminToken)
      }
    : undefined,
  listWorkerHosts: () => ({ workers: workerAdministration.list() }),
  registerWorkerHost: input => workerAdministration.register(input),
  updateWorkerHost: ({ workerHostId, update }) => (
    workerAdministration.update(workerHostId, update)
  ),
  reconcileUsage: runtimeGateway
    ? async ({ userId, organizationId }) => {
        const workspace = ensurePersonalWorkspace(database, {
          userId,
          organizationId,
        })
        await runtimeGateway.reconcileWorkspaceUsage({
          workspaceId: workspace.id,
          userId,
          organizationId,
        })
      }
    : undefined,
  authHandler: auth.handler,
  resolveSession: async request => {
    const session = await auth.api.getSession({
      headers: request.headers,
    })
    if (!session) return null
    const activeOrganizationId = session.session.activeOrganizationId
    return {
      userId: session.user.id,
      activeOrganizationId: activeOrganizationId
        && isOrganizationMemberEnabled(database, {
          userId: session.user.id,
          organizationId: activeOrganizationId,
        })
        ? activeOrganizationId
        : null,
    }
  },
  ensurePersonalWorkspace: ({ userId, organizationId }) => {
    const workspace = ensurePersonalWorkspace(database, {
      userId,
      organizationId,
    })
    return {
      id: workspace.id,
      organizationId: workspace.organizationId,
      state: workspace.state,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    }
  },
  ensureWorkspaceRunning: ({ userId, organizationId }) => {
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
        const workspace = resolveWorkspaceAccess(database, {
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
        const workspace = resolveWorkspaceAccess(database, {
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
  getOrganizationOperators: input => ({
    operators: getOrganizationOperators(database, input),
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
      return await controlPlaneHandler(request, {
        clientAddress: bunServer.requestIP(request)?.address ?? null,
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
  database.close()
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)

console.info(JSON.stringify({
  event: 'control_plane_started',
  address: server.url.origin,
  database: databasePath,
}))
