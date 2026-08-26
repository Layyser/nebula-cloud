import { expect, test } from 'bun:test'
import { PublishedServiceGateway } from '../src/publishedServiceGateway'
import { hashPublishedServiceToken } from '../src/publishedServiceAccess'

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
          ingressPort: null,
          state: 'active',
          visibility: 'public',
          authPolicy: 'none',
          accessTokenHash: null,
          expiresAt: 100,
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

test('requires the dedicated token header before contacting a private publication worker', async () => {
  const forwardedHeaders: Headers[] = []
  const gateway = new PublishedServiceGateway({
    resolveService: () => ({
      id: 'publication-private',
      workspaceId: 'workspace-1',
      name: 'api',
      slug: 'private-slug',
      protocol: 'http',
      targetPort: 3000,
      ingressPort: null,
      state: 'active',
      visibility: 'private',
      authPolicy: 'token',
      accessTokenHash: hashPublishedServiceToken('private-token'),
      expiresAt: 100,
      createdAt: 1,
      updatedAt: 1,
      revokedAt: null,
    }),
    worker: {
      proxyWorkspaceService: async input => {
        forwardedHeaders.push(input.request.headers)
        return new Response('private response')
      },
    },
  })
  const missing = await gateway.proxy({
    slug: 'private-slug',
    servicePath: '/',
    request: new Request('https://private.apps.nubols.com'),
  })
  expect(missing.status).toBe(401)
  expect(forwardedHeaders).toHaveLength(0)

  const wrong = await gateway.proxy({
    slug: 'private-slug',
    servicePath: '/',
    request: new Request('https://private.apps.nubols.com', {
      headers: { 'x-nubols-publication-token': 'wrong-token' },
    }),
  })
  expect(wrong.status).toBe(401)
  expect(forwardedHeaders).toHaveLength(0)

  const allowed = await gateway.proxy({
    slug: 'private-slug',
    servicePath: '/',
    request: new Request('https://private.apps.nubols.com', {
      headers: { 'x-nubols-publication-token': 'private-token' },
    }),
  })
  expect(allowed.status).toBe(200)
  expect(await allowed.text()).toBe('private response')
  expect(forwardedHeaders).toHaveLength(1)
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

test('does not send TCP publications through the HTTP gateway', async () => {
  let workerCalls = 0
  const gateway = new PublishedServiceGateway({
    worker: {
      proxyWorkspaceService: async () => {
        workerCalls += 1
        return new Response('must not proxy')
      },
    },
    resolveService: () => ({
      id: 'tcp-publication',
      workspaceId: 'workspace-1',
      name: 'minecraft',
      slug: 'tcp-slug',
      protocol: 'tcp',
      targetPort: 25565,
      ingressPort: 20000,
      state: 'active',
      visibility: 'public',
      authPolicy: 'none',
      accessTokenHash: null,
      expiresAt: null,
      createdAt: 1,
      updatedAt: 1,
      revokedAt: null,
    }),
  })
  const response = await gateway.proxy({
    request: new Request('https://app.nubols.com/p/tcp-slug'),
    slug: 'tcp-slug',
    servicePath: '',
  })
  expect(response.status).toBe(404)
  expect(workerCalls).toBe(0)
})
