import {
  openCloudDatabase,
  recordUsageEvent,
  resolveWorkspaceAccess,
} from '@nebula-cloud/database'
import { RuntimeGateway } from '../src/runtimeGateway'
import { NebulaWorkerClient } from '../src/workerClient'

interface WorkspaceActor {
  workspaceId: string
  workerWorkspaceId: string
  userId: string
  organizationId: string
}

const databasePath = process.env.NEBULA_CLOUD_DATABASE_PATH?.trim()
  || './data/nebula-cloud.sqlite'
const workerURL = process.env.NEBULA_WORKER_URL?.trim() || ''
const workerToken = process.env.NEBULA_WORKER_TOKEN?.trim() || ''
const workspaceImage = process.env.NEBULA_WORKSPACE_IMAGE?.trim()
  || 'nebula-workspace:dev'

if (!workerURL || !workerToken) {
  throw new Error('NEBULA_WORKER_URL and NEBULA_WORKER_TOKEN are required')
}

const database = openCloudDatabase({ path: databasePath })
const worker = new NebulaWorkerClient({
  baseURL: workerURL,
  token: workerToken,
  workspaceImage,
})
const gateway = new RuntimeGateway({
  worker,
  resolveWorkspace: input => resolveWorkspaceAccess(database, input),
  recordUsageEvent: input => recordUsageEvent(database, input),
})

const workspaces = database.query<WorkspaceActor, []>(`
  SELECT
    workspace.id AS workspaceId,
    workspace.worker_workspace_id AS workerWorkspaceId,
    member.userId AS userId,
    workspace.organization_id AS organizationId
  FROM workspace
  INNER JOIN member ON member.id = workspace.member_id
  WHERE workspace.state = 'ready'
    AND workspace.worker_workspace_id IS NOT NULL
`).all()

try {
  for (const workspace of workspaces) {
    if (process.argv.includes('--restart')) {
      await worker.restartWorkspace({
        workspaceId: workspace.workerWorkspaceId,
        operationId: `usage-reconcile-${crypto.randomUUID()}`,
      })
    }
    await gateway.reconcileWorkspaceUsage(workspace)
  }
  const result = database.query<{ count: number }, []>(`
    SELECT COUNT(*) AS count FROM usage_event
  `).get()
  console.log(JSON.stringify({
    reconciledWorkspaces: workspaces.length,
    usageEvents: result?.count ?? 0,
  }))
} finally {
  database.close()
}
