import { Database } from 'bun:sqlite'
import { workerAuthorizationHeader } from '../src/workerAuth'

const databasePath = requiredEnvironment('NEBULA_CLOUD_DATABASE_PATH')
const workerURL = requiredEnvironment('NEBULA_WORKER_URL').replace(/\/$/, '')
const workerToken = requiredEnvironment('NEBULA_WORKER_TOKEN')

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function demoWorkspaceIds(): string[] {
  try {
    const database = new Database(databasePath, { readonly: true, strict: true })
    try {
      return database.query<{ id: string }, []>('SELECT id FROM workspace ORDER BY id')
        .all()
        .map(row => row.id)
    } finally {
      database.close()
    }
  } catch {
    return []
  }
}

async function remove(
  workspaceId: string,
  suffix: 'runtime' | 'data',
): Promise<void> {
  const path = `/internal/v1/workspaces/${encodeURIComponent(workspaceId)}/${suffix}`
  const response = await fetch(`${workerURL}${path}`, {
    method: 'DELETE',
    headers: {
      authorization: workerAuthorizationHeader({
        secret: workerToken,
        method: 'DELETE',
        path,
      }),
      'content-type': 'application/json',
      'idempotency-key': `demo-cleanup-${suffix}-${crypto.randomUUID()}`,
      'x-nebula-actor-id': 'nebula-demo-cleanup',
    },
    body: JSON.stringify(suffix === 'runtime'
      ? { timeout_seconds: 30 }
      : { confirm_workspace_id: workspaceId }),
  })
  if (response.ok || response.status === 404) return
  throw new Error(
    `Could not delete demo workspace ${workspaceId} ${suffix} (${response.status}): ${await response.text()}`,
  )
}

const workspaceIds = demoWorkspaceIds()
for (const workspaceId of workspaceIds) {
  await remove(workspaceId, 'runtime')
  await remove(workspaceId, 'data')
}

console.log(JSON.stringify({ status: 'ok', deletedWorkspaceIds: workspaceIds }))
