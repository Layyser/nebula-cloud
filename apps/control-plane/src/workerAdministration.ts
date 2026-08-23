import type { Database } from 'bun:sqlite'
import type {
  RegisterWorkerHostRequest,
  UpdateWorkerHostRequest,
  WorkerHostSummary,
} from '@nebula-cloud/contracts'
import {
  getWorkerHost,
  listWorkerHosts,
  setWorkerHostScheduling,
  upsertWorkerHost,
  type WorkerHost,
} from '@nebula-cloud/database'

function toSummary(worker: WorkerHost): WorkerHostSummary {
  return {
    id: worker.id,
    name: worker.name,
    provider: worker.provider,
    region: worker.region,
    baseURL: worker.baseURL,
    credentialKeyId: worker.credentialKeyId,
    enabled: worker.enabled,
    schedulable: worker.schedulable,
    state: worker.state,
    capacity: {
      memoryBytes: worker.totalMemoryBytes,
      cpuMillis: worker.totalCpuMillis,
      diskBytes: worker.totalDiskBytes,
      workspaceSlots: worker.totalWorkspaceSlots,
    },
    reserved: {
      memoryBytes: worker.reservedMemoryBytes,
      cpuMillis: worker.reservedCpuMillis,
      diskBytes: worker.reservedDiskBytes,
      workspaceSlots: worker.reservedWorkspaceSlots,
    },
    lastHeartbeatAt: worker.lastHeartbeatAt,
    lastErrorCode: worker.lastErrorCode,
    createdAt: worker.createdAt,
    updatedAt: worker.updatedAt,
  }
}

export class WorkerAdministration {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  list(): WorkerHostSummary[] {
    return listWorkerHosts(this.#database).map(toSummary)
  }

  register(input: RegisterWorkerHostRequest): WorkerHostSummary {
    const worker = upsertWorkerHost(this.#database, {
      id: input.id,
      name: input.name,
      provider: input.provider,
      region: input.region,
      baseURL: input.baseURL,
      credentialKeyId: input.credentialKeyId,
      totalMemoryBytes: input.capacity.memoryBytes,
      totalCpuMillis: input.capacity.cpuMillis,
      totalDiskBytes: input.capacity.diskBytes,
      totalWorkspaceSlots: input.capacity.workspaceSlots,
      enabled: input.enabled ?? true,
      // A newly registered host must be explicitly resumed after its private
      // connection and credential have been verified.
      schedulable: input.schedulable ?? false,
    })
    return toSummary(worker)
  }

  update(workerHostId: string, input: UpdateWorkerHostRequest): WorkerHostSummary | null {
    return this.#database.transaction(() => {
      const current = getWorkerHost(this.#database, workerHostId)
      if (!current) return null

      let worker = current
      if (
        input.name !== undefined
        || input.provider !== undefined
        || input.region !== undefined
        || input.baseURL !== undefined
        || input.credentialKeyId !== undefined
        || input.capacity !== undefined
      ) {
        worker = upsertWorkerHost(this.#database, {
          id: current.id,
          name: input.name ?? current.name,
          provider: input.provider ?? current.provider,
          region: input.region ?? current.region,
          baseURL: input.baseURL ?? current.baseURL,
          credentialKeyId: input.credentialKeyId ?? current.credentialKeyId,
          totalMemoryBytes: input.capacity?.memoryBytes ?? current.totalMemoryBytes,
          totalCpuMillis: input.capacity?.cpuMillis ?? current.totalCpuMillis,
          totalDiskBytes: input.capacity?.diskBytes ?? current.totalDiskBytes,
          totalWorkspaceSlots: input.capacity?.workspaceSlots
            ?? current.totalWorkspaceSlots,
          enabled: current.enabled,
          schedulable: current.schedulable,
        })
      }

      if (input.action === 'enable') {
        worker = setWorkerHostScheduling(this.#database, {
          workerHostId,
          enabled: true,
          schedulable: false,
          state: 'unknown',
        })
      } else if (input.action === 'disable') {
        worker = setWorkerHostScheduling(this.#database, {
          workerHostId,
          enabled: false,
          schedulable: false,
          state: 'unavailable',
        })
      } else if (input.action === 'drain') {
        worker = setWorkerHostScheduling(this.#database, {
          workerHostId,
          schedulable: false,
          state: 'draining',
        })
      } else if (input.action === 'resume') {
        worker = setWorkerHostScheduling(this.#database, {
          workerHostId,
          enabled: true,
          schedulable: true,
          state: 'unknown',
        })
      }

      return toSummary(worker)
    }).immediate()
  }
}
