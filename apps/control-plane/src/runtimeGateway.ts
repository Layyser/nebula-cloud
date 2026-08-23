import type {
  PersonalWorkspace,
  RecordUsageEventInput,
} from '@nebula-cloud/database'
import {
  WorkerClientError,
  type WorkerFetch,
  type WorkerRuntimeAccess,
} from './workerClient'
import { estimateModelUsageCost } from './modelPricing'

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
  recordUsageEvent?: (event: RecordUsageEventInput) => boolean | void
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

function forwardRuntimeBody(
  body: ReadableStream<Uint8Array>,
  abortUpstream: (reason?: unknown) => void,
  cleanup: () => void,
  onComplete?: () => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  const decoder = onComplete ? new TextDecoder() : null
  let completionTail = ''
  let completionPromise: Promise<void> | null = null
  let finished = false
  const complete = () => {
    if (!onComplete) return Promise.resolve()
    if (!completionPromise) {
      completionPromise = onComplete().catch(() => {
        // Usage reporting must never corrupt an otherwise successful Runtime
        // stream. A later sync will replay the stable event IDs.
      })
    }
    return completionPromise
  }
  const finish = () => {
    if (finished) return
    finished = true
    cleanup()
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) {
          await complete()
          finish()
          controller.close()
          return
        }
        if (decoder && !completionPromise) {
          completionTail = (
            completionTail + decoder.decode(chunk.value, { stream: true })
          ).slice(-128)
          // The browser transport intentionally cancels its reader as soon as
          // this terminal SSE event arrives, before the upstream body reaches
          // EOF. Start reconciliation before exposing that chunk downstream.
          if (completionTail.includes('data: [DONE]')) void complete()
        }
        controller.enqueue(chunk.value)
      } catch (error) {
        finish()
        controller.error(error)
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } finally {
        abortUpstream(reason)
        finish()
      }
    },
  })
}

interface RuntimeUsageEntry {
  event_id?: unknown
  purpose?: unknown
  status?: unknown
  created_at?: unknown
  message_count?: unknown
  usage?: unknown
}

interface RuntimeSessionUsage {
  provider?: unknown
  model?: unknown
  agent?: unknown
  llm_request_log?: unknown
}

interface RuntimeChatList {
  chats?: unknown
}

function usageInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0
}

function usageValue(usage: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = usageInteger(usage[key])
    if (value > 0 || usage[key] === 0) return value
  }
  return 0
}

function cachedUsageValue(usage: Record<string, unknown>): number {
  for (const key of ['prompt_tokens_details', 'input_tokens_details']) {
    const details = usage[key]
    if (details && typeof details === 'object') {
      return usageInteger((details as Record<string, unknown>).cached_tokens)
    }
  }
  return usageInteger(usage.cached_tokens)
}

function reasoningUsageValue(usage: Record<string, unknown>): number {
  for (const key of ['completion_tokens_details', 'output_tokens_details']) {
    const details = usage[key]
    if (details && typeof details === 'object') {
      return usageInteger((details as Record<string, unknown>).reasoning_tokens)
    }
  }
  return usageInteger(usage.reasoning_tokens)
}

function cacheSavingsMicrousd(
  usage: Record<string, unknown>,
  fallback: number,
): number {
  const direct = usageInteger(usage.cache_savings_microusd)
  if (direct > 0) return direct
  const value = usage.cache_savings_usd
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value * 1_000_000)
    : fallback
}

function estimatedCostMicrousd(
  usage: Record<string, unknown>,
  fallback: number,
): number {
  const direct = usageInteger(usage.estimated_cost_microusd)
  if (direct > 0) return direct
  for (const key of ['cost_usd', 'total_cost_usd']) {
    const value = usage[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.round(value * 1_000_000)
    }
  }
  return fallback
}

function completedChatName(method: string, runtimePath: string): string | null {
  if (method !== 'POST') return null
  const match = runtimePath.match(/^\/chat\/([^/]+)$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function usageEventId(input: {
  workspaceId: string
  chatName: string
  entry: RuntimeUsageEntry
  index: number
}): string {
  if (typeof input.entry.event_id === 'string' && input.entry.event_id.trim()) {
    return input.entry.event_id
  }

  // Runtimes released before usage event IDs were added still persist a
  // stable, append-only request log. Keep those deployments observable while
  // preserving idempotency across repeated dashboard synchronizations.
  const createdAt = usageInteger(input.entry.created_at)
  const purpose = typeof input.entry.purpose === 'string'
    ? input.entry.purpose
    : 'unknown'
  const messageCount = usageInteger(input.entry.message_count)
  return [
    'legacy-runtime-usage',
    input.workspaceId,
    encodeURIComponent(input.chatName),
    createdAt,
    encodeURIComponent(purpose),
    messageCount,
    input.index,
  ].join(':')
}

export class RuntimeGateway {
  readonly #worker: RuntimeAccessProvider
  readonly #resolveWorkspace: RuntimeGatewayOptions['resolveWorkspace']
  readonly #fetch: WorkerFetch
  readonly #recordUsageEvent?: RuntimeGatewayOptions['recordUsageEvent']

  constructor({
    worker,
    resolveWorkspace,
    fetch = (input, init) => globalThis.fetch(input, init),
    recordUsageEvent,
  }: RuntimeGatewayOptions) {
    this.#worker = worker
    this.#resolveWorkspace = resolveWorkspace
    this.#fetch = fetch
    this.#recordUsageEvent = recordUsageEvent
  }

  async #syncChatUsage(input: {
    access: WorkerRuntimeAccess
    workspace: PersonalWorkspace
    chatName: string
    displayName?: string
  }): Promise<void> {
    if (!this.#recordUsageEvent) return
    const target = privateRuntimeURL(
      input.access,
      `/chat/${encodeURIComponent(input.chatName)}/session`,
      '',
    )
    const response = await this.#fetch(target, {
      headers: { authorization: `Bearer ${input.access.accessToken}` },
      redirect: 'manual',
    })
    if (!response.ok) return
    const state = await response.json() as RuntimeSessionUsage
    if (!Array.isArray(state.llm_request_log)) return
    const provider = typeof state.provider === 'string' && state.provider.trim()
      ? state.provider
      : 'unknown'
    const model = typeof state.model === 'string' && state.model.trim()
      ? state.model
      : 'unknown'
    const agentId = typeof state.agent === 'string' && state.agent.trim()
      ? state.agent
      : null

    for (const [index, rawEntry] of state.llm_request_log.entries()) {
      if (!rawEntry || typeof rawEntry !== 'object') continue
      const entry = rawEntry as RuntimeUsageEntry
      if (!entry.usage || typeof entry.usage !== 'object') continue
      const usage = entry.usage as Record<string, unknown>
      const createdAtSeconds = usageInteger(entry.created_at)
      const status = typeof entry.status === 'string' ? entry.status : 'error'
      const inputTokens = usageValue(usage, 'prompt_tokens', 'input_tokens')
      const outputTokens = usageValue(usage, 'completion_tokens', 'output_tokens')
      const cachedTokens = cachedUsageValue(usage)
      const estimated = estimateModelUsageCost({
        provider,
        model,
        inputTokens,
        outputTokens,
        cachedTokens,
      })
      this.#recordUsageEvent({
        eventId: usageEventId({
          workspaceId: input.workspace.id,
          chatName: input.chatName,
          entry,
          index,
        }),
        organizationId: input.workspace.organizationId,
        membershipId: input.workspace.memberId,
        workspaceId: input.workspace.id,
        sessionId: input.chatName,
        ...(input.displayName ? { sessionDisplayName: input.displayName } : {}),
        agentId,
        provider,
        model,
        inputTokens,
        outputTokens,
        cachedTokens,
        reasoningTokens: reasoningUsageValue(usage),
        estimatedCostMicrousd: estimatedCostMicrousd(
          usage,
          estimated.estimatedCostMicrousd,
        ),
        cacheSavingsMicrousd: cacheSavingsMicrousd(
          usage,
          estimated.cacheSavingsMicrousd,
        ),
        outcome: status === 'success'
          ? 'success'
          : status === 'cancelled' ? 'cancelled' : 'error',
        occurredAt: createdAtSeconds > 0 ? createdAtSeconds * 1000 : Date.now(),
      })
    }
  }

  async reconcileWorkspaceUsage(input: {
    workspaceId: string
    userId: string
    organizationId: string
  }): Promise<void> {
    const workspace = this.#resolveWorkspace(input)
    if (
      !workspace
      || workspace.state !== 'ready'
      || !workspace.workerWorkspaceId
      || !this.#recordUsageEvent
    ) return

    const access = await this.#worker.getRuntimeAccess({
      workspaceId: workspace.id,
    })
    const response = await this.#fetch(
      privateRuntimeURL(access, '/chats', ''),
      {
        headers: { authorization: `Bearer ${access.accessToken}` },
        redirect: 'manual',
      },
    )
    if (!response.ok) return
    const payload = await response.json() as RuntimeChatList
    if (!Array.isArray(payload.chats)) return

    const chats = payload.chats.flatMap(chat => {
      if (!chat || typeof chat !== 'object') return []
      const { name, display_name: displayName } = chat as {
        name?: unknown
        display_name?: unknown
      }
      return typeof name === 'string' && name.trim()
        ? [{
            name,
            displayName: typeof displayName === 'string' && displayName.trim()
              ? displayName
              : undefined,
          }]
        : []
    })
    await Promise.all(chats.map(chat => this.#syncChatUsage({
      access,
      workspace,
      chatName: chat.name,
      displayName: chat.displayName,
    })))
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

    const upstreamController = new AbortController()
    const abortUpstream = () => {
      if (!upstreamController.signal.aborted) {
        upstreamController.abort(request.signal.reason)
      }
    }
    request.signal.addEventListener('abort', abortUpstream, { once: true })
    const cleanup = () => {
      request.signal.removeEventListener('abort', abortUpstream)
    }
    if (request.signal.aborted) abortUpstream()

    let access: WorkerRuntimeAccess
    try {
      access = await this.#worker.getRuntimeAccess({
        workspaceId: workspace.id,
        signal: upstreamController.signal,
      })
    } catch (error) {
      cleanup()
      if (upstreamController.signal.aborted) {
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
      cleanup()
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
        signal: upstreamController.signal,
      })
    } catch {
      cleanup()
      if (upstreamController.signal.aborted) {
        return gatewayError(499, 'client_closed_request', 'request was cancelled')
      }
      return gatewayError(
        502,
        'runtime_unreachable',
        'workspace runtime could not be reached',
        true,
      )
    }

    const body = upstream.body
      ? forwardRuntimeBody(
          upstream.body,
          reason => {
            if (!upstreamController.signal.aborted) {
              upstreamController.abort(reason)
            }
          },
          cleanup,
          (() => {
            const chatName = upstream.ok
              ? completedChatName(request.method, runtimePath)
              : null
            return chatName
              ? () => this.#syncChatUsage({ access, workspace, chatName })
              : undefined
          })(),
        )
      : null
    if (!body) cleanup()

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: browserResponseHeaders(upstream),
    })
  }
}
