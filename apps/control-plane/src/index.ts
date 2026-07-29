import { createControlPlaneHandler } from './server'
import { initializePersistence } from './persistence'
import {
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  resolveWorkspaceAccess,
} from '@nebula-cloud/database'
import { randomUUID } from 'node:crypto'
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
const trustedOrigins = (process.env.NEBULA_CLOUD_TRUSTED_ORIGINS
  || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const workerURL = process.env.NEBULA_WORKER_URL?.trim() || ''
const workerToken = process.env.NEBULA_WORKER_TOKEN?.trim() || ''
const workspaceImage = process.env.NEBULA_WORKSPACE_IMAGE?.trim()
  || 'nebula-workspace:dev'

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
  authHandler: auth.handler,
  resolveSession: async request => {
    const session = await auth.api.getSession({
      headers: request.headers,
    })
    return session
      ? {
          userId: session.user.id,
          activeOrganizationId: session.session.activeOrganizationId,
        }
      : null
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
  proxyRuntime: runtimeGateway
    ? input => runtimeGateway.proxy(input)
    : undefined,
})

const server = Bun.serve({
  hostname,
  port,
  async fetch(request, bunServer) {
    const url = new URL(request.url)
    const consoleRoute = url.pathname.match(
      /^\/api\/workspaces\/([^/]+)\/console$/,
    )
    if (!consoleRoute) return await controlPlaneHandler(request)
    const prepared = await prepareConsoleUpgrade({
      request,
      encodedWorkspaceId: consoleRoute[1],
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
