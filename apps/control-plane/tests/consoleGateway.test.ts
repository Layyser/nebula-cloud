import { expect, test } from 'bun:test'
import type { PersonalWorkspace } from '@nebula-cloud/database'
import {
  attachConsoleBrowser,
  closeConsoleBridge,
  ConsoleGateway,
  forwardConsoleInput,
} from '../src/consoleGateway'

class FakeWebSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING
  binaryType: BinaryType = 'blob'
  sent: unknown[] = []
  closed: { code?: number; reason?: string } | null = null

  open() {
    this.readyState = WebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  send(payload: unknown) {
    this.sent.push(payload)
  }

  close(code?: number, reason?: string) {
    this.closed = { code, reason }
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new CloseEvent('close', { code, reason }))
  }

  message(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

function readyWorkspace(): PersonalWorkspace {
  return {
    id: 'workspace-1',
    memberId: 'member-1',
    organizationId: 'org-1',
    workerWorkspaceId: 'worker-workspace-1',
    state: 'ready',
    createdAt: 1,
    updatedAt: 2,
  }
}

test('rejects a weak Console worker signing secret', () => {
  expect(() => new ConsoleGateway({
    workerURL: 'http://worker.test:7780',
    workerToken: 'too-short',
    resolveWorkspace: () => readyWorkspace(),
  })).toThrow('at least 32 characters')
})

test('opens the worker Console with private authentication and bridges bytes', async () => {
  const upstream = new FakeWebSocket()
  let connection: {
    url: string
    options: { headers: HeadersInit }
  } | null = null
  const gateway = new ConsoleGateway({
    workerURL: 'http://worker.test:7780',
    workerToken: 'worker-service-token-0123456789abcdef',
    resolveWorkspace: () => readyWorkspace(),
    now: () => Date.UTC(2026, 6, 29, 12, 0, 0),
    nonce: () => '0123456789abcdef',
    connect: (url, options) => {
      connection = { url, options }
      queueMicrotask(() => upstream.open())
      return upstream as unknown as WebSocket
    },
  })

  const prepared = await gateway.prepare({
    workspaceId: 'workspace-1',
    userId: 'user-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    rows: '42',
    columns: '132',
  })
  expect(prepared).not.toBeInstanceOf(Response)
  if (prepared instanceof Response) throw new Error('Console was not prepared')

  expect(connection).not.toBeNull()
  const connectedURL = new URL(connection!.url)
  expect(connectedURL.protocol).toBe('ws:')
  expect(connectedURL.pathname).toBe(
    '/internal/v1/workspaces/worker-workspace-1/console',
  )
  expect(connectedURL.searchParams.get('rows')).toBe('42')
  expect(connectedURL.searchParams.get('columns')).toBe('132')
  expect(new Headers(connection!.options.headers).get('authorization')).toStartWith(
    'Nebula-HMAC v1.',
  )
  expect(new Headers(connection!.options.headers).get('x-nebula-actor-id')).toBe(
    'user-1',
  )

  const browserMessages: unknown[] = []
  const browser = {
    send(payload: unknown) {
      browserMessages.push(payload)
      return 1
    },
    close() {},
  }
  attachConsoleBrowser(prepared, browser)
  upstream.message(new Uint8Array([110, 101, 98, 117, 108, 97]))
  await Promise.resolve()
  expect(browserMessages).toHaveLength(1)

  forwardConsoleInput(prepared, new Uint8Array([108, 115, 10]))
  forwardConsoleInput(prepared, '{"type":"resize","rows":30,"columns":100}')
  expect(upstream.sent).toHaveLength(2)
  expect(upstream.sent[1]).toBe(
    '{"type":"resize","rows":30,"columns":100}',
  )

  closeConsoleBridge(prepared)
  expect(upstream.closed?.code).toBe(1000)
})

test('rejects foreign workspaces and invalid dimensions before connecting', async () => {
  let connections = 0
  const gateway = new ConsoleGateway({
    workerURL: 'http://worker.test:7780',
    workerToken: 'worker-service-token-0123456789abcdef',
    resolveWorkspace: () => null,
    connect: () => {
      connections += 1
      return new FakeWebSocket() as unknown as WebSocket
    },
  })

  const foreign = await gateway.prepare({
    workspaceId: 'workspace-foreign',
    userId: 'user-1',
    organizationId: 'org-1',
    actorId: 'user-1',
  })
  expect(foreign).toBeInstanceOf(Response)
  expect((foreign as Response).status).toBe(404)

  const invalid = await gateway.prepare({
    workspaceId: 'workspace-1',
    userId: 'user-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    rows: '0',
    columns: '1001',
  })
  expect(invalid).toBeInstanceOf(Response)
  expect((invalid as Response).status).toBe(400)
  expect(connections).toBe(0)
})
