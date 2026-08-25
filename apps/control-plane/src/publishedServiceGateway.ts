import type { PublishedService } from '@nebula-cloud/database'
import { WorkerClientError } from './workerClient'

export interface PublishedServiceWorker {
  proxyWorkspaceService(input: {
    workspaceId: string
    targetPort: number
    servicePath: string
    request: Request
    signal?: AbortSignal
  }): Promise<Response>
}

export interface PublishedServiceGatewayOptions {
  worker: PublishedServiceWorker
  resolveService: (slug: string) => PublishedService | null
}

const responseHeaderBlocklist = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'server',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function unavailable(): Response {
  return Response.json({
    error: 'published service is unavailable',
    code: 'published_service_unavailable',
    retryable: true,
  }, {
    status: 503,
    headers: { 'cache-control': 'no-store' },
  })
}

export class PublishedServiceGateway {
  readonly #worker: PublishedServiceWorker
  readonly #resolveService: (slug: string) => PublishedService | null

  constructor({ worker, resolveService }: PublishedServiceGatewayOptions) {
    this.#worker = worker
    this.#resolveService = resolveService
  }

  async proxy(input: {
    request: Request
    slug: string
    servicePath: string
  }): Promise<Response> {
    const publication = this.#resolveService(input.slug)
    if (!publication) {
      return Response.json({ error: 'published service not found', code: 'not_found' }, {
        status: 404,
        headers: { 'cache-control': 'no-store' },
      })
    }
    try {
      const upstream = await this.#worker.proxyWorkspaceService({
        workspaceId: publication.workspaceId,
        targetPort: publication.targetPort,
        servicePath: input.servicePath,
        request: input.request,
        signal: input.request.signal,
      })
      const headers = new Headers()
      upstream.headers.forEach((value, key) => {
        const normalized = key.toLowerCase()
        if (
          responseHeaderBlocklist.has(normalized)
          || normalized.startsWith('x-nubols-')
          || normalized.startsWith('x-nebula-')
        ) return
        headers.append(key, value)
      })
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (error instanceof WorkerClientError) return unavailable()
      return unavailable()
    }
  }
}
