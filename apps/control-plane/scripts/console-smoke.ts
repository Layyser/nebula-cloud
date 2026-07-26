const baseURL = process.env.NEBULA_CONSOLE_SMOKE_BASE_URL?.trim()
  || 'http://127.0.0.1:7790'
const origin = process.env.NEBULA_CONSOLE_SMOKE_ORIGIN?.trim()
  || 'http://127.0.0.1:5173'
const email = process.env.NEBULA_BOOTSTRAP_EMAIL?.trim() || ''
const password = process.env.NEBULA_BOOTSTRAP_PASSWORD || ''
let organizationId = process.env.NEBULA_CONSOLE_SMOKE_ORGANIZATION_ID?.trim() || ''
let workspaceId = process.env.NEBULA_CONSOLE_SMOKE_WORKSPACE_ID?.trim() || ''

if (!email || !password) {
  throw new Error(
    'NEBULA_BOOTSTRAP_EMAIL and NEBULA_BOOTSTRAP_PASSWORD are required',
  )
}

const cookies = new Map<string, string>()
function collectCookies(response: Response) {
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator > 0) {
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
    }
  }
}
function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

const signIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: {
    origin,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ email, password }),
})
if (!signIn.ok) throw new Error(`Sign-in failed (${signIn.status})`)
collectCookies(signIn)

if (!organizationId) {
  const organizations = await fetch(
    `${baseURL}/api/auth/organization/list`,
    {
      headers: {
        origin,
        cookie: cookieHeader(),
      },
    },
  )
  if (!organizations.ok) {
    throw new Error(`Organization lookup failed (${organizations.status})`)
  }
  const payload = await organizations.json() as Array<{ id?: string }>
  organizationId = payload.find(item => item.id)?.id || ''
  if (!organizationId) throw new Error('No organization is available')
}

const activate = await fetch(`${baseURL}/api/auth/organization/set-active`, {
  method: 'POST',
  headers: {
    origin,
    cookie: cookieHeader(),
    'content-type': 'application/json',
  },
  body: JSON.stringify({ organizationId }),
})
if (!activate.ok) {
  throw new Error(`Organization activation failed (${activate.status})`)
}
collectCookies(activate)

if (!workspaceId) {
  const workspace = await fetch(`${baseURL}/api/workspaces/personal`, {
    method: 'POST',
    headers: {
      origin,
      cookie: cookieHeader(),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId }),
  })
  if (!workspace.ok) {
    throw new Error(`Workspace lookup failed (${workspace.status})`)
  }
  const payload = await workspace.json() as {
    workspace?: { id?: string }
  }
  workspaceId = payload.workspace?.id || ''
  if (!workspaceId) throw new Error('Personal workspace is unavailable')
}

const consoleURL = new URL(
  `/api/workspaces/${encodeURIComponent(workspaceId)}/console`,
  baseURL,
)
consoleURL.protocol = consoleURL.protocol === 'https:' ? 'wss:' : 'ws:'
consoleURL.searchParams.set('rows', '30')
consoleURL.searchParams.set('columns', '100')

const BunWebSocket = WebSocket as unknown as {
  new (
    url: string,
    options: { headers: HeadersInit },
  ): WebSocket
}
const socket = new BunWebSocket(consoleURL.toString(), {
  headers: {
    origin,
    cookie: cookieHeader(),
  },
})
socket.binaryType = 'arraybuffer'

let output = ''
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    socket.close(1000, 'Smoke test timeout')
    reject(new Error(
      `Console smoke test timed out after receiving ${output.length} bytes`,
    ))
  }, 10000)

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({
      type: 'resize',
      rows: 32,
      columns: 110,
    }))
    socket.send(new TextEncoder().encode(
      "printf 'NEBULA_CONSOLE_OK\\n'; pwd\r",
    ))
  })
  socket.addEventListener('message', event => {
    void (async () => {
      const payload = event.data instanceof Blob
        ? await event.data.arrayBuffer()
        : event.data
      const chunk = typeof payload === 'string'
        ? payload
        : new TextDecoder().decode(
            payload instanceof ArrayBuffer
              ? new Uint8Array(payload)
              : ArrayBuffer.isView(payload)
                ? new Uint8Array(
                    payload.buffer,
                    payload.byteOffset,
                    payload.byteLength,
                  )
                : new Uint8Array(),
          )
    output += chunk
    if (
      output.includes('NEBULA_CONSOLE_OK')
      && output.includes('/home/nebula/workspace')
    ) {
      clearTimeout(timeout)
      socket.close(1000, 'Smoke test complete')
      resolve()
    }
    })()
  })
  socket.addEventListener('error', () => {
    clearTimeout(timeout)
    reject(new Error('Console WebSocket failed'))
  })
  socket.addEventListener('close', event => {
    if (
      !output.includes('NEBULA_CONSOLE_OK')
      || !output.includes('/home/nebula/workspace')
    ) {
      clearTimeout(timeout)
      reject(new Error(
        `Console closed before proof (${event.code} ${event.reason})`,
      ))
    }
  })
})

console.log(JSON.stringify({
  status: 'ok',
  marker: output.includes('NEBULA_CONSOLE_OK'),
  workingDirectory: '/home/nebula/workspace',
}))
