export type WorkerFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export interface WorkerClientOptions {
  baseURL: string
  token: string
  workspaceImage: string
  fetch?: WorkerFetch
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

export interface WorkerProvisioningResult {
  workspaceId: string
  observedState: string
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

  constructor({
    baseURL,
    token,
    workspaceImage,
    fetch = (input, init) => globalThis.fetch(input, init),
  }: WorkerClientOptions) {
    this.#baseURL = baseURL.replace(/\/$/, '')
    this.#token = token.trim()
    this.#workspaceImage = workspaceImage.trim()
    this.#fetch = fetch
    if (!this.#baseURL) throw new Error('Worker base URL is required')
    if (!this.#token) throw new Error('Worker service token is required')
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

  async #request(
    path: string,
    {
      method,
      idempotencyKey,
      body,
      signal,
    }: {
      method: 'PUT' | 'POST'
      idempotencyKey: string
      body?: unknown
      signal?: AbortSignal
    },
  ): Promise<unknown> {
    let response: Response
    try {
      response = await this.#fetch(`${this.#baseURL}${path}`, {
        method,
        signal,
        headers: {
          authorization: `Bearer ${this.#token}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
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
