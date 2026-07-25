import { expect, test } from 'bun:test'
import { createControlPlaneHandler } from '../src/server'

test('reports liveness and version without product capabilities', async () => {
  const handler = createControlPlaneHandler({ version: 'test' })
  const response = await handler(new Request('http://control-plane.test/health/live'))

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    service: 'nebula-cloud-control-plane',
    status: 'live',
    version: 'test',
  })
})

test('reports not ready while dependencies are unavailable', async () => {
  const handler = createControlPlaneHandler({ isReady: () => false })
  const response = await handler(new Request('http://control-plane.test/health/ready'))

  expect(response.status).toBe(503)
  expect((await response.json()).status).toBe('not_ready')
})

test('publishes an intentionally empty versioned status contract', async () => {
  const handler = createControlPlaneHandler()
  const response = await handler(new Request('http://control-plane.test/internal/v1/status'))

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    apiVersion: 'v1',
    ready: true,
    capabilities: [],
  })
})

test('does not pretend later authentication or organization routes exist', async () => {
  const handler = createControlPlaneHandler()
  const response = await handler(new Request('http://control-plane.test/api/organizations'))

  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({
    error: 'route not found',
    code: 'not_found',
  })
})

test('forwards auth routes only to the configured Better Auth handler', async () => {
  let forwardedPath = ''
  const handler = createControlPlaneHandler({
    authHandler: request => {
      forwardedPath = new URL(request.url).pathname
      return Response.json({ ok: true })
    },
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/auth/get-session',
  ))

  expect(response.status).toBe(200)
  expect(forwardedPath).toBe('/api/auth/get-session')
})
