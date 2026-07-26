import { createControlPlaneHandler } from './server'
import { initializePersistence } from './persistence'
import {
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
} from '@nebula-cloud/database'
import { randomUUID } from 'node:crypto'
import { NebulaWorkerClient } from './workerClient'
import { ProvisioningProcessor } from './provisioningProcessor'

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

const provisioningProcessor = workerURL
  ? new ProvisioningProcessor({
      database,
      worker: new NebulaWorkerClient({
        baseURL: workerURL,
        token: workerToken,
        workspaceImage,
      }),
      processorId: `control-plane-${randomUUID()}`,
    })
  : null

const server = Bun.serve({
  hostname,
  port,
  fetch: createControlPlaneHandler({
    version,
    authHandler: auth.handler,
    resolveSession: async request => {
      const session = await auth.api.getSession({
        headers: request.headers,
      })
      return session ? { userId: session.user.id } : null
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
  }),
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
