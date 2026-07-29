import { expect, test } from 'bun:test'
import { createControlPlaneHandler } from '../src/server'
import { WorkspaceMembershipNotFoundError } from '@nebula-cloud/database'

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
