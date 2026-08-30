import type { Database } from 'bun:sqlite'
import {
  listWorkerHosts,
  recordWorkerHealth,
  type WorkerHost,
} from '@nebula-cloud/database'
import { WorkerClientError, type WorkerStatus } from './workerClient'
import type { WorkerClientResolver } from './workerDirectory'
import { safeLogJSON } from './safeLog'

export interface WorkerHealthAlert {
  event: 'worker_unavailable' | 'worker_recovered' | 'worker_heartbeat_stale'
  workerHostId: string
  previousState: WorkerHost['state']
  errorCode?: string
  lastHeartbeatAt?: number | null
}

export class WorkerHealthMonitor {
  readonly #database: Database
  readonly #clients: WorkerClientResolver
  readonly #intervalMs: number
  readonly #timeoutMs: number
  readonly #staleAfterMs: number
  readonly #now: () => number
  readonly #alert: (alert: WorkerHealthAlert) => void
  readonly #staleWorkers = new Set<string>()
  #timer: ReturnType<typeof setInterval> | null = null

  constructor({
    database,
    clients,
    intervalMs = 10000,
    timeoutMs = 5000,
    staleAfterMs = 30000,
    now = Date.now,
    alert = value => console.error(safeLogJSON(value)),
  }: {
    database: Database
    clients: WorkerClientResolver
    intervalMs?: number
    timeoutMs?: number
    staleAfterMs?: number
    now?: () => number
    alert?: (alert: WorkerHealthAlert) => void
  }) {
    this.#database = database
    this.#clients = clients
    this.#intervalMs = intervalMs
    this.#timeoutMs = timeoutMs
    this.#staleAfterMs = staleAfterMs
    this.#now = now
    this.#alert = alert
  }

  start(): void {
    if (this.#timer) return
    this.#timer = setInterval(() => void this.pollOnce(), this.#intervalMs)
  }

  stop(): void {
    if (!this.#timer) return
    clearInterval(this.#timer)
    this.#timer = null
  }

  async pollOnce(): Promise<void> {
    await Promise.all(listWorkerHosts(this.#database).map(host => this.#pollHost(host)))
  }

  async #pollHost(host: WorkerHost): Promise<void> {
    try {
      const status = await this.#clients.client(host).getStatus({
        signal: AbortSignal.timeout(this.#timeoutMs),
      })
      assertRegisteredCapacity(host, status)
      if (!status.ready) {
        this.#recordUnavailable(host, 'worker_not_ready', true)
        return
      }
      recordWorkerHealth(this.#database, {
        workerHostId: host.id,
        state: 'healthy',
        capacity: status.capacity,
        now: this.#now,
      })
      this.#staleWorkers.delete(host.id)
      if (host.state === 'unavailable') {
        this.#alert({
          event: 'worker_recovered',
          workerHostId: host.id,
          previousState: host.state,
        })
      }
    } catch (error) {
      this.#recordUnavailable(host, healthErrorCode(error), false)
    }
  }

  #recordUnavailable(
    host: WorkerHost,
    errorCode: string,
    heartbeatObserved: boolean,
  ): void {
    recordWorkerHealth(this.#database, {
      workerHostId: host.id,
      state: 'unavailable',
      errorCode,
      heartbeatObserved,
      now: this.#now,
    })
    if (host.state !== 'unavailable') {
      this.#alert({
        event: 'worker_unavailable',
        workerHostId: host.id,
        previousState: host.state,
        errorCode,
      })
    }
    const stale = !heartbeatObserved
      && host.lastHeartbeatAt !== null
      && this.#now() - host.lastHeartbeatAt >= this.#staleAfterMs
    if (stale && !this.#staleWorkers.has(host.id)) {
      this.#staleWorkers.add(host.id)
      this.#alert({
        event: 'worker_heartbeat_stale',
        workerHostId: host.id,
        previousState: host.state,
        errorCode,
        lastHeartbeatAt: host.lastHeartbeatAt,
      })
    }
  }
}

function assertRegisteredCapacity(host: WorkerHost, status: WorkerStatus): void {
  const capacity = status.capacity
  if (
    capacity.totalMemoryBytes !== host.totalMemoryBytes
    || capacity.totalCpuMillis !== host.totalCpuMillis
    || capacity.totalDiskBytes !== host.totalDiskBytes
    || capacity.totalWorkspaceSlots !== host.totalWorkspaceSlots
  ) {
    throw new WorkerClientError({
      message: 'Worker-reported capacity does not match its registered ceiling',
      code: 'worker_capacity_mismatch',
      retryable: false,
      status: 502,
    })
  }
}

function healthErrorCode(error: unknown): string {
  if (error instanceof WorkerClientError) return error.code
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return 'worker_health_timeout'
  }
  return 'worker_health_failed'
}
