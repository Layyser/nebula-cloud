import { expect, test } from 'bun:test'
import { PublishedServiceGateway } from '../src/publishedServiceGateway'

test('resolves an opaque slug to one workspace port and preserves application cookies', async () => {
  const calls: unknown[] = []
  const gateway = new PublishedServiceGateway({
    resolveService: slug => slug === 'opaque-slug'
      ? {
          id: 'publication-1',
          workspaceId: 'workspace-1',
          name: 'api',
          slug,
          protocol: 'http',
          targetPort: 3000,
          state: 'active',
          createdAt: 1,
          updatedAt: 1,
          revokedAt: null,
        }
      : null,
    worker: {
      proxyWorkspaceService: async input => {
        calls.push({
          workspaceId: input.workspaceId,
          targetPort: input.targetPort,
          servicePath: input.servicePath,
        })
        return new Response('hello', {
          status: 201,
          headers: {
            'content-type': 'text/plain',
            'set-cookie': 'session=application; Path=/',
            server: 'private-app',
            'x-nebula-private': 'secret',
          },
        })
      },
    },
  })
  const response = await gateway.proxy({
    slug: 'opaque-slug',
    servicePath: '/v1/items?limit=2',
    request: new Request('https://app.nubols.com/p/opaque-slug/v1/items?limit=2'),
  })
  expect(response.status).toBe(201)
  expect(await response.text()).toBe('hello')
  expect(response.headers.get('set-cookie')).toContain('session=application')
  expect(response.headers.has('server')).toBe(false)
  expect(response.headers.has('x-nebula-private')).toBe(false)
  expect(calls).toEqual([{
    workspaceId: 'workspace-1',
    targetPort: 3000,
    servicePath: '/v1/items?limit=2',
  }])
})

test('does not contact a worker for an unknown or revoked publication slug', async () => {
  let calls = 0
  const gateway = new PublishedServiceGateway({
    resolveService: () => null,
    worker: {
      proxyWorkspaceService: async () => {
        calls += 1
        return new Response('must not happen')
      },
    },
  })
  const response = await gateway.proxy({
    slug: 'revoked-slug',
    servicePath: '/',
    request: new Request('https://app.nubols.com/p/revoked-slug'),
  })
  expect(response.status).toBe(404)
  expect(calls).toBe(0)
})
