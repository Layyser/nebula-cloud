import type { PersonalWorkspace } from '@nebula-cloud/database'

const defaultRows = 24
const defaultColumns = 80
const maximumRows = 500
const maximumColumns = 1000
const maximumPendingBytes = 1024 * 1024

type ConsolePayload = string | ArrayBuffer | Uint8Array

interface BrowserConsoleSocket {
  send(payload: ConsolePayload): number
  close(code?: number, reason?: string): void
}

export interface ConsoleBridgeData {
  upstream: WebSocket
  browser: BrowserConsoleSocket | null
  pending: ConsolePayload[]
  pendingBytes: number
  upstreamClosed: {
    code: number
    reason: string
  } | null
}

export interface ConsoleGatewayOptions {
  workerURL: string
  workerToken: string
  resolveWorkspace: (input: {
    workspaceId: string
    userId: string
    organizationId: string
  }) => PersonalWorkspace | null
  connect?: (
    url: string,
    options: { headers: HeadersInit },
  ) => WebSocket
}

export interface PrepareConsoleInput {
  workspaceId: string
  userId: string
  organizationId: string
  actorId: string
  rows?: string | null
  columns?: string | null
}

function consoleError(
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

function dimension(
  value: string | null | undefined,
  fallback: number,
  maximum: number,
): number | null {
  if (!value) return fallback
  if (!/^\d+$/.test(value)) return null
  const parsed = Number.parseInt(value, 10)
  return parsed >= 1 && parsed <= maximum ? parsed : null
}

function webSocketWorkerURL(
  workerURL: string,
  workspaceId: string,
  rows: number,
  columns: number,
): string {
  const url = new URL(workerURL)
  if (url.protocol === 'http:') url.protocol = 'ws:'
  else if (url.protocol === 'https:') url.protocol = 'wss:'
  else throw new Error('Worker URL must use HTTP or HTTPS')
  url.pathname = `/internal/v1/workspaces/${encodeURIComponent(workspaceId)}/console`
  url.search = new URLSearchParams({
    rows: String(rows),
    columns: String(columns),
  }).toString()
  return url.toString()
}

function payloadSize(payload: ConsolePayload): number {
  return typeof payload === 'string'
    ? new TextEncoder().encode(payload).byteLength
    : payload.byteLength
}

function normalizePayload(payload: unknown): Promise<ConsolePayload | null> {
  if (typeof payload === 'string') return Promise.resolve(payload)
  if (payload instanceof ArrayBuffer) return Promise.resolve(payload)
  if (ArrayBuffer.isView(payload)) {
    return Promise.resolve(new Uint8Array(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    ))
  }
  if (typeof Blob !== 'undefined' && payload instanceof Blob) {
    return payload.arrayBuffer()
  }
  return Promise.resolve(null)
}

function defaultConnect(
  url: string,
  options: { headers: HeadersInit },
): WebSocket {
  const BunWebSocket = WebSocket as unknown as {
    new (
      url: string,
      options: { headers: HeadersInit },
    ): WebSocket
  }
  return new BunWebSocket(url, options)
}

async function connectUpstream(
  connect: NonNullable<ConsoleGatewayOptions['connect']>,
  url: string,
  headers: HeadersInit,
): Promise<WebSocket> {
  const socket = connect(url, { headers })
  socket.binaryType = 'arraybuffer'
  if (socket.readyState === WebSocket.OPEN) return socket

  return await new Promise<WebSocket>((resolve, reject) => {
    const opened = () => {
      cleanup()
      resolve(socket)
    }
    const failed = () => {
      cleanup()
      reject(new Error('worker Console connection failed'))
    }
    const cleanup = () => {
      socket.removeEventListener('open', opened)
      socket.removeEventListener('error', failed)
      socket.removeEventListener('close', failed)
    }
    socket.addEventListener('open', opened, { once: true })
    socket.addEventListener('error', failed, { once: true })
    socket.addEventListener('close', failed, { once: true })
  })
}

export class ConsoleGateway {
  readonly #workerURL: string
  readonly #workerToken: string
  readonly #resolveWorkspace: ConsoleGatewayOptions['resolveWorkspace']
  readonly #connect: NonNullable<ConsoleGatewayOptions['connect']>

  constructor({
    workerURL,
    workerToken,
    resolveWorkspace,
    connect = defaultConnect,
  }: ConsoleGatewayOptions) {
    this.#workerURL = workerURL.replace(/\/$/, '')
    this.#workerToken = workerToken.trim()
    this.#resolveWorkspace = resolveWorkspace
    this.#connect = connect
    if (!this.#workerURL) throw new Error('Worker URL is required')
    if (!this.#workerToken) throw new Error('Worker service token is required')
  }

  async prepare(input: PrepareConsoleInput): Promise<ConsoleBridgeData | Response> {
    const rows = dimension(input.rows, defaultRows, maximumRows)
    const columns = dimension(input.columns, defaultColumns, maximumColumns)
    if (rows === null || columns === null) {
      return consoleError(
        400,
        'invalid_console_size',
        'Console dimensions are invalid',
      )
    }

    const workspace = this.#resolveWorkspace({
      workspaceId: input.workspaceId,
      userId: input.userId,
      organizationId: input.organizationId,
    })
    if (!workspace) {
      return consoleError(404, 'workspace_not_found', 'workspace not found')
    }
    if (workspace.state !== 'ready' || !workspace.workerWorkspaceId) {
      return consoleError(
        409,
        'workspace_not_ready',
        'workspace runtime is not ready',
        true,
      )
    }

    let upstream: WebSocket
    try {
      upstream = await connectUpstream(
        this.#connect,
        webSocketWorkerURL(
          this.#workerURL,
          workspace.workerWorkspaceId,
          rows,
          columns,
        ),
        {
          authorization: `Bearer ${this.#workerToken}`,
          'x-nebula-actor-id': input.actorId.slice(0, 256),
        },
      )
    } catch {
      return consoleError(
        502,
        'console_unavailable',
        'workspace Console could not be opened',
        true,
      )
    }

    const bridge: ConsoleBridgeData = {
      upstream,
      browser: null,
      pending: [],
      pendingBytes: 0,
      upstreamClosed: null,
    }
    upstream.addEventListener('message', event => {
      void normalizePayload(event.data).then(payload => {
        if (payload === null) return
        if (bridge.browser) {
          bridge.browser.send(payload)
          return
        }
        bridge.pendingBytes += payloadSize(payload)
        if (bridge.pendingBytes > maximumPendingBytes) {
          bridge.pending = []
          upstream.close(1013, 'Console output backpressure')
          return
        }
        bridge.pending.push(payload)
      })
    })
    upstream.addEventListener('close', event => {
      bridge.upstreamClosed = {
        code: event.code || 1000,
        reason: event.reason.slice(0, 120),
      }
      bridge.browser?.close(
        bridge.upstreamClosed.code,
        bridge.upstreamClosed.reason,
      )
    })
    upstream.addEventListener('error', () => {
      bridge.browser?.close(1011, 'Console upstream error')
    })
    return bridge
  }
}

export function attachConsoleBrowser(
  bridge: ConsoleBridgeData,
  browser: BrowserConsoleSocket,
): void {
  bridge.browser = browser
  for (const payload of bridge.pending) browser.send(payload)
  bridge.pending = []
  bridge.pendingBytes = 0
  if (bridge.upstreamClosed) {
    browser.close(
      bridge.upstreamClosed.code,
      bridge.upstreamClosed.reason,
    )
  }
}

export function forwardConsoleInput(
  bridge: ConsoleBridgeData,
  payload: ConsolePayload,
): void {
  if (bridge.upstream.readyState !== WebSocket.OPEN) {
    bridge.browser?.close(1011, 'Console upstream unavailable')
    return
  }
  const upstreamPayload = payload instanceof Uint8Array
    ? new Uint8Array(payload).buffer as ArrayBuffer
    : payload
  bridge.upstream.send(upstreamPayload)
}

export function closeConsoleBridge(
  bridge: ConsoleBridgeData,
  code = 1000,
  reason = 'Console closed',
): void {
  bridge.browser = null
  if (
    bridge.upstream.readyState === WebSocket.OPEN
    || bridge.upstream.readyState === WebSocket.CONNECTING
  ) {
    bridge.upstream.close(code, reason.slice(0, 120))
  }
}
