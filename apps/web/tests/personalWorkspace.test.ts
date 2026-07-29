import { afterEach, expect, test } from 'bun:test'
import {
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
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

test('schedules workspace provisioning for the authenticated organization', async () => {
  let capturedInput: RequestInfo | URL | null = null
  let capturedInit: RequestInit | undefined
  const result = await ensureWorkspaceRunning('org-1', {
    fetch: async (input, init) => {
      capturedInput = input
      capturedInit = init
      return Response.json({
        workspace: {
          id: 'workspace-1',
          organizationId: 'org-1',
          state: 'provisioning',
          createdAt: 1,
          updatedAt: 2,
        },
        job: {
          id: 'job-1',
          workspaceId: 'workspace-1',
          operation: 'ensure_running',
          status: 'queued',
          attempt: 0,
          availableAt: 2,
          createdAt: 2,
          updatedAt: 2,
        },
      })
    },
  })

  expect(capturedInput).toBe('/api/workspaces/personal/ensure-running')
  expect(capturedInit?.method).toBe('POST')
  expect(JSON.parse(String(capturedInit?.body))).toEqual({ organizationId: 'org-1' })
  expect(result.workspace.state).toBe('provisioning')
  expect(result.job?.id).toBe('job-1')
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
