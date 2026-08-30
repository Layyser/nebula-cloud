import { createConnection, createServer, type Socket } from 'node:net'
import { expect, test } from 'bun:test'
import { TCPIngress } from './tcpIngress'
import { PublicationConnectionLimiter } from './publicationConnectionLimiter'
import { PublicationBandwidthLimiter } from './publicationBandwidthLimiter'

function listenPort(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('test server did not expose a TCP port'))
        return
      }
      resolve(address.port)
    })
  })
}

function readUntilHeaders(socket: Socket, callback: (remainder: Buffer) => void): void {
  let buffer = Buffer.alloc(0)
  const onData = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    const boundary = buffer.indexOf('\r\n\r\n')
    if (boundary < 0) return
    socket.removeListener('data', onData)
    callback(buffer.subarray(boundary + 4))
  }
  socket.on('data', onData)
}

test('TCP ingress allocates a port and bridges raw bytes through the Worker tunnel', async () => {
  const worker = createServer(socket => {
    readUntilHeaders(socket, remainder => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (remainder.length > 0) socket.write(remainder)
      socket.on('data', chunk => socket.write(chunk))
    })
  })
  const workerPort = await listenPort(worker)
  const ingressPortServer = createServer()
  const ingressPort = await listenPort(ingressPortServer)
  await new Promise<void>(resolve => ingressPortServer.close(() => resolve()))

  const ingress = new TCPIngress({
    bindHost: '127.0.0.1',
    resolveRoute: port => port === ingressPort
      ? {
          routeId: 'publication-a',
          ingressPort: port,
          workspaceId: 'workspace-a',
          organizationId: 'organization-a',
          workerId: 'worker-a',
          targetPort: 5432,
        }
      : null,
    resolveWorker: workspaceId => ({
      baseURL: `http://127.0.0.1:${workerPort}`,
      token: 'worker-service-secret',
      workspaceId,
    }),
    connectionLimiter: new PublicationConnectionLimiter({
      global: 8,
      perWorker: 8,
      perOrganization: 8,
      perRoute: 8,
    }),
    bandwidthLimiter: new PublicationBandwidthLimiter({
      windowMs: 60_000,
      globalBytes: 1024 * 1024,
      perWorkerBytes: 1024 * 1024,
      perOrganizationBytes: 1024 * 1024,
      perRouteBytes: 1024 * 1024,
    }),
  })
  await ingress.activate(ingressPort)

  try {
    const client = createConnection({ host: '127.0.0.1', port: ingressPort })
    const received = await new Promise<Buffer>((resolve, reject) => {
      client.once('error', reject)
      client.once('connect', () => client.write('native-postgres-wire'))
      client.on('data', data => resolve(Buffer.from(data)))
    })
    expect(received.toString()).toBe('native-postgres-wire')
    const closed = new Promise<void>(resolve => client.once('close', () => resolve()))
    await ingress.deactivate(ingressPort)
    await closed
    expect(ingress.activeListenerPorts).toEqual([])
  } finally {
    await ingress.close()
    await new Promise<void>(resolve => worker.close(() => resolve()))
  }
})
