import { expect, test } from 'bun:test'
import { prepareConsoleUpgrade } from '../src/consoleUpgrade'

function consoleRequest(cookie?: string): Request {
  return new Request(
    'http://control-plane.test/api/workspaces/workspace-1/console?rows=30&columns=100',
    {
      headers: {
        upgrade: 'websocket',
        origin: 'http://cloud.test',
        ...(cookie ? { cookie } : {}),
      },
    },
  )
}

test('rejects an invalid session token before Console workspace or worker access', async () => {
  let gatewayCalls = 0
  const response = await prepareConsoleUpgrade({
    request: consoleRequest('better-auth.session_token=invalid-token'),
    encodedWorkspaceId: 'workspace-1',
    trustedOrigins: ['http://cloud.test'],
    resolveSession: async request => {
      expect(request.headers.get('cookie')).toBe(
        'better-auth.session_token=invalid-token',
      )
      return null
    },
    consoleGateway: {
      async prepare() {
        gatewayCalls += 1
        throw new Error('must not prepare Console access')
      },
    },
  })

  expect(response).toBeInstanceOf(Response)
  expect((response as Response).status).toBe(401)
  expect(await (response as Response).json()).toEqual({
    error: 'authentication required',
    code: 'authentication_required',
  })
  expect(gatewayCalls).toBe(0)
})

test('requires an active organization before Console workspace access', async () => {
  let gatewayCalls = 0
  const response = await prepareConsoleUpgrade({
    request: consoleRequest('better-auth.session_token=valid-token'),
    encodedWorkspaceId: 'workspace-1',
    trustedOrigins: ['http://cloud.test'],
    resolveSession: async () => ({
      userId: 'user-1',
      activeOrganizationId: null,
    }),
    consoleGateway: {
      async prepare() {
        gatewayCalls += 1
        throw new Error('must not prepare Console access')
      },
    },
  })

  expect(response).toBeInstanceOf(Response)
  expect((response as Response).status).toBe(403)
  expect((await (response as Response).json()).code).toBe(
    'active_organization_required',
  )
  expect(gatewayCalls).toBe(0)
})

test('passes only an authenticated principal to the Console gateway', async () => {
  const inputs: unknown[] = []
  const response = await prepareConsoleUpgrade({
    request: consoleRequest('better-auth.session_token=valid-token'),
    encodedWorkspaceId: 'workspace%2D1',
    trustedOrigins: ['http://cloud.test'],
    resolveSession: async () => ({
      userId: 'user-1',
      activeOrganizationId: 'org-1',
    }),
    consoleGateway: {
      async prepare(input) {
        inputs.push(input)
        return new Response(null, { status: 409 })
      },
    },
  })

  expect(response).toBeInstanceOf(Response)
  expect(inputs).toEqual([{
    workspaceId: 'workspace-1',
    userId: 'user-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    rows: '30',
    columns: '100',
    terminalId: null,
  }])
})
