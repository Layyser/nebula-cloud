import { expect, test } from 'bun:test'
import {
  NebulaWorkerClient,
  WorkerClientError,
} from '../src/workerClient'

test('rejects a weak worker signing secret', () => {
  expect(() => new NebulaWorkerClient({
    baseURL: 'http://worker.test',
    token: 'too-short',
    workspaceImage: 'nebula-workspace:test',
  })).toThrow('at least 32 characters')
})

test('reads authenticated worker status and capacity', async () => {
  const requests: Request[] = []
  const client = new NebulaWorkerClient({
    baseURL: 'http://worker.test',
    token: 'service-token-0123456789abcdef0123456789',
    workspaceImage: 'nebula-workspace:test',
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({
        service: 'nebula-worker', api_version: 'v1', version: 'test', commit: 'abc123', ready: true,
        capabilities: ['workspace_lifecycle'],
        capacity: {
          total_memory_bytes: 4096, reserved_memory_bytes: 1024,
          total_cpu_millis: 4000, reserved_cpu_millis: 1000,
          total_disk_bytes: 8192, reserved_disk_bytes: 2048,
          total_workspace_slots: 2, reserved_workspace_slots: 1,
        },
      })
    },
  })

  await expect(client.getStatus()).resolves.toMatchObject({
    service: 'nebula-worker', ready: true,
    capacity: { totalMemoryBytes: 4096, reservedWorkspaceSlots: 1 },
  })
  expect(new URL(requests[0]!.url).pathname).toBe('/internal/v1/status')
  expect(requests[0]?.headers.get('authorization')).toStartWith('Nebula-HMAC v1.')
})

test('creates and ensures a workspace with durable worker idempotency keys', async () => {
  const requests: Request[] = []
  const client = new NebulaWorkerClient({
    baseURL: 'http://worker.test',
    token: 'service-token-0123456789abcdef0123456789',
    workspaceImage: 'nebula-workspace:test',
    now: () => Date.UTC(2026, 6, 29, 12, 0, 0),
    nonce: () => '0123456789abcdef',
    fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return Response.json({
        workspace: {
          id: 'workspace-1',
          observed_state: request.method === 'PUT' ? 'stopped' : 'ready',
        },
      }, { status: request.method === 'PUT' ? 201 : 200 })
    },
  })

  const result = await client.ensureWorkspaceRunning({
    workspaceId: 'workspace-1',
    jobId: 'job-1',
  })

  expect(result).toEqual({
    workspaceId: 'workspace-1',
    observedState: 'ready',
  })
  expect(requests.map(request => ({
    method: request.method,
    path: new URL(request.url).pathname,
    key: request.headers.get('idempotency-key'),
    authorization: request.headers.get('authorization'),
  }))).toEqual([
    {
      method: 'PUT',
      path: '/internal/v1/workspaces/workspace-1',
      key: 'job-1:create',
      authorization: expect.stringContaining('Nebula-HMAC v1.'),
    },
    {
      method: 'POST',
      path: '/internal/v1/workspaces/workspace-1/ensure-running',
      key: 'job-1:ensure-running',
      authorization: expect.stringContaining('Nebula-HMAC v1.'),
    },
  ])
  expect(await requests[0]?.json()).toEqual({
    spec: {
      id: 'workspace-1',
      image: 'nebula-workspace:test',
      resources: {},
    },
  })
})

test('preserves stable retryability from worker failures', async () => {
  const client = new NebulaWorkerClient({
    baseURL: 'http://worker.test',
    token: 'service-token-0123456789abcdef0123456789',
    workspaceImage: 'nebula-workspace:test',
    fetch: async () => Response.json({
      error: 'worker is warming up',
      code: 'workspace_unavailable',
      retryable: true,
    }, { status: 503 }),
  })

  try {
    await client.ensureWorkspaceRunning({
      workspaceId: 'workspace-1',
      jobId: 'job-1',
    })
    throw new Error('expected worker request to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(WorkerClientError)
    expect(error).toMatchObject({
      code: 'workspace_unavailable',
      retryable: true,
      status: 503,
    })
  }
})

test('retrieves private runtime access without mutating the worker', async () => {
  const requests: Request[] = []
  const client = new NebulaWorkerClient({
    baseURL: 'http://worker.test/',
    token: 'service-token-0123456789abcdef0123456789',
    workspaceImage: 'nebula-workspace:test',
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({
        workspace_id: 'workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        access_token: 'private-runtime-token',
      })
    },
  })

  expect(await client.getRuntimeAccess({
    workspaceId: 'workspace-1',
  })).toEqual({
    workspaceId: 'workspace-1',
    network: 'private-network',
    address: '172.31.0.7:7777',
    accessToken: 'private-runtime-token',
  })
  expect(requests[0]?.method).toBe('GET')
  expect(new URL(requests[0]!.url).pathname).toBe(
    '/internal/v1/workspaces/workspace-1/runtime-access',
  )
  expect(requests[0]?.headers.get('authorization')).toStartWith(
    'Nebula-HMAC v1.',
  )
  expect(requests[0]?.headers.has('idempotency-key')).toBe(false)
})

test('restarts a workspace with a durable operation key', async () => {
  const requests: Request[] = []
  const client = new NebulaWorkerClient({
    baseURL: 'http://worker.test',
    token: 'service-token-0123456789abcdef0123456789',
    workspaceImage: 'nebula-workspace:test',
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({
        workspace: {
          id: 'workspace-1',
          observed_state: 'ready',
        },
      })
    },
  })

  expect(await client.restartWorkspace({
    workspaceId: 'workspace-1',
    operationId: 'restart-1',
  })).toEqual({
    workspaceId: 'workspace-1',
    observedState: 'ready',
  })
  expect(requests).toHaveLength(1)
  expect(requests[0]?.method).toBe('POST')
  expect(new URL(requests[0]!.url).pathname).toBe(
    '/internal/v1/workspaces/workspace-1/restart',
  )
  expect(requests[0]?.headers.get('idempotency-key')).toBe('restart-1')
  expect(await requests[0]?.json()).toEqual({ timeout_seconds: 30 })
})
