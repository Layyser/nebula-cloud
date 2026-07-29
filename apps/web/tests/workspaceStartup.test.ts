import { expect, test } from 'bun:test'
import type {
  PersonalWorkspaceResponse,
  PersonalWorkspaceState,
} from '@nebula-cloud/contracts'
import {
  startPersonalWorkspace,
  WorkspaceStartupError,
  type WorkspaceStartupStage,
} from '../src/runtime/workspaceStartup'

function workspace(
  state: PersonalWorkspaceState,
): PersonalWorkspaceResponse['workspace'] {
  return {
    id: 'workspace-1',
    organizationId: 'org-1',
    state,
    createdAt: 1,
    updatedAt: 2,
  }
}

test('opens an already provisioned workspace after checking Nebula', async () => {
  const stages: WorkspaceStartupStage[] = []
  let ensureCalls = 0
  const workspaceId = await startPersonalWorkspace({
    organizationId: 'org-1',
    resolveWorkspace: async () => workspace('ready'),
    ensureRunning: async () => {
      ensureCalls += 1
      return { workspace: workspace('ready'), job: null }
    },
    runtimeReady: async () => true,
    onProgress: progress => stages.push(progress.stage),
  })

  expect(workspaceId).toBe('workspace-1')
  expect(stages).toEqual(['resolving', 'starting', 'ready'])
  expect(ensureCalls).toBe(0)
})

test('provisions, polls, and starts a new personal workspace', async () => {
  const stages: WorkspaceStartupStage[] = []
  const states: PersonalWorkspaceState[] = ['provisioning', 'ready']
  let waits = 0
  const workspaceId = await startPersonalWorkspace({
    organizationId: 'org-1',
    resolveWorkspace: async () => workspace(states.shift() ?? 'ready'),
    ensureRunning: async () => ({
      workspace: workspace('provisioning'),
      job: {
        id: 'job-1',
        workspaceId: 'workspace-1',
        operation: 'ensure_running',
        status: 'queued',
        attempt: 0,
        availableAt: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    }),
    runtimeReady: async () => true,
    wait: async () => { waits += 1 },
    onProgress: progress => stages.push(progress.stage),
  })

  expect(workspaceId).toBe('workspace-1')
  expect(stages).toEqual([
    'resolving',
    'provisioning',
    'starting',
    'ready',
  ])
  expect(waits).toBe(1)
})

test('retries Nebula readiness without scheduling another container', async () => {
  let readinessChecks = 0
  let waits = 0
  await startPersonalWorkspace({
    organizationId: 'org-1',
    resolveWorkspace: async () => workspace('ready'),
    ensureRunning: async () => {
      throw new Error('must not provision a ready workspace')
    },
    runtimeReady: async () => {
      readinessChecks += 1
      return readinessChecks === 3
    },
    wait: async () => { waits += 1 },
  })

  expect(readinessChecks).toBe(3)
  expect(waits).toBe(2)
})

test('reports the failed startup stage with an actionable retry', async () => {
  const startup = startPersonalWorkspace({
    organizationId: 'org-1',
    resolveWorkspace: async () => workspace('pending'),
    ensureRunning: async () => ({
      workspace: workspace('failed'),
      job: null,
    }),
    runtimeReady: async () => false,
    wait: async () => {},
  })

  await expect(startup).rejects.toBeInstanceOf(WorkspaceStartupError)
  await startup.catch(error => {
    expect(error.stage).toBe('provisioning')
    expect(error.retryable).toBe(true)
    expect(error.message).toContain('Retry')
  })
})

test('stops startup immediately when its owner unmounts', async () => {
  const controller = new AbortController()
  controller.abort()
  const startup = startPersonalWorkspace({
    organizationId: 'org-1',
    resolveWorkspace: async () => workspace('ready'),
    ensureRunning: async () => ({ workspace: workspace('ready'), job: null }),
    runtimeReady: async () => true,
    signal: controller.signal,
  })

  await expect(startup).rejects.toMatchObject({ name: 'AbortError' })
})
