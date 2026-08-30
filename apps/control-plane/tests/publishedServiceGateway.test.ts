import { expect, test } from 'bun:test'
import { PublishedServiceGateway } from '../src/publishedServiceGateway'
import { hashPublishedServiceToken } from '../src/publishedServiceAccess'
import { PublicationConnectionLimiter } from '../src/publicationConnectionLimiter'
import { PublicationBandwidthLimiter } from '../src/publicationBandwidthLimiter'

function connectionOptions() {
  return {
    resolveConnectionScope: (publication: { id: string; workspaceId: string }) => ({
      workerId: 'worker-1',
      organizationId: 'organization-1',
      routeId: publication.id,
    }),
    connectionLimiter: new PublicationConnectionLimiter({
      global: 16,
      perWorker: 16,
      perOrganization: 16,
      perRoute: 16,
    }),
    bandwidthLimiter: new PublicationBandwidthLimiter({
      windowMs: 60_000,
      globalBytes: 1024 * 1024,
      perWorkerBytes: 1024 * 1024,
      perOrganizationBytes: 1024 * 1024,
      perRouteBytes: 1024 * 1024,
    }),
  }
}

test('resolves an opaque slug to one workspace port and preserves application cookies', async () => {
  const calls: unknown[] = []
  const gateway = new PublishedServiceGateway({
    ...connectionOptions(),
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
    ...connectionOptions(),
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
    ...connectionOptions(),
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
    ...connectionOptions(),
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

test('rejects excess HTTP connections and releases capacity after the response body closes', async () => {
  let finishFirstResponse: (() => void) | undefined
  const firstResponsePending = new Promise<void>(resolve => {
    finishFirstResponse = resolve
  })
  let workerCalls = 0
  const publication = {
    id: 'limited-publication',
    workspaceId: 'workspace-1',
    name: 'api',
    slug: 'limited-slug',
    protocol: 'http' as const,
    targetPort: 3000,
    ingressPort: null,
    state: 'active' as const,
    visibility: 'public' as const,
    authPolicy: 'none' as const,
    accessTokenHash: null,
    expiresAt: null,
    createdAt: 1,
    updatedAt: 1,
    revokedAt: null,
  }
  const gateway = new PublishedServiceGateway({
    resolveService: () => publication,
    resolveConnectionScope: () => ({
      workerId: 'worker-1',
      organizationId: 'organization-1',
      routeId: publication.id,
    }),
    connectionLimiter: new PublicationConnectionLimiter({
      global: 1,
      perWorker: 1,
      perOrganization: 1,
      perRoute: 1,
    }),
    bandwidthLimiter: new PublicationBandwidthLimiter({
      windowMs: 60_000,
      globalBytes: 1024 * 1024,
      perWorkerBytes: 1024 * 1024,
      perOrganizationBytes: 1024 * 1024,
      perRouteBytes: 1024 * 1024,
    }),
    worker: {
      proxyWorkspaceService: async () => {
        workerCalls += 1
        if (workerCalls === 1) await firstResponsePending
        return new Response('ok')
      },
    },
  })

  const first = gateway.proxy({
    slug: publication.slug,
    servicePath: '/',
    request: new Request('https://limited.apps.nubols.com'),
  })
  await Promise.resolve()
  const rejected = await gateway.proxy({
    slug: publication.slug,
    servicePath: '/',
    request: new Request('https://limited.apps.nubols.com'),
  })
  expect(rejected.status).toBe(429)
  expect(await rejected.json()).toMatchObject({ code: 'published_service_connection_limit_reached' })
  expect(workerCalls).toBe(1)

  finishFirstResponse?.()
  const firstResponse = await first
  expect(await firstResponse.text()).toBe('ok')
  const accepted = await gateway.proxy({
    slug: publication.slug,
    servicePath: '/',
    request: new Request('https://limited.apps.nubols.com'),
  })
  expect(accepted.status).toBe(200)
  expect(await accepted.text()).toBe('ok')
})

test('rejects a declared HTTP upload before contacting the worker when bandwidth is exhausted', async () => {
  let workerCalls = 0
  const gateway = new PublishedServiceGateway({
    resolveService: () => ({
      id: 'bandwidth-publication',
      workspaceId: 'workspace-1',
      name: 'api',
      slug: 'bandwidth-slug',
      protocol: 'http',
      targetPort: 3000,
      ingressPort: null,
      state: 'active',
      visibility: 'public',
      authPolicy: 'none',
      accessTokenHash: null,
      expiresAt: null,
      createdAt: 1,
      updatedAt: 1,
      revokedAt: null,
    }),
    resolveConnectionScope: publication => ({
      workerId: 'worker-1',
      organizationId: 'organization-1',
      routeId: publication.id,
    }),
    connectionLimiter: new PublicationConnectionLimiter({
      global: 2,
      perWorker: 2,
      perOrganization: 2,
      perRoute: 2,
    }),
    bandwidthLimiter: new PublicationBandwidthLimiter({
      windowMs: 60_000,
      globalBytes: 3,
      perWorkerBytes: 3,
      perOrganizationBytes: 3,
      perRouteBytes: 3,
    }),
    worker: {
      proxyWorkspaceService: async () => {
        workerCalls += 1
        return new Response('must not proxy')
      },
    },
  })
  const response = await gateway.proxy({
    slug: 'bandwidth-slug',
    servicePath: '/',
    request: new Request('https://bandwidth.apps.nubols.com', {
      method: 'POST',
      body: 'four',
      headers: { 'content-length': '4' },
    }),
  })
  expect(response.status).toBe(429)
  expect(await response.json()).toMatchObject({ code: 'published_service_bandwidth_limit_reached' })
  expect(workerCalls).toBe(0)
})
