import { expect, test } from 'bun:test'
import {
  ensureWorkspaceRunning,
  migrateCloudSchema,
  openCloudDatabase,
} from '@nebula-cloud/database'
import { ProvisioningProcessor } from '../src/provisioningProcessor'
import { WorkerClientError } from '../src/workerClient'

function provisioningDatabase() {
  const database = openCloudDatabase({ path: ':memory:' })
  database.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY);
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    CREATE TABLE member (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id),
      organizationId TEXT NOT NULL REFERENCES organization(id)
    );
    INSERT INTO user (id) VALUES ('user-1');
    INSERT INTO organization (id) VALUES ('org-1');
    INSERT INTO member (id, userId, organizationId)
      VALUES ('member-1', 'user-1', 'org-1');
  `)
  migrateCloudSchema(database)
  ensureWorkspaceRunning(database, {
    userId: 'user-1',
    organizationId: 'org-1',
    createId: () => 'workspace-1',
    createJobId: () => 'job-1',
    now: () => 1,
  })
  return database
}

test('completes a durable job after the worker reports ready', async () => {
  const database = provisioningDatabase()
  try {
    const processor = new ProvisioningProcessor({
      database,
      processorId: 'processor-1',
      worker: {
        ensureWorkspaceRunning: async input => ({
          workspaceId: input.workspaceId,
          observedState: 'ready',
        }),
      },
    })

    expect(await processor.processNext()).toBe(true)
    expect(database.query<{ state: string; worker: string | null }, []>(`
      SELECT state, worker_workspace_id AS worker FROM workspace
    `).get()).toEqual({
      state: 'ready',
      worker: 'workspace-1',
    })
    expect(database.query<{ status: string; attempt: number }, []>(`
      SELECT status, attempt FROM provisioning_job
    `).get()).toEqual({
      status: 'succeeded',
      attempt: 1,
    })
  } finally {
    database.close()
  }
})

test('requeues retryable worker failures without losing the job', async () => {
  const database = provisioningDatabase()
  try {
    const processor = new ProvisioningProcessor({
      database,
      processorId: 'processor-1',
      worker: {
        ensureWorkspaceRunning: async () => {
          throw new WorkerClientError({
            message: 'worker unavailable',
            code: 'worker_unavailable',
            retryable: true,
            status: 503,
          })
        },
      },
    })

    expect(await processor.processNext()).toBe(true)
    expect(database.query<{
      status: string
      attempt: number
      error: string | null
    }, []>(`
      SELECT status, attempt, error_code AS error FROM provisioning_job
    `).get()).toEqual({
      status: 'queued',
      attempt: 1,
      error: 'worker_unavailable',
    })
    expect(database.query<{ state: string }, []>(
      'SELECT state FROM workspace',
    ).get()?.state).toBe('provisioning')
  } finally {
    database.close()
  }
})

