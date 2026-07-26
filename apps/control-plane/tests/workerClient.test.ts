import { expect, test } from 'bun:test'
import {
  NebulaWorkerClient,
  WorkerClientError,
} from '../src/workerClient'

test('creates and ensures a workspace with durable worker idempotency keys', async () => {
  const requests: Request[] = []
  const client = new NebulaWorkerClient({
    baseURL: 'http://worker.test',
    token: 'service-token',
    workspaceImage: 'nebula-workspace:test',
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
      authorization: 'Bearer service-token',
    },
    {
      method: 'POST',
      path: '/internal/v1/workspaces/workspace-1/ensure-running',
      key: 'job-1:ensure-running',
      authorization: 'Bearer service-token',
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
    token: 'service-token',
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
    token: 'service-token',
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
  expect(requests[0]?.headers.get('authorization')).toBe('Bearer service-token')
  expect(requests[0]?.headers.has('idempotency-key')).toBe(false)
})
