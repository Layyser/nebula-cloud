import { expect, test } from 'bun:test'
import {
  ensurePersonalWorkspace,
  migrateCloudSchema,
  openCloudDatabase,
  recordWorkerHealth,
  upsertWorkerHost,
  type WorkerHost,
} from '@nebula-cloud/database'
import {
  WorkerDirectory,
  type RoutedWorkerClient,
  type WorkerClientResolver,
} from '../src/workerDirectory'

test('routes provisioning through the worker selected by the durable directory', async () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
      );
      INSERT INTO user (id) VALUES ('user-1');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId)
        VALUES ('member-1', 'user-1', 'org-1');
    `)
    migrateCloudSchema(database)
    upsertWorkerHost(database, {
      id: 'worker-a',
      name: 'Worker A',
      provider: 'local',
      region: 'local',
      baseURL: 'http://worker-a:7780',
      credentialKeyId: 'worker-a-token',
      totalMemoryBytes: 4096,
      totalCpuMillis: 4000,
      totalDiskBytes: 8192,
      totalWorkspaceSlots: 2,
    })
    recordWorkerHealth(database, {
      workerHostId: 'worker-a',
      state: 'healthy',
    })
    const workspace = ensurePersonalWorkspace(database, {
      userId: 'user-1',
      organizationId: 'org-1',
      createId: () => 'workspace-1',
    })
    const calls: Array<{ hostId: string; workspaceId: string }> = []
    const client: RoutedWorkerClient = {
      getStatus: async () => ({
        service: 'nebula-worker', apiVersion: 'v1', version: 'test', commit: 'test', ready: true,
        capabilities: [],
        capacity: {
          totalMemoryBytes: 4096, reservedMemoryBytes: 0,
          totalCpuMillis: 4000, reservedCpuMillis: 0,
          totalDiskBytes: 8192, reservedDiskBytes: 0,
          totalWorkspaceSlots: 2, reservedWorkspaceSlots: 0,
        },
      }),
      ensureWorkspaceRunning: async input => {
        calls.push({ hostId: 'worker-a', workspaceId: input.workspaceId })
        return { workspaceId: input.workspaceId, observedState: 'ready' }
      },
      getRuntimeAccess: async input => ({
        workspaceId: input.workspaceId,
        network: 'private',
        address: '127.0.0.1:7777',
        accessToken: 'runtime-token',
      }),
      getWorkspace: async input => ({
        workspaceId: input.workspaceId,
        observedState: 'ready',
        image: 'nebula:test',
        resources: {
          memory_request_bytes: 1,
          memory_limit_bytes: 1,
          cpu_request: 1,
          cpu_limit: 1,
          pids_limit: 1,
          disk_limit_bytes: 1,
        },
      }),
      restartWorkspace: async input => ({
        workspaceId: input.workspaceId,
        observedState: 'ready',
      }),
      proxyWorkspaceService: async () => new Response('proxied'),
    }
    const resolver: WorkerClientResolver = {
      connection: (host: WorkerHost) => ({
        baseURL: host.baseURL,
        token: 'worker-service-token-0123456789abcdef',
      }),
      client: host => {
        expect(host.id).toBe('worker-a')
        return client
      },
    }
    const directory = new WorkerDirectory({
      database,
      clientFactory: resolver,
      placementRequirements: {
        memoryBytes: 1024,
        cpuMillis: 1000,
        diskBytes: 2048,
      },
      heartbeatMaxAgeMs: 1000,
    })

    await expect(directory.ensureWorkspaceRunning({
      workspaceId: workspace.id,
      jobId: 'job-1',
    })).resolves.toMatchObject({ observedState: 'ready' })
    expect(calls).toEqual([{ hostId: 'worker-a', workspaceId: 'workspace-1' }])
  } finally {
    database.close()
  }
})
