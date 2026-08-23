import { workerAuthorizationHeader } from './workerAuth'

export type WorkerFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export interface WorkerClientOptions {
  baseURL: string
  token: string
  workspaceImage: string
  fetch?: WorkerFetch
  now?: () => number
  nonce?: () => string
}

interface WorkerErrorResponse {
  error?: string
  code?: string
  retryable?: boolean
}

interface WorkerMutationResponse {
  workspace: {
    id: string
    observed_state: string
  }
}

interface WorkerRuntimeAccessResponse {
  workspace_id: string
  network: string
  address: string
  access_token: string
}

interface WorkerWorkspaceResponse {
  id: string
  observed_state: string
  image: string
  resources: {
    memory_request_bytes: number
    memory_limit_bytes: number
    cpu_request: number
    cpu_limit: number
    pids_limit: number
    disk_limit_bytes: number
  }
}

export interface WorkerProvisioningResult {
  workspaceId: string
  observedState: string
}

export interface WorkerRuntimeAccess {
  workspaceId: string
  network: string
  address: string
  accessToken: string
}

export interface WorkerWorkspaceInfo {
  workspaceId: string
  observedState: string
  image: string
  resources: WorkerWorkspaceResponse['resources']
}

export class WorkerClientError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number

  constructor({
    message,
    code,
    retryable,
    status,
  }: {
    message: string
    code: string
    retryable: boolean
    status: number
  }) {
    super(message)
    this.name = 'WorkerClientError'
    this.code = code
    this.retryable = retryable
    this.status = status
  }
}

export class NebulaWorkerClient {
  readonly #baseURL: string
  readonly #token: string
  readonly #workspaceImage: string
  readonly #fetch: WorkerFetch
  readonly #now: () => number
  readonly #nonce: () => string

  constructor({
    baseURL,
    token,
    workspaceImage,
    fetch = (input, init) => globalThis.fetch(input, init),
    now = Date.now,
    nonce,
  }: WorkerClientOptions) {
    this.#baseURL = baseURL.replace(/\/$/, '')
    this.#token = token.trim()
    this.#workspaceImage = workspaceImage.trim()
    this.#fetch = fetch
    this.#now = now
    this.#nonce = nonce ?? (() => crypto.randomUUID().replaceAll('-', ''))
    if (!this.#baseURL) throw new Error('Worker base URL is required')
    if (this.#token.length < 32) {
      throw new Error('Worker service signing secret must contain at least 32 characters')
    }
    if (!this.#workspaceImage) throw new Error('Workspace image is required')
  }

  async ensureWorkspaceRunning({
    workspaceId,
    jobId,
    signal,
  }: {
    workspaceId: string
    jobId: string
    signal?: AbortSignal
  }): Promise<WorkerProvisioningResult> {
    const encodedWorkspaceId = encodeURIComponent(workspaceId)
    await this.#request(
      `/internal/v1/workspaces/${encodedWorkspaceId}`,
      {
        method: 'PUT',
        idempotencyKey: `${jobId}:create`,
        signal,
        body: {
          spec: {
            id: workspaceId,
            image: this.#workspaceImage,
            resources: {},
          },
        },
      },
    )
    const running = await this.#request(
      `/internal/v1/workspaces/${encodedWorkspaceId}/ensure-running`,
      {
        method: 'POST',
        idempotencyKey: `${jobId}:ensure-running`,
        signal,
      },
    )
    const payload = running as WorkerMutationResponse
    if (
      payload.workspace?.id !== workspaceId
      || payload.workspace.observed_state !== 'ready'
    ) {
      throw new WorkerClientError({
        message: 'Worker did not report the workspace ready',
        code: 'worker_workspace_not_ready',
        retryable: true,
        status: 503,
      })
    }
    return {
      workspaceId: payload.workspace.id,
      observedState: payload.workspace.observed_state,
    }
  }

  async getRuntimeAccess({
    workspaceId,
    signal,
  }: {
    workspaceId: string
    signal?: AbortSignal
  }): Promise<WorkerRuntimeAccess> {
    const payload = await this.#request(
      `/internal/v1/workspaces/${encodeURIComponent(workspaceId)}/runtime-access`,
      {
        method: 'GET',
        signal,
      },
    ) as WorkerRuntimeAccessResponse
    if (
      payload.workspace_id !== workspaceId
      || !payload.address?.trim()
      || !payload.access_token?.trim()
    ) {
      throw new WorkerClientError({
        message: 'Worker returned invalid runtime access material',
        code: 'worker_invalid_runtime_access',
        retryable: true,
        status: 502,
      })
    }
    return {
      workspaceId: payload.workspace_id,
      network: payload.network,
      address: payload.address,
      accessToken: payload.access_token,
    }
  }

  async getWorkspace({
    workspaceId,
    signal,
  }: {
    workspaceId: string
    signal?: AbortSignal
  }): Promise<WorkerWorkspaceInfo> {
    const payload = await this.#request(
      `/internal/v1/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: 'GET', signal },
    ) as WorkerWorkspaceResponse
    if (
      payload?.id !== workspaceId
      || typeof payload.observed_state !== 'string'
      || typeof payload.image !== 'string'
      || payload.image.trim() === ''
      || !payload.resources
    ) {
      throw new WorkerClientError({
        message: 'Worker returned invalid workspace metadata',
        code: 'worker_invalid_workspace_metadata',
        retryable: true,
        status: 502,
      })
    }
    return {
      workspaceId: payload.id,
      observedState: payload.observed_state,
      image: payload.image,
      resources: payload.resources,
    }
  }

  async restartWorkspace({
    workspaceId,
    operationId,
    signal,
  }: {
    workspaceId: string
    operationId: string
    signal?: AbortSignal
  }): Promise<WorkerProvisioningResult> {
    const payload = await this.#request(
      `/internal/v1/workspaces/${encodeURIComponent(workspaceId)}/restart`,
      {
        method: 'POST',
        idempotencyKey: operationId,
        signal,
        body: {
          timeout_seconds: 30,
        },
      },
    ) as WorkerMutationResponse
    if (
      payload.workspace?.id !== workspaceId
      || payload.workspace.observed_state !== 'ready'
    ) {
      throw new WorkerClientError({
        message: 'Worker did not report the restarted workspace ready',
        code: 'worker_workspace_not_ready',
        retryable: true,
        status: 503,
      })
    }
    return {
      workspaceId: payload.workspace.id,
      observedState: payload.workspace.observed_state,
    }
  }

  async #request(
    path: string,
    {
      method,
      idempotencyKey,
      body,
      signal,
    }: {
      method: 'GET' | 'PUT' | 'POST'
      idempotencyKey?: string
      body?: unknown
      signal?: AbortSignal
    },
  ): Promise<unknown> {
    const authorization = workerAuthorizationHeader({
      secret: this.#token,
      method,
      path,
      now: this.#now,
      nonce: this.#nonce,
    })
    let response: Response
    try {
      response = await this.#fetch(`${this.#baseURL}${path}`, {
        method,
        signal,
        headers: {
          authorization,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
          'x-nebula-actor-id': 'nebula-cloud-control-plane',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new WorkerClientError({
        message: 'Worker is unreachable',
        code: 'worker_unreachable',
        retryable: true,
        status: 503,
      })
    }

    const payload = await response.json().catch(() => null) as
      | WorkerMutationResponse
      | WorkerRuntimeAccessResponse
      | WorkerErrorResponse
      | null
    if (!response.ok) {
      const workerError = payload as WorkerErrorResponse | null
      throw new WorkerClientError({
        message: workerError?.error || `Worker request failed (${response.status})`,
        code: workerError?.code || 'worker_request_failed',
        retryable: workerError?.retryable ?? response.status >= 500,
        status: response.status,
      })
    }
    if (!payload) {
      throw new WorkerClientError({
        message: 'Worker returned an invalid response',
        code: 'worker_invalid_response',
        retryable: true,
        status: 502,
      })
    }
    return payload
  }
}
