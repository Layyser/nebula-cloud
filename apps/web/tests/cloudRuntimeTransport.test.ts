import { afterEach, expect, test } from 'bun:test'
import { createCloudRuntimeTransport } from '../src/runtime/cloudRuntimeTransport'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('routes runtime requests through the workspace gateway', async () => {
  let requestUrl = ''
  globalThis.fetch = (async input => {
    requestUrl = String(input)
    return Response.json({ ready: true })
  }) as typeof fetch

  const transport = createCloudRuntimeTransport({
    workspaceId: 'workspace with spaces',
  })
  await transport.request('/health/ready')

  expect(requestUrl).toBe('/api/workspaces/workspace%20with%20spaces/runtime/health/ready')
})

test('supports a separately hosted control-plane gateway', async () => {
  let requestUrl = ''
  let credentials: RequestCredentials | undefined
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    credentials = init?.credentials
    return Response.json({ ok: true })
  }) as typeof fetch

  const transport = createCloudRuntimeTransport({
    workspaceId: 'ws-123',
    gatewayBase: 'https://cloud.nebula.test/api/workspaces/',
  })
  await transport.request('/models')

  expect(requestUrl).toBe('https://cloud.nebula.test/api/workspaces/ws-123/runtime/models')
  expect(credentials).toBe('include')
})

test('rejects an empty workspace identifier', () => {
  expect(() => createCloudRuntimeTransport({ workspaceId: '  ' })).toThrow('workspaceId is required')
})
