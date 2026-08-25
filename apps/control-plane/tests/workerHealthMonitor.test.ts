import { expect, test } from 'bun:test'
import {
  getWorkerHost,
  migrateCloudSchema,
  openCloudDatabase,
  recordWorkerHealth,
  upsertWorkerHost,
  type WorkerHost,
} from '@nebula-cloud/database'
import { WorkerHealthMonitor, type WorkerHealthAlert } from '../src/workerHealthMonitor'
import type { WorkerStatus } from '../src/workerClient'
import type { RoutedWorkerClient, WorkerClientResolver } from '../src/workerDirectory'

const healthyStatus: WorkerStatus = {
  service: 'nebula-worker',
  apiVersion: 'v1',
  version: 'test',
  commit: 'abc123',
  ready: true,
  capabilities: ['workspace_lifecycle'],
  capacity: {
    totalMemoryBytes: 4096,
    reservedMemoryBytes: 1024,
    totalCpuMillis: 4000,
    reservedCpuMillis: 1000,
    totalDiskBytes: 8192,
    reservedDiskBytes: 2048,
    totalWorkspaceSlots: 2,
    reservedWorkspaceSlots: 1,
  },
}

test('polls every registered worker and persists authenticated capacity', async () => {
  const database = testDatabase()
  try {
    registerWorker(database, 'worker-a')
    registerWorker(database, 'worker-b')
    const requested: string[] = []
    const monitor = new WorkerHealthMonitor({
      database,
      clients: resolverFor(async host => {
        requested.push(host.id)
        return healthyStatus
      }),
      now: () => 1000,
    })

    await monitor.pollOnce()

    expect(requested.sort()).toEqual(['worker-a', 'worker-b'])
    expect(getWorkerHost(database, 'worker-a')).toMatchObject({
      state: 'healthy',
      lastHeartbeatAt: 1000,
    })
    expect(database.query<{
      reserved_memory_bytes: number
      total_memory_bytes: number
    }, []>(`
      SELECT reserved_memory_bytes, total_memory_bytes
      FROM worker_health_sample
      WHERE worker_host_id = 'worker-a'
    `).get()).toEqual({
      reserved_memory_bytes: 1024,
      total_memory_bytes: 4096,
    })
  } finally {
    database.close()
  }
})

test('fails closed on capacity mismatch and emits transition and stale alerts', async () => {
  const database = testDatabase()
  try {
    registerWorker(database, 'worker-a')
    recordWorkerHealth(database, {
      workerHostId: 'worker-a',
      state: 'healthy',
      now: () => 100,
    })
    const alerts: WorkerHealthAlert[] = []
    const monitor = new WorkerHealthMonitor({
      database,
      clients: resolverFor(async () => ({
        ...healthyStatus,
        capacity: { ...healthyStatus.capacity, totalMemoryBytes: 8192 },
      })),
      now: () => 1000,
      staleAfterMs: 500,
      alert: value => alerts.push(value),
    })

    await monitor.pollOnce()

    expect(getWorkerHost(database, 'worker-a')).toMatchObject({
      state: 'unavailable',
      lastHeartbeatAt: 100,
      lastErrorCode: 'worker_capacity_mismatch',
    })
    expect(alerts.map(alert => alert.event)).toEqual([
      'worker_unavailable',
      'worker_heartbeat_stale',
    ])
  } finally {
    database.close()
  }
})

test('emits recovery once an unavailable worker becomes healthy', async () => {
  const database = testDatabase()
  try {
    registerWorker(database, 'worker-a')
    recordWorkerHealth(database, {
      workerHostId: 'worker-a',
      state: 'unavailable',
      errorCode: 'worker_health_failed',
      heartbeatObserved: false,
      now: () => 100,
    })
    const alerts: WorkerHealthAlert[] = []
    const monitor = new WorkerHealthMonitor({
      database,
      clients: resolverFor(async () => healthyStatus),
      now: () => 1000,
      alert: value => alerts.push(value),
    })

    await monitor.pollOnce()

    expect(getWorkerHost(database, 'worker-a')?.state).toBe('healthy')
    expect(alerts).toEqual([{
      event: 'worker_recovered',
      workerHostId: 'worker-a',
      previousState: 'unavailable',
    }])
  } finally {
    database.close()
  }
})

function testDatabase() {
  const database = openCloudDatabase({ path: ':memory:' })
  database.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY);
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    CREATE TABLE member (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id),
      organizationId TEXT NOT NULL REFERENCES organization(id),
      role TEXT NOT NULL DEFAULT 'member'
    );
  `)
  migrateCloudSchema(database)
  return database
}

function registerWorker(database: ReturnType<typeof testDatabase>, id: string): void {
  upsertWorkerHost(database, {
    id,
    name: id,
    provider: 'local',
    region: 'local',
    baseURL: `http://${id}:7780`,
    credentialKeyId: `${id}-token`,
    totalMemoryBytes: 4096,
    totalCpuMillis: 4000,
    totalDiskBytes: 8192,
    totalWorkspaceSlots: 2,
  })
}

function resolverFor(
  status: (host: WorkerHost) => Promise<WorkerStatus>,
): WorkerClientResolver {
  return {
    connection: host => ({ baseURL: host.baseURL, token: 'test-token' }),
    client: host => ({
      getStatus: () => status(host),
      ensureWorkspaceRunning: unsupported,
      getRuntimeAccess: unsupported,
      getWorkspace: unsupported,
      restartWorkspace: unsupported,
      proxyWorkspaceService: unsupported,
    } as RoutedWorkerClient),
  }
}

async function unsupported(): Promise<never> {
  throw new Error('not used by this test')
}
