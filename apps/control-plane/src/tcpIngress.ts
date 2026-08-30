import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { connect as connectTLS } from 'node:tls'
import { workerAuthorizationHeader } from './workerAuth'
import {
  PublicationConnectionLimiter,
  type PublicationConnectionLease,
} from './publicationConnectionLimiter'
import { PublicationBandwidthLimiter } from './publicationBandwidthLimiter'

const tunnelHandshakeTimeoutMs = 10_000
const maximumTunnelHeaderBytes = 8 * 1024

export interface TCPIngressRoute {
  routeId: string
  ingressPort: number
  workspaceId: string
  organizationId: string
  workerId: string
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
  connectionLimiter: PublicationConnectionLimiter
  bandwidthLimiter: PublicationBandwidthLimiter
  idleTimeoutMs?: number
}

export class TCPIngress {
  readonly #bindHost: string
  readonly #resolveRoute: TCPIngressOptions['resolveRoute']
  readonly #resolveWorker: TCPIngressOptions['resolveWorker']
  readonly #connectionLimiter: PublicationConnectionLimiter
  readonly #bandwidthLimiter: PublicationBandwidthLimiter
  readonly #idleTimeoutMs: number
  readonly #listeners = new Map<number, Server>()
  readonly #connectionClosersByPort = new Map<number, Set<() => void>>()

  constructor({
    bindHost,
    resolveRoute,
    resolveWorker,
    connectionLimiter,
    bandwidthLimiter,
    idleTimeoutMs = 5 * 60 * 1000,
  }: TCPIngressOptions) {
    if (!bindHost.trim()) throw new Error('TCP ingress bind host is required')
    if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1_000) {
      throw new Error('TCP ingress idle timeout is invalid')
    }
    this.#bindHost = bindHost.trim()
    this.#resolveRoute = resolveRoute
    this.#resolveWorker = resolveWorker
    this.#connectionLimiter = connectionLimiter
    this.#bandwidthLimiter = bandwidthLimiter
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
    const connectionClosers = [...(this.#connectionClosersByPort.get(ingressPort) ?? [])]
    for (const close of connectionClosers) close()
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
    if (!route) {
      client.destroy()
      return
    }
    const lease: PublicationConnectionLease | null = this.#connectionLimiter.tryAcquire({
      workerId: route.workerId,
      organizationId: route.organizationId,
      routeId: route.routeId,
    })
    if (!lease) {
      client.destroy()
      return
    }
    const bandwidthScope = {
      workerId: route.workerId,
      organizationId: route.organizationId,
      routeId: route.routeId,
    }
    let worker: Socket | null = null
    let finished = false
    const routeClosers = this.#connectionClosersByPort.get(ingressPort) ?? new Set<() => void>()
    this.#connectionClosersByPort.set(ingressPort, routeClosers)
    const finish = () => {
      if (finished) return
      finished = true
      routeClosers.delete(finish)
      if (routeClosers.size === 0) this.#connectionClosersByPort.delete(ingressPort)
      lease.release()
      client.destroy()
      worker?.destroy()
    }
    routeClosers.add(finish)
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
      client.on('data', chunk => {
        if (!this.#bandwidthLimiter.tryConsume(bandwidthScope, chunk.byteLength)) finish()
      })
      worker.on('data', chunk => {
        if (!this.#bandwidthLimiter.tryConsume(bandwidthScope, chunk.byteLength)) finish()
      })
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
