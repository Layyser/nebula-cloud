import type { PublishedService } from '@nebula-cloud/database'
import { WorkerClientError } from './workerClient'
import { publishedServiceTokenAuthenticated } from './publishedServiceAccess'
import {
  PublicationConnectionLimiter,
  type PublicationConnectionLease,
  type PublicationConnectionScope,
} from './publicationConnectionLimiter'
import { PublicationBandwidthLimiter } from './publicationBandwidthLimiter'

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
  resolveConnectionScope: (publication: PublishedService) => PublicationConnectionScope | null
  connectionLimiter: PublicationConnectionLimiter
  bandwidthLimiter: PublicationBandwidthLimiter
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

function authenticationRequired(): Response {
  return Response.json({
    error: 'published service authentication required',
    code: 'published_service_authentication_required',
  }, {
    status: 401,
    headers: { 'cache-control': 'no-store' },
  })
}

function connectionLimitReached(): Response {
  return Response.json({
    error: 'published service connection limit reached',
    code: 'published_service_connection_limit_reached',
    retryable: true,
  }, {
    status: 429,
    headers: { 'cache-control': 'no-store', 'retry-after': '1' },
  })
}

function bandwidthLimitReached(): Response {
  return Response.json({
    error: 'published service bandwidth limit reached',
    code: 'published_service_bandwidth_limit_reached',
    retryable: true,
  }, {
    status: 429,
    headers: { 'cache-control': 'no-store', 'retry-after': '60' },
  })
}

function meteredRequest(
  request: Request,
  scope: PublicationConnectionScope,
  bandwidthLimiter: PublicationBandwidthLimiter,
): Request {
  if (!request.body) return request
  const reader = request.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await reader.read()
      if (result.done) {
        controller.close()
        return
      }
      if (!bandwidthLimiter.tryConsume(scope, result.value.byteLength)) {
        await reader.cancel('publication bandwidth limit reached')
        controller.error(new Error('publication_bandwidth_limit_reached'))
        return
      }
      controller.enqueue(result.value)
    },
    cancel: reason => reader.cancel(reason),
  })
  const init: RequestInit & { duplex: 'half' } = { body, duplex: 'half' }
  return new Request(request, init)
}

function responseWithLease(
  response: Response,
  lease: PublicationConnectionLease,
  scope: PublicationConnectionScope,
  bandwidthLimiter: PublicationBandwidthLimiter,
): Response {
  if (!response.body) {
    lease.release()
    return response
  }
  const reader = response.body.getReader()
  let released = false
  const release = () => {
    if (released) return
    released = true
    lease.release()
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          release()
          controller.close()
        } else {
          if (!bandwidthLimiter.tryConsume(scope, result.value.byteLength)) {
            await reader.cancel('publication bandwidth limit reached')
            release()
            controller.error(new Error('publication_bandwidth_limit_reached'))
            return
          }
          controller.enqueue(result.value)
        }
      } catch (error) {
        release()
        controller.error(error)
      }
    },
    async cancel(reason) {
      release()
      await reader.cancel(reason)
    },
  })
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export class PublishedServiceGateway {
  readonly #worker: PublishedServiceWorker
  readonly #resolveService: (slug: string) => PublishedService | null
  readonly #resolveConnectionScope: PublishedServiceGatewayOptions['resolveConnectionScope']
  readonly #connectionLimiter: PublicationConnectionLimiter
  readonly #bandwidthLimiter: PublicationBandwidthLimiter

  constructor({
    worker,
    resolveService,
    resolveConnectionScope,
    connectionLimiter,
    bandwidthLimiter,
  }: PublishedServiceGatewayOptions) {
    this.#worker = worker
    this.#resolveService = resolveService
    this.#resolveConnectionScope = resolveConnectionScope
    this.#connectionLimiter = connectionLimiter
    this.#bandwidthLimiter = bandwidthLimiter
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
    if (publication.protocol !== 'http') {
      return Response.json({ error: 'TCP publication requires a TCP connection', code: 'protocol_mismatch' }, {
        status: 404,
        headers: { 'cache-control': 'no-store' },
      })
    }
    if (
      publication.visibility === 'private'
      && (
        publication.authPolicy !== 'token'
        || !publication.accessTokenHash
        || !publishedServiceTokenAuthenticated(input.request, publication.accessTokenHash)
      )
    ) {
      return authenticationRequired()
    }
    const scope = this.#resolveConnectionScope(publication)
    if (!scope) return unavailable()
    const declaredLength = Number(input.request.headers.get('content-length'))
    if (
      Number.isFinite(declaredLength)
      && declaredLength > 0
      && !this.#bandwidthLimiter.canConsume(scope, declaredLength)
    ) return bandwidthLimitReached()
    const lease = this.#connectionLimiter.tryAcquire(scope)
    if (!lease) return connectionLimitReached()
    try {
      const upstream = await this.#worker.proxyWorkspaceService({
        workspaceId: publication.workspaceId,
        targetPort: publication.targetPort,
        servicePath: input.servicePath,
        request: meteredRequest(input.request, scope, this.#bandwidthLimiter),
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
      return responseWithLease(new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      }), lease, scope, this.#bandwidthLimiter)
    } catch (error) {
      lease.release()
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (error instanceof WorkerClientError) return unavailable()
      return unavailable()
    }
  }
}
