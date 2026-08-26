import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { connect as connectTLS } from 'node:tls'
import { workerAuthorizationHeader } from './workerAuth'

const tunnelHandshakeTimeoutMs = 10_000
const maximumTunnelHeaderBytes = 8 * 1024

export interface TCPIngressRoute {
  ingressPort: number
  workspaceId: string
  targetPort: number
}

export interface TCPIngressWorkerConnection {
  baseURL: string
  token: string
  workspaceId: string
}

export interface TCPIngressOptions {
  bindHost: string
  resolveRoute: (ingressPort: number) => TCPIngressRoute | null
  resolveWorker: (workspaceId: string) => TCPIngressWorkerConnection
  maxConnectionsPerRoute?: number
  maxConnections?: number
  idleTimeoutMs?: number
}

export class TCPIngress {
  readonly #bindHost: string
  readonly #resolveRoute: TCPIngressOptions['resolveRoute']
  readonly #resolveWorker: TCPIngressOptions['resolveWorker']
  readonly #maxConnectionsPerRoute: number
  readonly #maxConnections: number
  readonly #idleTimeoutMs: number
  readonly #listeners = new Map<number, Server>()
  readonly #connectionsByPort = new Map<number, number>()
  #connections = 0

  constructor({
    bindHost,
    resolveRoute,
    resolveWorker,
    maxConnectionsPerRoute = 32,
    maxConnections = 256,
    idleTimeoutMs = 5 * 60 * 1000,
  }: TCPIngressOptions) {
    if (!bindHost.trim()) throw new Error('TCP ingress bind host is required')
    if (!Number.isSafeInteger(maxConnectionsPerRoute) || maxConnectionsPerRoute < 1) {
      throw new Error('TCP ingress per-route connection limit is invalid')
    }
    if (!Number.isSafeInteger(maxConnections) || maxConnections < maxConnectionsPerRoute) {
      throw new Error('TCP ingress connection limit is invalid')
    }
    if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1_000) {
      throw new Error('TCP ingress idle timeout is invalid')
    }
    this.#bindHost = bindHost.trim()
    this.#resolveRoute = resolveRoute
    this.#resolveWorker = resolveWorker
    this.#maxConnectionsPerRoute = maxConnectionsPerRoute
    this.#maxConnections = maxConnections
    this.#idleTimeoutMs = idleTimeoutMs
  }

  async activate(ingressPort: number): Promise<void> {
    if (this.#listeners.has(ingressPort)) return
    const listener = createServer({ pauseOnConnect: true }, socket => {
      void this.#handle(socket)
    })
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        listener.removeListener('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        listener.removeListener('error', onError)
        resolve()
      }
      listener.once('error', onError)
      listener.once('listening', onListening)
      listener.listen(ingressPort, this.#bindHost)
    }).catch(error => {
      listener.close()
      throw error
    })
    this.#listeners.set(ingressPort, listener)
  }

  async deactivate(ingressPort: number): Promise<void> {
    const listener = this.#listeners.get(ingressPort)
    if (!listener) return
    this.#listeners.delete(ingressPort)
    await new Promise<void>(resolve => listener.close(() => resolve()))
  }

  async close(): Promise<void> {
    await Promise.all([...this.#listeners.keys()].map(port => this.deactivate(port)))
  }

  get activeListenerPorts(): number[] {
    return [...this.#listeners.keys()].sort((left, right) => left - right)
  }

  async #handle(client: Socket): Promise<void> {
    const ingressPort = client.localPort
    if (ingressPort === undefined) {
      client.destroy()
      return
    }
    const route = this.#resolveRoute(ingressPort)
    const routeConnections = this.#connectionsByPort.get(ingressPort) ?? 0
    if (
      !route
      || this.#connections >= this.#maxConnections
      || routeConnections >= this.#maxConnectionsPerRoute
    ) {
      client.destroy()
      return
    }
    this.#connections += 1
    this.#connectionsByPort.set(ingressPort, routeConnections + 1)
    let worker: Socket | null = null
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      this.#connections -= 1
      const remaining = (this.#connectionsByPort.get(ingressPort) ?? 1) - 1
      if (remaining > 0) this.#connectionsByPort.set(ingressPort, remaining)
      else this.#connectionsByPort.delete(ingressPort)
      client.destroy()
      worker?.destroy()
    }
    client.setTimeout(this.#idleTimeoutMs, finish)
    try {
      worker = await openWorkerTCPTunnel({
        connection: this.#resolveWorker(route.workspaceId),
        workspaceId: route.workspaceId,
        targetPort: route.targetPort,
      })
      if (finished) return
      worker.setTimeout(this.#idleTimeoutMs, finish)
      client.on('error', finish)
      worker.on('error', finish)
      client.on('close', finish)
      worker.on('close', finish)
      client.pipe(worker)
      worker.pipe(client)
      client.resume()
    } catch {
      finish()
    }
  }
}

export async function openWorkerTCPTunnel({
  connection,
  workspaceId,
  targetPort,
  now = Date.now,
  nonce,
}: {
  connection: TCPIngressWorkerConnection
  workspaceId: string
  targetPort: number
  now?: () => number
  nonce?: () => string
}): Promise<Socket> {
  const baseURL = new URL(connection.baseURL)
  if (baseURL.protocol !== 'http:' && baseURL.protocol !== 'https:') {
    throw new Error('Worker TCP bridge requires an HTTP(S) Worker URL')
  }
  const path = `/internal/v1/workspaces/${encodeURIComponent(workspaceId)}/tcp/${targetPort}`
  const authorization = workerAuthorizationHeader({
    secret: connection.token,
    method: 'CONNECT',
    path,
    now,
    nonce,
  })
  const port = Number(baseURL.port || (baseURL.protocol === 'https:' ? 443 : 80))
  const socket = baseURL.protocol === 'https:'
    ? connectTLS({ host: baseURL.hostname, port, servername: baseURL.hostname })
    : createConnection({ host: baseURL.hostname, port })
  return await readTunnelHandshake(socket, {
    host: baseURL.host,
    path,
    authorization,
  })
}

async function readTunnelHandshake(
  socket: Socket,
  request: { host: string; path: string; authorization: string },
): Promise<Socket> {
  return await new Promise<Socket>((resolve, reject) => {
    let settled = false
    let buffer = Buffer.alloc(0)
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(error)
    }
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length > maximumTunnelHeaderBytes) {
        fail(new Error('Worker TCP bridge response headers are too large'))
        return
      }
      const boundary = buffer.indexOf('\r\n\r\n')
      if (boundary < 0) return
      const header = buffer.subarray(0, boundary).toString('latin1')
      const statusLine = header.split('\r\n', 1)[0] ?? ''
      if (!/^HTTP\/1\.1 200(?: |$)/.test(statusLine)) {
        fail(new Error(`Worker TCP bridge rejected connection: ${statusLine}`))
        return
      }
      settled = true
      socket.removeListener('data', onData)
      socket.removeListener('error', fail)
      socket.setTimeout(0)
      const remainder = buffer.subarray(boundary + 4)
      if (remainder.length > 0) socket.unshift(remainder)
      socket.pause()
      resolve(socket)
    }
    socket.setTimeout(tunnelHandshakeTimeoutMs, () => fail(new Error('Worker TCP bridge handshake timed out')))
    socket.once('error', fail)
    socket.on('data', onData)
    socket.once('connect', () => {
      socket.write(
        `CONNECT ${request.path} HTTP/1.1\r\n`
        + `Host: ${request.host}\r\n`
        + `Authorization: ${request.authorization}\r\n`
        + 'X-Nebula-Actor-ID: nebula-cloud-tcp-ingress\r\n'
        + 'Connection: keep-alive\r\n\r\n',
      )
    })
  })
}
