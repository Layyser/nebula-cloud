import type { Database } from 'bun:sqlite'
import {
  assignWorkspaceWorker,
  getWorkerHost,
  getWorkspaceById,
  type WorkerHost,
  type WorkerPlacementRequirements,
} from '@nebula-cloud/database'
import {
  NebulaWorkerClient,
  type WorkerStatus,
  type WorkerProvisioningResult,
  type WorkerRuntimeAccess,
  type WorkerServiceProxyRequest,
  type WorkerWorkspaceInfo,
} from './workerClient'

export interface WorkerCredentialProvider {
  getSecret(credentialKeyId: string): string | null
}

export class MapWorkerCredentialProvider implements WorkerCredentialProvider {
  readonly #secrets: ReadonlyMap<string, string>

  constructor(secrets: ReadonlyMap<string, string>) {
    this.#secrets = secrets
  }

  getSecret(credentialKeyId: string): string | null {
    return this.#secrets.get(credentialKeyId)?.trim() || null
  }
}

export interface WorkerConnection {
  baseURL: string
  token: string
}

export interface WorkerClientFactoryOptions {
  credentials: WorkerCredentialProvider
  workspaceImage: string
}

export interface RoutedWorkerClient {
  getStatus(input?: { signal?: AbortSignal }): Promise<WorkerStatus>
  ensureWorkspaceRunning(input: {
    workspaceId: string
    jobId: string
    signal?: AbortSignal
  }): Promise<WorkerProvisioningResult>
  getRuntimeAccess(input: {
    workspaceId: string
    signal?: AbortSignal
  }): Promise<WorkerRuntimeAccess>
  getWorkspace(input: {
    workspaceId: string
    signal?: AbortSignal
  }): Promise<WorkerWorkspaceInfo>
  restartWorkspace(input: {
    workspaceId: string
    operationId: string
    signal?: AbortSignal
  }): Promise<WorkerProvisioningResult>
  proxyWorkspaceService(input: WorkerServiceProxyRequest): Promise<Response>
}

export interface WorkerClientResolver {
  connection(workerHost: WorkerHost): WorkerConnection
  client(workerHost: WorkerHost): RoutedWorkerClient
}

export class WorkerClientFactory implements WorkerClientResolver {
  readonly #credentials: WorkerCredentialProvider
  readonly #workspaceImage: string
  readonly #clients = new Map<string, { revision: string; client: NebulaWorkerClient }>()

  constructor({ credentials, workspaceImage }: WorkerClientFactoryOptions) {
    this.#credentials = credentials
    this.#workspaceImage = workspaceImage
  }

  connection(workerHost: WorkerHost): WorkerConnection {
    const token = this.#credentials.getSecret(workerHost.credentialKeyId)
    if (!token) {
      throw new Error(`Worker credential ${workerHost.credentialKeyId} is unavailable`)
    }
    return { baseURL: workerHost.baseURL, token }
  }

  client(workerHost: WorkerHost): RoutedWorkerClient {
    const connection = this.connection(workerHost)
    const revision = [
      workerHost.updatedAt,
      workerHost.baseURL,
      workerHost.credentialKeyId,
      connection.token,
      this.#workspaceImage,
    ].join(':')
    const cached = this.#clients.get(workerHost.id)
    if (cached?.revision === revision) return cached.client
    const client = new NebulaWorkerClient({
      baseURL: connection.baseURL,
      token: connection.token,
      workspaceImage: this.#workspaceImage,
    })
    this.#clients.set(workerHost.id, { revision, client })
    return client
  }
}

export interface WorkerDirectoryOptions {
  database: Database
  clientFactory: WorkerClientResolver
  placementRequirements: WorkerPlacementRequirements
  heartbeatMaxAgeMs?: number
}

export class WorkerDirectory {
  readonly #database: Database
  readonly #clientFactory: WorkerClientResolver
  readonly #placementRequirements: WorkerPlacementRequirements
  readonly #heartbeatMaxAgeMs: number

  constructor({
    database,
    clientFactory,
    placementRequirements,
    heartbeatMaxAgeMs = 30000,
  }: WorkerDirectoryOptions) {
    this.#database = database
    this.#clientFactory = clientFactory
    this.#placementRequirements = placementRequirements
    this.#heartbeatMaxAgeMs = heartbeatMaxAgeMs
  }

  async ensureWorkspaceRunning(input: {
    workspaceId: string
    jobId: string
    signal?: AbortSignal
  }): Promise<WorkerProvisioningResult> {
    const assignment = assignWorkspaceWorker(this.#database, {
      workspaceId: input.workspaceId,
      requirements: this.#placementRequirements,
      heartbeatMaxAgeMs: this.#heartbeatMaxAgeMs,
    })
    return await this.#clientFactory.client(assignment.workerHost).ensureWorkspaceRunning(input)
  }

  async getRuntimeAccess(input: {
    workspaceId: string
    signal?: AbortSignal
  }): Promise<WorkerRuntimeAccess> {
    const resolved = this.#assigned(input.workspaceId)
    return await this.#clientFactory.client(resolved.workerHost).getRuntimeAccess({
      workspaceId: resolved.workerWorkspaceId,
      signal: input.signal,
    })
  }

  async getWorkspace(input: {
    workspaceId: string
    signal?: AbortSignal
  }): Promise<WorkerWorkspaceInfo> {
    const resolved = this.#assigned(input.workspaceId)
    return await this.#clientFactory.client(resolved.workerHost).getWorkspace({
      workspaceId: resolved.workerWorkspaceId,
      signal: input.signal,
    })
  }

  async restartWorkspace(input: {
    workspaceId: string
    operationId: string
    signal?: AbortSignal
  }): Promise<WorkerProvisioningResult> {
    const resolved = this.#assigned(input.workspaceId)
    return await this.#clientFactory.client(resolved.workerHost).restartWorkspace({
      workspaceId: resolved.workerWorkspaceId,
      operationId: input.operationId,
      signal: input.signal,
    })
  }

  async proxyWorkspaceService(input: WorkerServiceProxyRequest): Promise<Response> {
    const resolved = this.#assigned(input.workspaceId)
    return await this.#clientFactory.client(resolved.workerHost).proxyWorkspaceService({
      ...input,
      workspaceId: resolved.workerWorkspaceId,
    })
  }

  connectionForWorkspace(workspaceId: string): WorkerConnection {
    return this.#clientFactory.connection(this.#assigned(workspaceId).workerHost)
  }

  #assigned(workspaceId: string): {
    workerHost: WorkerHost
    workerWorkspaceId: string
  } {
    const workspace = getWorkspaceById(this.#database, workspaceId)
    if (!workspace?.workerHostId || !workspace.workerWorkspaceId) {
      throw new Error('Workspace has not been assigned to a worker')
    }
    const workerHost = getWorkerHost(this.#database, workspace.workerHostId)
    if (!workerHost) throw new Error('Assigned worker host was not found')
    return {
      workerHost,
      workerWorkspaceId: workspace.workerWorkspaceId,
    }
  }
}
