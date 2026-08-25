import { expect, test } from 'bun:test'
import { workspacePublicationAuthenticated } from '../src/workspacePublicationAuth'

test('a workspace runtime token cannot publish for another workspace', async () => {
  const tokens = new Map([
    ['workspace-a', 'runtime-token-a'],
    ['workspace-b', 'runtime-token-b'],
  ])
  const worker = {
    getRuntimeAccess: async ({ workspaceId }: { workspaceId: string }) => ({
      workspaceId,
      network: 'private',
      address: '172.31.0.2:7777',
      accessToken: tokens.get(workspaceId) ?? '',
    }),
  }
  const authenticate = (workspaceId: string, token: string) => (
    workspacePublicationAuthenticated({
      request: new Request('https://app.nubols.com/publications', {
        headers: { authorization: `Bearer ${token}` },
      }),
      workspaceId,
      worker,
      workspaceEnabled: () => true,
    })
  )
  await expect(authenticate('workspace-a', 'runtime-token-a')).resolves.toBe(true)
  await expect(authenticate('workspace-b', 'runtime-token-a')).resolves.toBe(false)
  await expect(authenticate('workspace-a', 'runtime-token-b')).resolves.toBe(false)
})

test('disabled workspaces fail before runtime credentials are requested', async () => {
  let calls = 0
  const authenticated = await workspacePublicationAuthenticated({
    request: new Request('https://app.nubols.com/publications', {
      headers: { authorization: 'Bearer runtime-token-a' },
    }),
    workspaceId: 'workspace-a',
    workspaceEnabled: () => false,
    worker: {
      getRuntimeAccess: async () => {
        calls += 1
        throw new Error('must not be called')
      },
    },
  })
  expect(authenticated).toBe(false)
  expect(calls).toBe(0)
})
