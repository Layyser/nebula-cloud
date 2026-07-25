import { afterEach, expect, test } from 'bun:test'
import { ensurePersonalWorkspace } from '../src/runtime/personalWorkspace'

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
