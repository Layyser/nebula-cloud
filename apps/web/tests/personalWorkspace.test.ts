import { afterEach, expect, test } from 'bun:test'
import {
  ensurePersonalWorkspace,
  restartWorkspace,
} from '../src/runtime/personalWorkspace'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('requests the authenticated organization personal workspace', async () => {
  let capturedInput: RequestInfo | URL | null = null
  let capturedInit: RequestInit | undefined
  globalThis.fetch = async (input, init) => {
    capturedInput = input
    capturedInit = init
    return Response.json({
      workspace: {
        id: 'workspace-1',
        organizationId: 'org-1',
        state: 'pending',
        createdAt: 1,
        updatedAt: 1,
      },
    })
  }

  const workspace = await ensurePersonalWorkspace('org-1')

  expect(workspace.id).toBe('workspace-1')
  expect(capturedInput).toBe('/api/workspaces/personal')
  expect(capturedInit?.method).toBe('POST')
  expect(JSON.parse(String(capturedInit?.body))).toEqual({ organizationId: 'org-1' })
})

test('surfaces the control-plane workspace error', async () => {
  globalThis.fetch = async () => Response.json({
    error: 'organization membership required',
    code: 'workspace_membership_not_found',
  }, { status: 403 })

  expect(ensurePersonalWorkspace('org-missing'))
    .rejects.toThrow('organization membership required')
})

test('requests an authenticated operator restart', async () => {
  let capturedInput: RequestInfo | URL | null = null
  let capturedInit: RequestInit | undefined
  globalThis.fetch = async (input, init) => {
    capturedInput = input
    capturedInit = init
    return Response.json({
      workspaceId: 'workspace with spaces',
      state: 'ready',
    })
  }

  await restartWorkspace('workspace with spaces')

  expect(capturedInput).toBe('/api/workspaces/workspace%20with%20spaces/restart')
  expect(capturedInit).toEqual({
    method: 'POST',
    credentials: 'include',
  })
})

test('notifies the application when workspace resolution loses authentication', async () => {
  let expirations = 0
  await expect(ensurePersonalWorkspace('org-1', {
    fetch: async () => Response.json({
      error: 'authentication required',
      code: 'authentication_required',
    }, { status: 401 }),
    onSessionExpired: () => { expirations += 1 },
  })).rejects.toThrow('authentication required')

  expect(expirations).toBe(1)
})
