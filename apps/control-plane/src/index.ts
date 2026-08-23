import {
  CONTROL_PLANE_IDLE_TIMEOUT_SECONDS,
  createControlPlaneHandler,
} from './server'
import { initializePersistence } from './persistence'
import {
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  getOrganizationAdminSummary,
  getOrganizationMembers,
  getOrganizationOperators,
  getOrganizationUsageSummary,
  getPersonalUsageSummary,
  isOrganizationMemberEnabled,
  joinOrganizationById,
  OrganizationMemberMutationError,
  recordUsageEvent,
  resolveOrganizationJoinCode,
  resolveWorkspaceAccess,
  rotateOrganizationJoinCode,
  setOrganizationMemberDisabled,
  updateOrganizationName,
} from '@nebula-cloud/database'
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { NebulaWorkerClient } from './workerClient'
import { ProvisioningProcessor } from './provisioningProcessor'
import { RuntimeGateway } from './runtimeGateway'
import {
  attachConsoleBrowser,
  closeConsoleBridge,
  ConsoleGateway,
  forwardConsoleInput,
  type ConsoleBridgeData,
} from './consoleGateway'
import { prepareConsoleUpgrade } from './consoleUpgrade'

const hostname = process.env.NEBULA_CLOUD_BIND?.trim() || '127.0.0.1'
const port = Number.parseInt(process.env.NEBULA_CLOUD_PORT || '7790', 10)
const version = process.env.NEBULA_CLOUD_VERSION || 'dev'
const databasePath = process.env.NEBULA_CLOUD_DATABASE_PATH?.trim() || './data/nebula-cloud.sqlite'
const authBaseURL = process.env.BETTER_AUTH_URL?.trim() || `http://${hostname}:${port}`
const authSecret = process.env.BETTER_AUTH_SECRET?.trim() || ''
const organizationCodeSecret = process.env.NEBULA_ORGANIZATION_CODE_SECRET?.trim()
  || authSecret
const trustedOrigins = (process.env.NEBULA_CLOUD_TRUSTED_ORIGINS
  || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const workerURL = process.env.NEBULA_WORKER_URL?.trim() || ''
const workerToken = process.env.NEBULA_WORKER_TOKEN?.trim() || ''
const workspaceImage = process.env.NEBULA_WORKSPACE_IMAGE?.trim()
  || 'nebula-workspace:dev'

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

const { database, auth } = await initializePersistence({
  databasePath,
  authSecret,
  authBaseURL,
  trustedOrigins,
})

if (Boolean(workerURL) !== Boolean(workerToken)) {
  database.close()
  throw new Error('NEBULA_WORKER_URL and NEBULA_WORKER_TOKEN must be configured together')
}

const workerClient = workerURL
  ? new NebulaWorkerClient({
      baseURL: workerURL,
      token: workerToken,
      workspaceImage,
    })
  : null

const provisioningProcessor = workerClient
  ? new ProvisioningProcessor({
      database,
      worker: workerClient,
      processorId: `control-plane-${randomUUID()}`,
    })
  : null

const runtimeGateway = workerClient
  ? new RuntimeGateway({
      worker: workerClient,
      resolveWorkspace: input => resolveWorkspaceAccess(database, input),
      recordUsageEvent: input => recordUsageEvent(database, input),
    })
  : null

const consoleGateway = workerClient
  ? new ConsoleGateway({
      workerURL,
      workerToken,
      resolveWorkspace: input => resolveWorkspaceAccess(database, input),
    })
  : null

const controlPlaneHandler = createControlPlaneHandler({
  version,
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
  restartWorkspace: workerClient
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
        const restarted = await workerClient.restartWorkspace({
          workspaceId: workspace.workerWorkspaceId,
          operationId: `cloud-restart-${randomUUID()}`,
        })
        return {
          workspaceId,
          state: restarted.observedState as 'ready',
        }
      }
    : undefined,
  getOperatorRuntime: workerClient
    ? async ({ workspaceId, userId, organizationId }) => {
        const workspace = resolveWorkspaceAccess(database, {
          workspaceId,
          userId,
          organizationId,
        })
        if (!workspace?.workerWorkspaceId) return null
        const operator = await workerClient.getWorkspace({
          workspaceId: workspace.workerWorkspaceId,
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
  setOrganizationMemberDisabled: input => setOrganizationMemberDisabled(database, input),
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
  rotateOrganizationJoinCode: input => {
    const lookupKey = randomBytes(6).toString('hex').toUpperCase()
    rotateOrganizationJoinCode(database, { ...input, lookupKey })
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
    return {
      organizationId: resolved.organizationId,
      membershipId: joinOrganizationById(database, {
        userId,
        organizationId: resolved.organizationId,
      }),
    }
  },
  updateOrganization: input => updateOrganizationName(database, input),
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
    if (!consoleRoute) return await controlPlaneHandler(request)
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
  provisioningProcessor?.stop()
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
