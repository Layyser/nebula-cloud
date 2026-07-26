import type { PersonalWorkspace } from '@nebula-cloud/database'
import {
  WorkerClientError,
  type WorkerFetch,
  type WorkerRuntimeAccess,
} from './workerClient'

const requestHeaderBlocklist = new Set([
  'authorization',
  'connection',
  'cookie',
  'forwarded',
  'host',
  'keep-alive',
  'origin',
  'proxy-authenticate',
  'proxy-authorization',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
])

const responseHeaderBlocklist = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'server',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'www-authenticate',
])

export interface RuntimeAccessProvider {
  getRuntimeAccess(input: {
    workspaceId: string
    signal?: AbortSignal
  }): Promise<WorkerRuntimeAccess>
}

export interface RuntimeGatewayOptions {
  worker: RuntimeAccessProvider
  resolveWorkspace: (input: {
    workspaceId: string
    userId: string
    organizationId: string
  }) => PersonalWorkspace | null
  fetch?: WorkerFetch
}

export interface RuntimeGatewayRequest {
  request: Request
  workspaceId: string
  runtimePath: string
  userId: string
  organizationId: string
}

function gatewayError(
  status: number,
  code: string,
  error: string,
  retryable = false,
): Response {
  return Response.json({
    error,
    code,
    ...(retryable ? { retryable: true } : {}),
  }, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function privateRuntimeURL(
  access: WorkerRuntimeAccess,
  runtimePath: string,
  search: string,
): URL {
  const base = new URL(`http://${access.address}`)
  if (base.protocol !== 'http:' || !base.hostname || base.username || base.password) {
    throw new Error('invalid private runtime address')
  }
  const path = runtimePath.startsWith('/') ? runtimePath : `/${runtimePath}`
  return new URL(`${path}${search}`, base)
}

function runtimeRequestHeaders(request: Request, accessToken: string): Headers {
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    const normalized = key.toLowerCase()
    if (
      requestHeaderBlocklist.has(normalized)
      || normalized.startsWith('sec-')
    ) return
    headers.set(key, value)
  })
  headers.set('authorization', `Bearer ${accessToken}`)
  return headers
}

function browserResponseHeaders(upstream: Response): Headers {
  const headers = new Headers()
  upstream.headers.forEach((value, key) => {
    const normalized = key.toLowerCase()
    if (
      responseHeaderBlocklist.has(normalized)
      || normalized.startsWith('access-control-')
    ) return
    headers.set(key, value)
  })
  headers.set('cache-control', 'no-store')
  return headers
}

export class RuntimeGateway {
  readonly #worker: RuntimeAccessProvider
  readonly #resolveWorkspace: RuntimeGatewayOptions['resolveWorkspace']
  readonly #fetch: WorkerFetch

  constructor({
    worker,
    resolveWorkspace,
    fetch = (input, init) => globalThis.fetch(input, init),
  }: RuntimeGatewayOptions) {
    this.#worker = worker
    this.#resolveWorkspace = resolveWorkspace
    this.#fetch = fetch
  }

  async proxy({
    request,
    workspaceId,
    runtimePath,
    userId,
    organizationId,
  }: RuntimeGatewayRequest): Promise<Response> {
    const workspace = this.#resolveWorkspace({
      workspaceId,
      userId,
      organizationId,
    })
    if (!workspace) {
      return gatewayError(404, 'workspace_not_found', 'workspace not found')
    }
    if (workspace.state !== 'ready' || !workspace.workerWorkspaceId) {
      return gatewayError(
        409,
        'workspace_not_ready',
        'workspace runtime is not ready',
        true,
      )
    }

    let access: WorkerRuntimeAccess
    try {
      access = await this.#worker.getRuntimeAccess({
        workspaceId: workspace.workerWorkspaceId,
        signal: request.signal,
      })
    } catch (error) {
      if (request.signal.aborted) {
        return gatewayError(499, 'client_closed_request', 'request was cancelled')
      }
      const retryable = error instanceof WorkerClientError
        ? error.retryable
        : true
      return gatewayError(
        503,
        'runtime_access_unavailable',
        'workspace runtime is unavailable',
        retryable,
      )
    }

    let target: URL
    try {
      target = privateRuntimeURL(
        access,
        runtimePath,
        new URL(request.url).search,
      )
    } catch {
      return gatewayError(
        502,
        'runtime_address_invalid',
        'workspace runtime address is invalid',
        true,
      )
    }

    let upstream: Response
    try {
      upstream = await this.#fetch(target, {
        method: request.method,
        headers: runtimeRequestHeaders(request, access.accessToken),
        body: request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body,
        redirect: 'manual',
        signal: request.signal,
      })
    } catch {
      if (request.signal.aborted) {
        return gatewayError(499, 'client_closed_request', 'request was cancelled')
      }
      return gatewayError(
        502,
        'runtime_unreachable',
        'workspace runtime could not be reached',
        true,
      )
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: browserResponseHeaders(upstream),
    })
  }
}
