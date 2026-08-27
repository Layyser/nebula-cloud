import { expect, test } from 'bun:test'
import {
  CONTROL_PLANE_IDLE_TIMEOUT_SECONDS,
  createControlPlaneHandler,
} from '../src/server'
import { WorkspaceMembershipNotFoundError } from '@nebula-cloud/database'

test('allows lifecycle requests to outlive the worker timeout', () => {
  expect(CONTROL_PLANE_IDLE_TIMEOUT_SECONDS).toBeGreaterThan(120)
})

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

test('protects worker administration with a separate platform credential', async () => {
  let listCalls = 0
  const handler = createControlPlaneHandler({
    authorizeWorkerAdministration: request => (
      request.headers.get('authorization') === 'Bearer platform-secret'
    ),
    listWorkerHosts: () => {
      listCalls += 1
      return { workers: [] }
    },
  })

  const denied = await handler(new Request('http://control-plane.test/internal/v1/workers'))
  expect(denied.status).toBe(401)
  expect(listCalls).toBe(0)

  const allowed = await handler(new Request(
    'http://control-plane.test/internal/v1/workers',
    { headers: { authorization: 'Bearer platform-secret' } },
  ))
  expect(allowed.status).toBe(200)
  expect(await allowed.json()).toEqual({ workers: [] })
  expect(listCalls).toBe(1)
})

test('registers and drains workers through the internal administration API', async () => {
  const registrations: unknown[] = []
  const updates: unknown[] = []
  const worker = {
    id: 'worker-a',
    name: 'Worker A',
    provider: 'local',
    region: 'local',
    baseURL: 'http://127.0.0.1:7780',
    credentialKeyId: 'worker-a-token',
    enabled: true,
    schedulable: false,
    state: 'unknown' as const,
    capacity: { memoryBytes: 4096, cpuMillis: 4000, diskBytes: 8192, workspaceSlots: 2 },
    reserved: { memoryBytes: 0, cpuMillis: 0, diskBytes: 0, workspaceSlots: 0 },
    lastHeartbeatAt: null,
    lastErrorCode: null,
    createdAt: 1,
    updatedAt: 1,
  }
  const handler = createControlPlaneHandler({
    authorizeWorkerAdministration: () => true,
    registerWorkerHost: input => {
      registrations.push(input)
      return worker
    },
    updateWorkerHost: input => {
      updates.push(input)
      return { ...worker, state: 'draining', schedulable: false }
    },
  })
  const registered = await handler(new Request(
    'http://control-plane.test/internal/v1/workers',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'worker-a',
        name: 'Worker A',
        provider: 'local',
        region: 'local',
        baseURL: 'http://127.0.0.1:7780',
        credentialKeyId: 'worker-a-token',
        capacity: { memoryBytes: 4096, cpuMillis: 4000, diskBytes: 8192, workspaceSlots: 2 },
      }),
    },
  ))
  expect(registered.status).toBe(201)
  expect(registrations).toHaveLength(1)

  const drained = await handler(new Request(
    'http://control-plane.test/internal/v1/workers/worker-a',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'drain' }),
    },
  ))
  expect(drained.status).toBe(200)
  expect(updates).toEqual([{
    workerHostId: 'worker-a',
    update: { action: 'drain' },
  }])
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

test('authenticates workspace publication commands before listing, exposing, or revoking', async () => {
  const calls: unknown[] = []
  const publication = {
    id: 'publication-1',
    name: 'api',
    protocol: 'http' as const,
    targetPort: 3000,
    ingressPort: null,
    state: 'active' as const,
    visibility: 'public' as const,
    authPolicy: 'none' as const,
    publicUrl: 'https://app.nubols.com/p/opaque-slug',
    expiresAt: null,
    createdAt: 10,
    updatedAt: 10,
  }
  const handler = createControlPlaneHandler({
    authenticateWorkspacePublication: async ({ request, workspaceId }) => (
      workspaceId === 'workspace-1'
      && request.headers.get('authorization') === 'Bearer runtime-token'
    ),
    listWorkspacePublications: input => {
      calls.push(['list', input])
      return { publications: [publication] }
    },
    upsertWorkspacePublication: input => {
      calls.push(['upsert', input])
      return { publication }
    },
    revokeWorkspacePublication: input => {
      calls.push(['revoke', input])
      return true
    },
  })
  const denied = await handler(new Request(
    'http://control-plane.test/api/workspaces/workspace-1/publications',
  ))
  expect(denied.status).toBe(401)
  expect(calls).toEqual([])

  const headers = { authorization: 'Bearer runtime-token' }
  const listed = await handler(new Request(
    'http://control-plane.test/api/workspaces/workspace-1/publications',
    { headers },
  ))
  expect(listed.status).toBe(200)
  expect(await listed.json()).toEqual({ publications: [publication] })

  const exposed = await handler(new Request(
    'http://control-plane.test/api/workspaces/workspace-1/publications/api',
    {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ port: 3000 }),
    },
  ))
  expect(exposed.status).toBe(200)
  expect(await exposed.json()).toEqual({ publication })

  const privateExposed = await handler(new Request(
    'http://control-plane.test/api/workspaces/workspace-1/publications/api',
    {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ port: 3000, visibility: 'private', ttlSeconds: 3600 }),
    },
  ))
  expect(privateExposed.status).toBe(200)

  const revoked = await handler(new Request(
    'http://control-plane.test/api/workspaces/workspace-1/publications/api',
    { method: 'DELETE', headers },
  ))
  expect(revoked.status).toBe(204)
  expect(calls).toEqual([
    ['list', { workspaceId: 'workspace-1' }],
    ['upsert', {
      workspaceId: 'workspace-1',
      name: 'api',
      port: 3000,
      protocol: 'http',
      visibility: 'public',
      ttlSeconds: null,
    }],
    ['upsert', {
      workspaceId: 'workspace-1',
      name: 'api',
      port: 3000,
      protocol: 'http',
      visibility: 'private',
      ttlSeconds: 3600,
    }],
    ['revoke', { workspaceId: 'workspace-1', name: 'api' }],
  ])
})

test('rejects publication inputs that could target runtime or inject routing state', async () => {
  let calls = 0
  const handler = createControlPlaneHandler({
    authenticateWorkspacePublication: async () => true,
    upsertWorkspacePublication: () => {
      calls += 1
      throw new Error('must not be reached')
    },
  })
  for (const body of [
    { port: 7777 },
    { port: 80 },
    { port: 3000, host: 'other-workspace' },
    { port: '3000' },
    { port: 3000, visibility: 'shared' },
    { port: 3000, visibility: 'private', ttlSeconds: 299 },
    { port: 3000, visibility: 'public', ttlSeconds: 604801 },
    { port: 25565, protocol: 'tcp', visibility: 'private' },
  ]) {
    const response = await handler(new Request(
      'http://control-plane.test/api/workspaces/workspace-1/publications/api',
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer runtime-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    ))
    expect(response.status).toBe(400)
  }
  expect(calls).toBe(0)
})

test('routes opaque public service URLs without exposing workspace or port selectors', async () => {
  const calls: unknown[] = []
  const handler = createControlPlaneHandler({
    proxyPublishedService: async input => {
      calls.push({
        slug: input.slug,
        servicePath: input.servicePath,
        method: input.request.method,
      })
      return new Response('proxied', { status: 201 })
    },
  })
  const response = await handler(new Request(
    'https://app.nubols.com/p/opaque-slug/v1/items?limit=2',
    { method: 'POST', body: 'payload' },
  ))
  expect(response.status).toBe(201)
  expect(await response.text()).toBe('proxied')
  expect(calls).toEqual([{
    slug: 'opaque-slug',
    servicePath: '/v1/items?limit=2',
    method: 'POST',
  }])
  const missing = await createControlPlaneHandler()(new Request(
    'https://app.nubols.com/p/unknown',
  ))
  expect(missing.status).toBe(404)
})

test('routes one wildcard publication hostname and preserves its complete app path', async () => {
  const calls: unknown[] = []
  const handler = createControlPlaneHandler({
    publishedServiceHostnameSuffix: 'apps.nubols.com',
    proxyPublishedService: async input => {
      calls.push({
        slug: input.slug,
        servicePath: input.servicePath,
        host: new URL(input.request.url).host,
      })
      return new Response('hostname-proxied')
    },
  })
  const response = await handler(new Request(
    'https://opaque-slug.apps.nubols.com/v1/items?limit=2',
  ))
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('hostname-proxied')
  expect(calls).toEqual([{
    slug: 'opaque-slug',
    servicePath: '/v1/items?limit=2',
    host: 'opaque-slug.apps.nubols.com',
  }])

  for (const hostname of [
    'apps.nubols.com',
    'nested.slug.apps.nubols.com',
  ]) {
    const denied = await handler(new Request(`https://${hostname}/api/workspaces`))
    expect(denied.status).toBe(404)
  }
  expect(calls).toHaveLength(1)
})

test('accepts bounded same-origin contact requests with client context', async () => {
  const submissions: unknown[] = []
  const handler = createControlPlaneHandler({
    trustedContactOrigins: ['https://nubols.com'],
    submitContact: async input => {
      submissions.push(input)
      return { requestId: input.submissionId, status: 'received' }
    },
  })
  const response = await handler(new Request('https://app.nubols.com/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://nubols.com',
    },
    body: JSON.stringify({
      submissionId: '8f27d166-e949-4ec0-90f8-973ff8c69c80',
      name: 'Ada Lovelace',
      email: 'ADA@example.test',
      organization: 'Analytical Engines',
      topic: 'sales',
      message: 'We need isolated build environments.',
      privacyVersion: '2026-08-24',
      website: '',
    }),
  }), { clientAddress: '203.0.113.7' })

  expect(response.status).toBe(202)
  expect(await response.json()).toEqual({
    requestId: '8f27d166-e949-4ec0-90f8-973ff8c69c80',
    status: 'received',
  })
  expect(submissions).toEqual([{
    submissionId: '8f27d166-e949-4ec0-90f8-973ff8c69c80',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    organization: 'Analytical Engines',
    topic: 'sales',
    message: 'We need isolated build environments.',
    privacyVersion: '2026-08-24',
    sourceAddress: '203.0.113.7',
  }])
})

test('contact requests reject cross-origin, oversized, and honeypot traffic safely', async () => {
  let calls = 0
  const handler = createControlPlaneHandler({
    trustedContactOrigins: ['https://nubols.com'],
    submitContact: async input => {
      calls += 1
      return { requestId: input.submissionId, status: 'received' }
    },
  })
  const body = {
    submissionId: '8f27d166-e949-4ec0-90f8-973ff8c69c80',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    topic: 'sales',
    message: 'We need isolated build environments.',
    privacyVersion: '2026-08-24',
  }
  const denied = await handler(new Request('https://app.nubols.com/api/contact', {
    method: 'POST',
    headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  expect(denied.status).toBe(403)

  const oversized = await handler(new Request('https://app.nubols.com/api/contact', {
    method: 'POST',
    headers: { origin: 'https://nubols.com', 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, message: 'x'.repeat(17 * 1024) }),
  }))
  expect(oversized.status).toBe(413)

  const honeypot = await handler(new Request('https://app.nubols.com/api/contact', {
    method: 'POST',
    headers: { origin: 'https://nubols.com', 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, website: 'https://spam.example' }),
  }))
  expect(honeypot.status).toBe(202)
  expect(calls).toBe(0)
})

test('protects and operates contact requests through the platform credential', async () => {
  const calls: unknown[] = []
  const contact = {
    id: 'request-1',
    name: '=Ada Lovelace',
    email: 'ada@example.test',
    organization: 'Analytical Engines',
    topic: 'sales' as const,
    message: 'We need isolated build environments.',
    status: 'new' as const,
    notificationStatus: 'sent' as const,
    providerMessageId: 'provider-1',
    privacyVersion: '2026-08-24',
    createdAt: 100,
    updatedAt: 110,
  }
  const handler = createControlPlaneHandler({
    authorizeContactAdministration: request => (
      request.headers.get('authorization') === 'Bearer platform-secret'
    ),
    listContactRequests: input => {
      calls.push({ operation: 'list', input })
      return {
        requests: [contact],
        nextCursor: input.before ? null : { createdAt: 100, id: 'request-1' },
      }
    },
    updateContactRequestStatus: input => {
      calls.push({ operation: 'update', input })
      return { ...contact, status: input.status }
    },
  })

  const denied = await handler(new Request(
    'http://control-plane.test/internal/v1/contact-requests',
  ))
  expect(denied.status).toBe(401)
  expect(calls).toHaveLength(0)

  const firstPage = await handler(new Request(
    'http://control-plane.test/internal/v1/contact-requests?status=new&limit=25',
    { headers: { authorization: 'Bearer platform-secret' } },
  ))
  expect(firstPage.status).toBe(200)
  const firstBody = await firstPage.json()
  expect(firstBody.requests).toEqual([contact])
  expect(typeof firstBody.nextCursor).toBe('string')

  const secondPage = await handler(new Request(
    `http://control-plane.test/internal/v1/contact-requests?cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    { headers: { authorization: 'Bearer platform-secret' } },
  ))
  expect(secondPage.status).toBe(200)
  expect(calls[1]).toEqual({
    operation: 'list',
    input: {
      status: undefined,
      limit: 50,
      before: { createdAt: 100, id: 'request-1' },
    },
  })

  const updated = await handler(new Request(
    'http://control-plane.test/internal/v1/contact-requests/request-1',
    {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer platform-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'qualified' }),
    },
  ))
  expect(updated.status).toBe(200)
  expect((await updated.json()).status).toBe('qualified')
})

test('exports bounded contact CSV safely and rejects invalid administration input', async () => {
  const contact = {
    id: 'request-1',
    name: '=2+2',
    email: 'ada@example.test',
    organization: null,
    topic: 'sales' as const,
    message: 'A message with "quotes" and, commas.',
    status: 'new' as const,
    notificationStatus: 'pending' as const,
    providerMessageId: null,
    privacyVersion: '2026-08-24',
    createdAt: 100,
    updatedAt: 100,
  }
  const handler = createControlPlaneHandler({
    authorizeContactAdministration: () => true,
    listContactRequests: () => ({ requests: [contact], nextCursor: null }),
    updateContactRequestStatus: () => contact,
  })
  const exported = await handler(new Request(
    'http://control-plane.test/internal/v1/contact-requests/export.csv',
  ))
  expect(exported.status).toBe(200)
  expect(exported.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  expect(exported.headers.get('content-disposition')).toContain('attachment')
  const csv = await exported.text()
  expect(csv).toContain('"\'=2+2"')
  expect(csv).toContain('"A message with ""quotes"" and, commas."')

  const invalidStatus = await handler(new Request(
    'http://control-plane.test/internal/v1/contact-requests?status=deleted',
  ))
  expect(invalidStatus.status).toBe(400)

  const invalidUpdate = await handler(new Request(
    'http://control-plane.test/internal/v1/contact-requests/request-1',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'deleted' }),
    },
  ))
  expect(invalidUpdate.status).toBe(400)
})

test('serves personal usage only for the active organization', async () => {
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    }),
    getPersonalUsage: input => ({
      organizationId: input.organizationId,
      membershipId: 'member-1',
      rangeDays: input.rangeDays,
      totals: {
        modelTurns: 1,
        inputTokens: 10,
        outputTokens: 5,
        cachedTokens: 2,
        reasoningTokens: 0,
        totalTokens: 15,
        estimatedCostMicrousd: 1_250,
        cacheSavingsMicrousd: 0,
      },
      sessions: [],
      models: [],
      timeline: [],
      modelTimeline: [],
    }),
  })
  const response = await handler(new Request('http://control-plane.test/api/usage/me?days=7'))

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    organizationId: 'org-1',
    membershipId: 'member-1',
    rangeDays: 7,
    totals: { modelTurns: 1, totalTokens: 15 },
  })
})

test('does not allow organization usage through a different active organization', async () => {
  let calls = 0
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({
      userId: 'owner-1',
      activeOrganizationId: 'org-1',
    }),
    getOrganizationUsage: () => {
      calls += 1
      throw new Error('must not resolve cross-organization usage')
    },
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/organizations/org-2/usage',
  ))

  expect(response.status).toBe(403)
  expect((await response.json()).code).toBe('usage_access_denied')
  expect(calls).toBe(0)
})

test('serves the persisted dashboard overview only for the active organization', async () => {
  const calls: Array<{ userId: string; organizationId: string; since: number }> = []
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({
      userId: 'member-1',
      activeOrganizationId: 'org-1',
    }),
    getOrganizationDashboard: input => {
      calls.push(input)
      return {
        organizationId: input.organizationId,
        scope: 'personal',
        rangeDays: 30,
        enabledMembers: null,
        operators: { ready: 1, total: 1 },
        usage: {
          sessions: 3,
          modelTurns: 8,
          totalTokens: 12_500,
          estimatedCostMicrousd: 42_000,
        },
        provisioningFailures: 0,
        workers: { healthy: 1, total: 1 },
      }
    },
  })
  const earliestSince = Date.now() - 30 * 24 * 60 * 60 * 1000
  const response = await handler(new Request(
    'http://control-plane.test/api/organizations/org-1/dashboard',
  ))

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    organizationId: 'org-1',
    scope: 'personal',
    usage: { sessions: 3, modelTurns: 8, totalTokens: 12_500 },
  })
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({ userId: 'member-1', organizationId: 'org-1' })
  expect(calls[0]!.since).toBeGreaterThanOrEqual(earliestSince)

  const crossOrganization = await handler(new Request(
    'http://control-plane.test/api/organizations/org-2/dashboard',
  ))
  expect(crossOrganization.status).toBe(403)
  expect(calls).toHaveLength(1)
})

test('serves the bounded organization audit stream only through the active organization', async () => {
  const calls: unknown[] = []
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({
      userId: 'owner-1',
      activeOrganizationId: 'org-1',
    }),
    getOrganizationAudit: input => {
      calls.push(input)
      return {
        events: [{
          eventId: 'event-1',
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: 'organization.access_code_rotated',
          targetType: 'organization',
          targetId: input.organizationId,
          result: 'success',
          sourceIpHash: null,
          metadata: {},
          occurredAt: 10,
        }],
      }
    },
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/organizations/org-1/audit?limit=25&before=100',
  ))

  expect(response.status).toBe(200)
  expect(calls).toEqual([{
    userId: 'owner-1',
    organizationId: 'org-1',
    limit: 25,
    before: 100,
  }])
  expect(await response.json()).toMatchObject({
    events: [{ eventId: 'event-1' }],
  })

  const crossOrganization = await handler(new Request(
    'http://control-plane.test/api/organizations/org-2/audit',
  ))
  expect(crossOrganization.status).toBe(403)
  expect(calls).toHaveLength(1)
})

test('rejects unsupported usage ranges', async () => {
  const handler = createControlPlaneHandler()
  const response = await handler(new Request('http://control-plane.test/api/usage/me?days=14'))

  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_request')
})

test('requires authentication before resolving a personal workspace', async () => {
  const handler = createControlPlaneHandler({
    resolveSession: async () => null,
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/workspaces/personal',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-1' }),
    },
  ))

  expect(response.status).toBe(401)
  expect((await response.json()).code).toBe('authentication_required')
})

test('resolves the authenticated membership personal workspace', async () => {
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({ userId: 'user-1' }),
    ensurePersonalWorkspace: input => ({
      id: `workspace-for-${input.userId}`,
      organizationId: input.organizationId,
      state: 'pending',
      createdAt: 10,
      updatedAt: 10,
    }),
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/workspaces/personal',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-1' }),
    },
  ))

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    workspace: {
      id: 'workspace-for-user-1',
      organizationId: 'org-1',
      state: 'pending',
      createdAt: 10,
      updatedAt: 10,
    },
  })
})

test('does not resolve a workspace outside the authenticated membership', async () => {
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({ userId: 'user-1' }),
    ensurePersonalWorkspace: () => {
      throw new WorkspaceMembershipNotFoundError()
    },
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/workspaces/personal',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-2' }),
    },
  ))

  expect(response.status).toBe(403)
  expect((await response.json()).code).toBe('workspace_membership_not_found')
})

test('schedules an authenticated ensure-running provisioning job', async () => {
  const scheduledInputs: Array<{ userId: string; organizationId: string }> = []
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({ userId: 'user-1' }),
    ensureWorkspaceRunning: input => {
      scheduledInputs.push(input)
      return {
        workspace: {
          id: 'workspace-1',
          organizationId: input.organizationId,
          state: 'provisioning',
          createdAt: 10,
          updatedAt: 20,
        },
        job: {
          id: 'job-1',
          workspaceId: 'workspace-1',
          operation: 'ensure_running',
          status: 'queued',
          attempt: 0,
          availableAt: 20,
          createdAt: 20,
          updatedAt: 20,
        },
      }
    },
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/workspaces/personal/ensure-running',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-1' }),
    },
  ))

  expect(response.status).toBe(200)
  expect(scheduledInputs).toEqual([
    { userId: 'user-1', organizationId: 'org-1' },
  ])
  expect(await response.json()).toMatchObject({
    workspace: { id: 'workspace-1', state: 'provisioning' },
    job: { id: 'job-1', status: 'queued' },
  })
})

test('does not expose ensure-running without a signed-in session', async () => {
  const handler = createControlPlaneHandler({
    resolveSession: async () => null,
    ensureWorkspaceRunning: () => {
      throw new Error('must not be called')
    },
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/workspaces/personal/ensure-running',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-1' }),
    },
  ))

  expect(response.status).toBe(401)
  expect((await response.json()).code).toBe('authentication_required')
})

test('restarts only the authenticated active-organization workspace', async () => {
  const calls: unknown[] = []
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    }),
    restartWorkspace: async input => {
      calls.push(input)
      return {
        workspaceId: input.workspaceId,
        state: 'ready',
      }
    },
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/workspaces/workspace%2D1/restart',
    { method: 'POST' },
  ))

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    workspaceId: 'workspace-1',
    state: 'ready',
  })
  expect(calls).toEqual([{
    workspaceId: 'workspace-1',
    userId: 'user-1',
    organizationId: 'org-1',
  }])
})

test('hides workspaces the authenticated member cannot restart', async () => {
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    }),
    restartWorkspace: async () => null,
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/workspaces/another-workspace/restart',
    { method: 'POST' },
  ))

  expect(response.status).toBe(404)
  expect((await response.json()).code).toBe('workspace_not_found')
})

test('requires a session and active organization for runtime gateway routes', async () => {
  const signedOut = createControlPlaneHandler({
    resolveSession: async () => null,
  })
  const signedOutResponse = await signedOut(new Request(
    'http://control-plane.test/api/workspaces/workspace-1/runtime/health/ready',
  ))
  expect(signedOutResponse.status).toBe(401)
  expect((await signedOutResponse.json()).code).toBe('authentication_required')

  const noOrganization = createControlPlaneHandler({
    resolveSession: async () => ({
      userId: 'user-1',
      activeOrganizationId: null,
    }),
  })
  const noOrganizationResponse = await noOrganization(new Request(
    'http://control-plane.test/api/workspaces/workspace-1/runtime/health/ready',
  ))
  expect(noOrganizationResponse.status).toBe(403)
  expect((await noOrganizationResponse.json()).code).toBe(
    'active_organization_required',
  )
})

test('rejects an invalid session token before Runtime workspace access', async () => {
  let proxyCalls = 0
  const handler = createControlPlaneHandler({
    resolveSession: async request => {
      expect(request.headers.get('cookie')).toBe(
        'better-auth.session_token=invalid-token',
      )
      return null
    },
    proxyRuntime: async () => {
      proxyCalls += 1
      throw new Error('must not proxy Runtime access')
    },
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/workspaces/workspace-1/runtime/health/ready',
    {
      headers: {
        cookie: 'better-auth.session_token=invalid-token',
      },
    },
  ))

  expect(response.status).toBe(401)
  expect((await response.json()).code).toBe('authentication_required')
  expect(proxyCalls).toBe(0)
})

test('forwards an authenticated runtime route with its suffix and query intact', async () => {
  const calls: unknown[] = []
  const handler = createControlPlaneHandler({
    resolveSession: async () => ({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    }),
    proxyRuntime: async input => {
      calls.push({
        workspaceId: input.workspaceId,
        runtimePath: input.runtimePath,
        userId: input.userId,
        organizationId: input.organizationId,
        search: new URL(input.request.url).search,
      })
      return new Response('proxied', { status: 202 })
    },
  })
  const response = await handler(new Request(
    'http://control-plane.test/api/workspaces/workspace%2D1/runtime/v1/events?after=3',
  ))

  expect(response.status).toBe(202)
  expect(await response.text()).toBe('proxied')
  expect(calls).toEqual([{
    workspaceId: 'workspace-1',
    runtimePath: '/v1/events',
    userId: 'user-1',
    organizationId: 'org-1',
    search: '?after=3',
  }])
})
