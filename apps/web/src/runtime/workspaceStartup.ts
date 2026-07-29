import type {
  EnsureWorkspaceRunningResponse,
  PersonalWorkspaceResponse,
} from '@nebula-cloud/contracts'

export type WorkspaceStartupStage =
  | 'resolving'
  | 'provisioning'
  | 'starting'
  | 'ready'

export interface WorkspaceStartupProgress {
  stage: WorkspaceStartupStage
  workspaceId?: string
}

export class WorkspaceStartupError extends Error {
  readonly stage: Exclude<WorkspaceStartupStage, 'ready'>
  readonly retryable: boolean

  constructor(
    stage: Exclude<WorkspaceStartupStage, 'ready'>,
    message: string,
    retryable = true,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'WorkspaceStartupError'
    this.stage = stage
    this.retryable = retryable
  }
}

interface WorkspaceStartupOptions {
  organizationId: string
  resolveWorkspace: (
    organizationId: string,
  ) => Promise<PersonalWorkspaceResponse['workspace']>
  ensureRunning: (
    organizationId: string,
  ) => Promise<EnsureWorkspaceRunningResponse>
  runtimeReady: (workspaceId: string, signal: AbortSignal) => Promise<boolean>
  onProgress?: (progress: WorkspaceStartupProgress) => void
  signal?: AbortSignal
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  provisioningPollMs?: number
  provisioningAttempts?: number
  runtimePollMs?: number
  runtimeAttempts?: number
}

function abortError(): DOMException {
  return new DOMException('Workspace startup was cancelled', 'AbortError')
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError()
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(abortError())
    }, { once: true })
  })
}

function startupError(
  stage: Exclude<WorkspaceStartupStage, 'ready'>,
  error: unknown,
  fallback: string,
): WorkspaceStartupError {
  if (error instanceof DOMException && error.name === 'AbortError') throw error
  if (error instanceof WorkspaceStartupError) return error
  return new WorkspaceStartupError(
    stage,
    error instanceof Error ? error.message : fallback,
    true,
    { cause: error },
  )
}

export async function startPersonalWorkspace({
  organizationId,
  resolveWorkspace,
  ensureRunning,
  runtimeReady,
  onProgress = () => {},
  signal = new AbortController().signal,
  wait = defaultWait,
  provisioningPollMs = 1000,
  provisioningAttempts = 90,
  runtimePollMs = 500,
  runtimeAttempts = 30,
}: WorkspaceStartupOptions): Promise<string> {
  throwIfAborted(signal)
  onProgress({ stage: 'resolving' })

  let workspace: PersonalWorkspaceResponse['workspace']
  try {
    workspace = await resolveWorkspace(organizationId)
  } catch (error) {
    throw startupError(
      'resolving',
      error,
      'Your personal workspace could not be resolved.',
    )
  }
  throwIfAborted(signal)

  if (workspace.state !== 'ready') {
    onProgress({ stage: 'provisioning', workspaceId: workspace.id })
    try {
      const scheduled = await ensureRunning(organizationId)
      workspace = scheduled.workspace
    } catch (error) {
      throw startupError(
        'provisioning',
        error,
        'Your personal workspace could not be provisioned.',
      )
    }

    for (let attempt = 0; workspace.state !== 'ready'; attempt += 1) {
      throwIfAborted(signal)
      if (workspace.state === 'failed') {
        throw new WorkspaceStartupError(
          'provisioning',
          'Provisioning failed. Retry to schedule a fresh attempt.',
        )
      }
      if (attempt >= provisioningAttempts) {
        throw new WorkspaceStartupError(
          'provisioning',
          'Provisioning is taking longer than expected. Retry to check again.',
        )
      }
      await wait(provisioningPollMs, signal)
      try {
        workspace = await resolveWorkspace(organizationId)
      } catch (error) {
        throw startupError(
          'provisioning',
          error,
          'Workspace provisioning status could not be refreshed.',
        )
      }
    }
  }

  onProgress({ stage: 'starting', workspaceId: workspace.id })
  for (let attempt = 0; attempt < runtimeAttempts; attempt += 1) {
    throwIfAborted(signal)
    try {
      if (await runtimeReady(workspace.id, signal)) {
        onProgress({ stage: 'ready', workspaceId: workspace.id })
        return workspace.id
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
    }
    if (attempt + 1 < runtimeAttempts) await wait(runtimePollMs, signal)
  }
  throw new WorkspaceStartupError(
    'starting',
    'Nebula was provisioned, but its runtime did not become ready. Retry to reconnect.',
  )
}
