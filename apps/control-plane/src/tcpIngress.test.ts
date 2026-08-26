import { createConnection, createServer, type Socket } from 'node:net'
import { expect, test } from 'bun:test'
import { TCPIngress } from './tcpIngress'

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
      ? { ingressPort: port, workspaceId: 'workspace-a', targetPort: 5432 }
      : null,
    resolveWorker: workspaceId => ({
      baseURL: `http://127.0.0.1:${workerPort}`,
      token: 'worker-service-secret',
      workspaceId,
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
    client.destroy()
    expect(received.toString()).toBe('native-postgres-wire')
  } finally {
    await ingress.close()
    await new Promise<void>(resolve => worker.close(() => resolve()))
  }
})
