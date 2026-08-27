import type { Database } from 'bun:sqlite'
import {
  claimProvisioningJob,
  finishProvisioningJob,
  ProvisioningJobLeaseLostError,
} from '@nebula-cloud/database'
import {
  WorkerClientError,
} from './workerClient'

export interface ProvisioningWorker {
  ensureWorkspaceRunning(input: {
    workspaceId: string
    jobId: string
    signal?: AbortSignal
  }): Promise<{ workspaceId: string; observedState: string }>
}

export interface ProvisioningProcessorOptions {
  database: Database
  worker: ProvisioningWorker
  processorId: string
  pollIntervalMs?: number
  leaseDurationMs?: number
  maximumAttempts?: number
  authorizeWorkspace?: (workspaceId: string) => boolean
}

export class ProvisioningProcessor {
  readonly #database: Database
  readonly #worker: ProvisioningWorker
  readonly #processorId: string
  readonly #pollIntervalMs: number
  readonly #leaseDurationMs: number
  readonly #maximumAttempts: number
  readonly #authorizeWorkspace: (workspaceId: string) => boolean
  #timer: ReturnType<typeof setTimeout> | null = null
  #controller: AbortController | null = null
  #stopped = true

  constructor({
    database,
    worker,
    processorId,
    pollIntervalMs = 1000,
    leaseDurationMs = 180000,
    maximumAttempts = 8,
    authorizeWorkspace = () => true,
  }: ProvisioningProcessorOptions) {
    this.#database = database
    this.#worker = worker
    this.#processorId = processorId
    this.#pollIntervalMs = pollIntervalMs
    this.#leaseDurationMs = leaseDurationMs
    this.#maximumAttempts = maximumAttempts
    this.#authorizeWorkspace = authorizeWorkspace
  }

  start(): void {
    if (!this.#stopped) return
    this.#stopped = false
    this.#schedule(0)
  }

  stop(): void {
    this.#stopped = true
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
    this.#controller?.abort()
    this.#controller = null
  }

  async processNext(): Promise<boolean> {
    const job = claimProvisioningJob(this.#database, {
      leaseOwner: this.#processorId,
      leaseDurationMs: this.#leaseDurationMs,
    })
    if (!job) return false

    this.#controller = new AbortController()
    try {
      if (!this.#authorizeWorkspace(job.workspaceId)) {
        throw new WorkerClientError({
          message: 'An active Operator entitlement is required',
          code: 'operator_entitlement_required',
          retryable: false,
          status: 403,
        })
      }
      const result = await this.#worker.ensureWorkspaceRunning({
        workspaceId: job.workspaceId,
        jobId: job.id,
        signal: this.#controller.signal,
      })
      finishProvisioningJob(this.#database, {
        jobId: job.id,
        leaseOwner: this.#processorId,
        outcome: 'succeeded',
        workerWorkspaceId: result.workspaceId,
      })
      console.info(JSON.stringify({
        event: 'workspace_provisioned',
        workspaceId: job.workspaceId,
        jobId: job.id,
        attempt: job.attempt,
      }))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError' && this.#stopped) {
        return true
      }
      const workerError = error instanceof WorkerClientError
        ? error
        : new WorkerClientError({
            message: 'Unexpected provisioning failure',
            code: 'worker_unexpected_failure',
            retryable: true,
            status: 500,
          })
      const retryable = workerError.retryable && job.attempt < this.#maximumAttempts
      const retryDelayMs = Math.min(60000, 1000 * Math.pow(2, Math.max(0, job.attempt - 1)))
      try {
        finishProvisioningJob(this.#database, {
          jobId: job.id,
          leaseOwner: this.#processorId,
          outcome: 'failed',
          retryable,
          retryDelayMs,
          errorCode: workerError.code,
          errorMessage: workerError.message,
        })
      } catch (finishError) {
        if (!(finishError instanceof ProvisioningJobLeaseLostError)) throw finishError
      }
      console.error(JSON.stringify({
        event: 'workspace_provisioning_failed',
        workspaceId: job.workspaceId,
        jobId: job.id,
        attempt: job.attempt,
        code: workerError.code,
        retryable,
      }))
    } finally {
      this.#controller = null
    }
    return true
  }

  #schedule(delayMs: number): void {
    if (this.#stopped) return
    this.#timer = setTimeout(() => {
      this.#timer = null
      void this.processNext()
        .catch(error => {
          console.error(JSON.stringify({
            event: 'provisioning_processor_error',
            message: error instanceof Error ? error.message : 'unknown error',
          }))
        })
        .finally(() => this.#schedule(this.#pollIntervalMs))
    }, delayMs)
  }
}
