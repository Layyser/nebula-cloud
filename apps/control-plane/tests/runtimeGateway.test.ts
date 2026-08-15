import { expect, test } from 'bun:test'
import type { PersonalWorkspace } from '@nebula-cloud/database'
import { RuntimeGateway } from '../src/runtimeGateway'
import { WorkerClientError } from '../src/workerClient'

function workspace(
  overrides: Partial<PersonalWorkspace> = {},
): PersonalWorkspace {
  return {
    id: 'workspace-1',
    memberId: 'member-1',
    organizationId: 'org-1',
    workerWorkspaceId: 'worker-workspace-1',
    state: 'ready',
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }
}

test('streams runtime responses while keeping private credentials server-side', async () => {
  const resolved: unknown[] = []
  let upstreamRequest: Request | null = null
  const gateway = new RuntimeGateway({
    resolveWorkspace: input => {
      resolved.push(input)
      return workspace()
    },
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async (input, init) => {
      upstreamRequest = new Request(input, init)
      const encoder = new TextEncoder()
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"delta"}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'set-cookie': 'runtime-secret=must-not-leak',
          'x-runtime-header': 'preserved',
        },
      })
    },
  })

  const response = await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/v1/turns?after=2',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer browser-token',
          cookie: 'cloud-session=signed',
          'content-type': 'application/json',
          'x-client-version': 'test',
        },
        body: '{"prompt":"hello"}',
      },
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/v1/turns',
    userId: 'user-1',
    organizationId: 'org-1',
  })

  expect(resolved).toEqual([{
    workspaceId: 'workspace-1',
    userId: 'user-1',
    organizationId: 'org-1',
  }])
  expect(upstreamRequest).not.toBeNull()
  expect(upstreamRequest!.url).toBe('http://172.31.0.7:7777/v1/turns?after=2')
  expect(upstreamRequest!.headers.get('authorization')).toBe(
    'Bearer private-runtime-token',
  )
  expect(upstreamRequest!.headers.has('cookie')).toBe(false)
  expect(upstreamRequest!.headers.get('x-client-version')).toBe('test')
  expect(await upstreamRequest!.text()).toBe('{"prompt":"hello"}')

  expect(response.headers.get('set-cookie')).toBeNull()
  expect(response.headers.get('x-runtime-header')).toBe('preserved')
  expect(response.headers.get('cache-control')).toBe('no-store')
  const browserBody = await response.text()
  expect(browserBody).toBe(
    'data: {"type":"delta"}\n\ndata: [DONE]\n\n',
  )
  expect(browserBody).not.toContain('private-runtime-token')
  expect(browserBody).not.toContain('172.31.0.7')
})

test('rejects guessed, foreign, and non-ready workspaces before worker access', async () => {
  let workerCalls = 0
  const gateway = new RuntimeGateway({
    resolveWorkspace: ({ workspaceId }) => {
      if (workspaceId === 'not-ready') return workspace({
        id: 'not-ready',
        state: 'provisioning',
        workerWorkspaceId: null,
      })
      return null
    },
    worker: {
      getRuntimeAccess: async () => {
        workerCalls += 1
        throw new Error('must not run')
      },
    },
  })
  const request = new Request(
    'http://cloud.test/api/workspaces/guessed/runtime/health/ready',
  )

  const missing = await gateway.proxy({
    request,
    workspaceId: 'guessed',
    runtimePath: '/health/ready',
    userId: 'user-1',
    organizationId: 'org-1',
  })
  expect(missing.status).toBe(404)
  expect((await missing.json()).code).toBe('workspace_not_found')

  const pending = await gateway.proxy({
    request,
    workspaceId: 'not-ready',
    runtimePath: '/health/ready',
    userId: 'user-1',
    organizationId: 'org-1',
  })
  expect(pending.status).toBe(409)
  expect((await pending.json()).code).toBe('workspace_not_ready')
  expect(workerCalls).toBe(0)
})

test('sanitizes worker access failures', async () => {
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    worker: {
      getRuntimeAccess: async () => {
        throw new WorkerClientError({
          message: 'secret worker detail',
          code: 'workspace_unavailable',
          retryable: true,
          status: 503,
        })
      },
    },
  })
  const response = await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/health/ready',
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/health/ready',
    userId: 'user-1',
    organizationId: 'org-1',
  })

  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({
    error: 'workspace runtime is unavailable',
    code: 'runtime_access_unavailable',
    retryable: true,
  })
})

test('propagates browser cancellation to the private runtime request', async () => {
  const controller = new AbortController()
  let upstreamSignal: AbortSignal | null | undefined
  let markFetchStarted!: () => void
  const fetchStarted = new Promise<void>(resolve => {
    markFetchStarted = resolve
  })
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async (_input, init) => {
      upstreamSignal = init?.signal
      markFetchStarted()
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        }, { once: true })
      })
    },
  })
  const proxied = gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/runs/events',
      { signal: controller.signal },
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/runs/events',
    userId: 'user-1',
    organizationId: 'org-1',
  })

  await fetchStarted
  controller.abort()
  const response = await proxied
  expect(upstreamSignal?.aborted).toBe(true)
  expect(response.status).toBe(499)
})

test('forwards token, tool, and completion events in arrival order', async () => {
  const encoder = new TextEncoder()
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async () => new Response(new ReadableStream({
      start(controller) {
        streamController = controller
      },
    }), {
      headers: {
        'content-type': 'text/event-stream',
        'x-accel-buffering': 'no',
      },
    }),
  })
  const response = await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/chat/active',
      { method: 'POST', body: '{"message":"inspect"}' },
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/chat/active',
    userId: 'user-1',
    organizationId: 'org-1',
  })
  const reader = response.body!.getReader()
  const firstRead = reader.read()
  streamController.enqueue(encoder.encode(
    'data: {"type":"text","content":"Checking"}\n\n',
  ))
  expect(new TextDecoder().decode((await firstRead).value)).toBe(
    'data: {"type":"text","content":"Checking"}\n\n',
  )

  streamController.enqueue(encoder.encode(
    'data: {"type":"tool","name":"read_file"}\n\n',
  ))
  streamController.enqueue(encoder.encode(
    'data: {"type":"tool_result","name":"read_file","result":{"ok":true}}\n\n',
  ))
  streamController.enqueue(encoder.encode('data: [DONE]\n\n'))
  streamController.close()

  let remainder = ''
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    remainder += new TextDecoder().decode(chunk.value)
  }
  expect(remainder).toBe(
    'data: {"type":"tool","name":"read_file"}\n\n'
    + 'data: {"type":"tool_result","name":"read_file","result":{"ok":true}}\n\n'
    + 'data: [DONE]\n\n',
  )
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  expect(response.headers.get('x-accel-buffering')).toBe('no')
})

test('syncs stable completed-turn usage without changing the chat stream', async () => {
  const recorded: unknown[] = []
  const requests: Request[] = []
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    recordUsageEvent: event => {
      recorded.push(event)
      return true
    },
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      if (request.url.endsWith('/chat/demo/session')) {
        return Response.json({
          provider: 'openai',
          model: 'gpt-test',
          agent: 'Frontend',
          llm_request_log: [{
            event_id: 'stable-turn-1',
            status: 'success',
            created_at: 123,
            usage: {
              input_tokens: 100,
              output_tokens: 25,
              input_tokens_details: { cached_tokens: 40 },
              output_tokens_details: { reasoning_tokens: 5 },
              estimated_cost_microusd: 2_000,
              cache_savings_microusd: 600,
            },
          }],
        })
      }
      return new Response('data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })

  const response = await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/chat/demo',
      { method: 'POST', body: '{"message":"hello"}' },
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/chat/demo',
    userId: 'user-1',
    organizationId: 'org-1',
  })

  expect(await response.text()).toBe('data: [DONE]\n\n')
  expect(requests.map(request => request.url)).toEqual([
    'http://172.31.0.7:7777/chat/demo',
    'http://172.31.0.7:7777/chat/demo/session',
  ])
  expect(recorded).toEqual([{
    eventId: 'stable-turn-1',
    organizationId: 'org-1',
    membershipId: 'member-1',
    workspaceId: 'workspace-1',
    sessionId: 'demo',
    agentId: 'Frontend',
    provider: 'openai',
    model: 'gpt-test',
    inputTokens: 100,
    outputTokens: 25,
    cachedTokens: 40,
    reasoningTokens: 5,
    estimatedCostMicrousd: 2_000,
    cacheSavingsMicrousd: 600,
    outcome: 'success',
    occurredAt: 123000,
  }])
  expect(requests[1].headers.get('authorization')).toBe(
    'Bearer private-runtime-token',
  )
})

test('syncs usage from runtimes released before stable event IDs', async () => {
  const recorded: Array<{ eventId?: string }> = []
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    recordUsageEvent: event => {
      recorded.push(event)
      return true
    },
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async input => {
      if (String(input).endsWith('/chat/demo/session')) {
        return Response.json({
          llm_request_log: [{
            purpose: 'chat',
            status: 'success',
            created_at: 1786717540,
            message_count: 3,
            usage: { input_tokens: 65, output_tokens: 6 },
          }],
        })
      }
      return new Response('data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      })
    },
  })

  const response = await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/chat/demo',
      { method: 'POST', body: '{"message":"hello"}' },
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/chat/demo',
    userId: 'user-1',
    organizationId: 'org-1',
  })

  await response.text()
  expect(recorded).toHaveLength(1)
  expect(recorded[0]?.eventId).toBe(
    'legacy-runtime-usage:workspace-1:demo:1786717540:chat:3:0',
  )
})

test('syncs usage when the browser cancels immediately after the done event', async () => {
  const recorded: unknown[] = []
  const encoder = new TextEncoder()
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    recordUsageEvent: event => {
      recorded.push(event)
      return true
    },
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async input => {
      if (String(input).endsWith('/chat/demo/session')) {
        return Response.json({
          llm_request_log: [{
            event_id: 'cancel-after-done-1',
            status: 'success',
            usage: { input_tokens: 10, output_tokens: 2 },
          }],
        })
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          // The runtime may keep the socket alive briefly after the terminal
          // event. The real browser transport cancels during that interval.
        },
      }), { headers: { 'content-type': 'text/event-stream' } })
    },
  })

  const response = await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/chat/demo',
      { method: 'POST', body: '{"message":"hello"}' },
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/chat/demo',
    userId: 'user-1',
    organizationId: 'org-1',
  })

  const reader = response.body!.getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    'data: [DONE]\n\n',
  )
  await reader.cancel('client saw done')
  await Bun.sleep(0)
  expect(recorded).toHaveLength(1)
})

test('reconciles saved chat usage and display names for dashboard refreshes', async () => {
  const recorded: Array<{ sessionId?: string; sessionDisplayName?: string | null }> = []
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    recordUsageEvent: event => {
      recorded.push(event)
      return true
    },
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async input => {
      const url = String(input)
      if (url.endsWith('/chats')) {
        return Response.json({
          chats: [
            { name: 'first', display_name: 'Review the deployment' },
            { name: 'second', display_name: 'Analyze customer feedback' },
          ],
        })
      }
      return Response.json({
        llm_request_log: [{
          event_id: `usage-${url.includes('/first/') ? 'first' : 'second'}`,
          status: 'success',
          usage: { input_tokens: 10, output_tokens: 2 },
        }],
      })
    },
  })

  await gateway.reconcileWorkspaceUsage({
    workspaceId: 'workspace-1',
    userId: 'user-1',
    organizationId: 'org-1',
  })

  expect(recorded.map(event => event.sessionId)).toEqual(['first', 'second'])
  expect(recorded.map(event => event.sessionDisplayName)).toEqual([
    'Review the deployment',
    'Analyze customer feedback',
  ])
})

test('forwards cancellation and reconnection requests without changing their contract', async () => {
  const requests: Request[] = []
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({ ok: true, status: 'cancelling' })
    },
  })

  const cancel = await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/chat/active/cancel',
      { method: 'POST' },
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/chat/active/cancel',
    userId: 'user-1',
    organizationId: 'org-1',
  })
  expect(cancel.status).toBe(200)
  expect(await cancel.json()).toEqual({ ok: true, status: 'cancelling' })

  await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/chat/active/stream?after=4',
      { headers: { 'last-event-id': '4' } },
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/chat/active/stream',
    userId: 'user-1',
    organizationId: 'org-1',
  })

  expect(requests).toHaveLength(2)
  expect(requests[0].method).toBe('POST')
  expect(requests[0].url).toBe(
    'http://172.31.0.7:7777/chat/active/cancel',
  )
  expect(requests[1].url).toBe(
    'http://172.31.0.7:7777/chat/active/stream?after=4',
  )
  expect(requests[1].headers.get('last-event-id')).toBe('4')
})

test('cancelling the browser response aborts and closes the upstream stream', async () => {
  let upstreamSignal: AbortSignal | null | undefined
  let upstreamCancelled = false
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async (_input, init) => {
      upstreamSignal = init?.signal
      return new Response(new ReadableStream({
        cancel() {
          upstreamCancelled = true
        },
      }))
    },
  })
  const response = await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/chat/slow',
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/chat/slow',
    userId: 'user-1',
    organizationId: 'org-1',
  })

  await response.body!.cancel('left chat')

  expect(upstreamCancelled).toBe(true)
  expect(upstreamSignal?.aborted).toBe(true)
})

test('surfaces runtime termination after already streamed events', async () => {
  const encoder = new TextEncoder()
  let streamController!: ReadableStreamDefaultController<Uint8Array>
  const gateway = new RuntimeGateway({
    resolveWorkspace: () => workspace(),
    worker: {
      getRuntimeAccess: async () => ({
        workspaceId: 'worker-workspace-1',
        network: 'private-network',
        address: '172.31.0.7:7777',
        accessToken: 'private-runtime-token',
      }),
    },
    fetch: async () => new Response(new ReadableStream({
      start(controller) {
        streamController = controller
        controller.enqueue(encoder.encode(
          'data: {"type":"text","content":"partial"}\n\n',
        ))
      },
    })),
  })
  const response = await gateway.proxy({
    request: new Request(
      'http://cloud.test/api/workspaces/workspace-1/runtime/chat/active/stream',
    ),
    workspaceId: 'workspace-1',
    runtimePath: '/chat/active/stream',
    userId: 'user-1',
    organizationId: 'org-1',
  })
  const reader = response.body!.getReader()

  const first = await reader.read()
  expect(new TextDecoder().decode(first.value)).toContain('partial')
  streamController.error(new Error('runtime terminated'))
  expect(reader.read()).rejects.toThrow('runtime terminated')
})
