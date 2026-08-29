import { connect } from 'node:net'
import { openCloudDatabase, recordUsageEvent } from '@nebula-cloud/database'
import { NebulaWorkerClient } from '../src/workerClient'

const baseURL = requiredEnvironment('NEBULA_DEMO_BASE_URL')
const webURL = requiredEnvironment('NEBULA_DEMO_WEB_URL')
const origin = new URL(webURL).origin
const databasePath = requiredEnvironment('NEBULA_CLOUD_DATABASE_PATH')
const workerURL = requiredEnvironment('NEBULA_WORKER_URL')
const workerToken = requiredEnvironment('NEBULA_WORKER_TOKEN')
const workspaceImage = requiredEnvironment('NEBULA_WORKSPACE_IMAGE')
const platformToken = requiredEnvironment('NEBULA_PLATFORM_ADMIN_TOKEN')
const runId = process.env.NEBULA_DEMO_RUN_ID?.trim() || String(Date.now())
const password = `Demo-${runId}-password!`
const ownerEmail = `owner-${runId}@demo.nubols.test`
const memberEmail = `member-${runId}@demo.nubols.test`

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

class CookieJar {
  readonly cookies = new Map<string, string>()

  collect(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';', 1)[0]!
      const separator = pair.indexOf('=')
      if (separator > 0) {
        this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
      }
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}

async function request(
  path: string,
  options: {
    method?: string
    body?: unknown
    jar?: CookieJar
    authorization?: string
  } = {},
): Promise<Response> {
  const headers = new Headers({ origin })
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (options.jar?.header()) headers.set('cookie', options.jar.header())
  if (options.authorization) headers.set('authorization', options.authorization)
  const response = await fetch(new URL(path, baseURL), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  options.jar?.collect(response)
  return response
}

async function json<T>(response: Response, expectedStatus = 200): Promise<T> {
  const text = await response.text()
  if (response.status !== expectedStatus) {
    throw new Error(`Request failed (${response.status}, expected ${expectedStatus}): ${text}`)
  }
  return text ? JSON.parse(text) as T : {} as T
}

async function waitFor(
  description: string,
  check: () => Promise<boolean>,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch (error) {
      lastError = error
    }
    await Bun.sleep(500)
  }
  throw new Error(`Timed out waiting for ${description}${lastError instanceof Error ? `: ${lastError.message}` : ''}`)
}

async function runConsoleCommand(
  workspaceId: string,
  jar: CookieJar,
  command: string,
  timeoutMs = 20_000,
): Promise<string> {
  const marker = `NEBULA_DEMO_COMMAND_${crypto.randomUUID().replaceAll('-', '')}`
  const consoleURL = new URL(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/console/demo-smoke`,
    baseURL,
  )
  consoleURL.protocol = consoleURL.protocol === 'https:' ? 'wss:' : 'ws:'
  consoleURL.searchParams.set('rows', '32')
  consoleURL.searchParams.set('columns', '120')
  const BunWebSocket = WebSocket as unknown as {
    new (url: string, options: { headers: HeadersInit }): WebSocket
  }
  const socket = new BunWebSocket(consoleURL.toString(), {
    headers: { origin, cookie: jar.header() },
  })
  socket.binaryType = 'arraybuffer'
  let output = ''
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close(1000, 'Command timeout')
      reject(new Error(`Console command timed out: ${output.slice(-1000)}`))
    }, timeoutMs)
    socket.addEventListener('open', () => {
      socket.send(new TextEncoder().encode(`${command}; printf '\\n${marker}:%s\\n' "$?"\r`))
    })
    socket.addEventListener('message', event => {
      void (async () => {
        const payload = event.data instanceof Blob
          ? await event.data.arrayBuffer()
          : event.data
        output += typeof payload === 'string'
          ? payload
          : new TextDecoder().decode(
              payload instanceof ArrayBuffer
                ? new Uint8Array(payload)
                : ArrayBuffer.isView(payload)
                  ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
                  : new Uint8Array(),
            )
        const match = output.match(new RegExp(`${marker}:(\\d+)`))
        if (!match) return
        clearTimeout(timeout)
        socket.close(1000, 'Command complete')
        if (match[1] !== '0') {
          reject(new Error(`Console command exited ${match[1]}: ${output.slice(-2000)}`))
        } else {
          resolve()
        }
      })()
    })
    socket.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error('Console WebSocket failed'))
    })
    socket.addEventListener('close', event => {
      if (!output.includes(marker)) {
        clearTimeout(timeout)
        reject(new Error(`Console closed before command completed (${event.code} ${event.reason})`))
      }
    })
  })
  return output.replace(new RegExp(`${marker}:0`), '')
}

async function tcpRead(host: string, port: number, timeoutMs = 5_000): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const socket = connect({ host, port })
    let output = ''
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error(`TCP route ${host}:${port} timed out`))
    }, timeoutMs)
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      output += chunk
      if (output.includes('\n')) socket.end()
    })
    socket.on('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    socket.on('close', () => {
      clearTimeout(timeout)
      resolve(output)
    })
  })
}

await json(await request('/health/ready'))
await json(await fetch(new URL('/health/ready', workerURL)))

const owner = new CookieJar()
await json(await request('/api/auth/sign-up/email', {
  method: 'POST', jar: owner,
  body: { name: 'Demo Owner', email: ownerEmail, password },
}))
const organization = await json<{ id: string }>(await request('/api/auth/organization/create', {
  method: 'POST', jar: owner,
  body: { name: 'Nubols Demo Company', slug: `nubols-demo-${runId}` },
}))
await json(await request('/api/auth/organization/set-active', {
  method: 'POST', jar: owner, body: { organizationId: organization.id },
}))

const joinCode = await json<{ joinCode: string }>(await request(
  `/api/organizations/${encodeURIComponent(organization.id)}/admin/join-code`,
  { method: 'POST', jar: owner },
))
const member = new CookieJar()
await json(await request('/api/auth/sign-up/email', {
  method: 'POST', jar: member,
  body: { name: 'Demo Engineer', email: memberEmail, password },
}))
await json(await request('/api/organizations/join', {
  method: 'POST', jar: member, body: { code: joinCode.joinCode },
}))
await json(await request('/api/auth/organization/set-active', {
  method: 'POST', jar: member, body: { organizationId: organization.id },
}))

const members = await json<{
  actorRole: string
  members: Array<{ membershipId: string; email: string; role: string }>
}>(await request(`/api/organizations/${encodeURIComponent(organization.id)}/members`, { jar: owner }))
if (members.actorRole !== 'owner' || members.members.length !== 2) {
  throw new Error(`Expected one owner and one joined member, got ${JSON.stringify(members)}`)
}
const ownerMembership = members.members.find(item => item.email === ownerEmail)
if (!ownerMembership || ownerMembership.role !== 'owner') {
  throw new Error('Demo owner membership was not found')
}

await json(await request('/api/workspaces/personal/ensure-running', {
  method: 'POST', jar: owner, body: { organizationId: organization.id },
}), 403)
const now = Date.now()
await json(await request(
  `/internal/v1/entitlements/operator/${encodeURIComponent(ownerMembership.membershipId)}`,
  {
    method: 'PUT',
    authorization: `Bearer ${platformToken}`,
    body: {
      organizationId: organization.id,
      state: 'active',
      source: 'beta',
      startsAt: now,
      endsAt: now + 14 * 24 * 60 * 60 * 1000,
    },
  },
))
const scheduled = await json<{ workspace: { id: string } }>(await request(
  '/api/workspaces/personal/ensure-running',
  { method: 'POST', jar: owner, body: { organizationId: organization.id } },
))
const workspaceId = scheduled.workspace.id

await waitFor('workspace readiness', async () => {
  const response = await request(`/api/workspaces/${encodeURIComponent(workspaceId)}/operator`, { jar: owner })
  if (!response.ok) return false
  return (await response.json() as { state?: string }).state === 'ready'
})
await json(await request(
  `/api/workspaces/${encodeURIComponent(workspaceId)}/runtime/health/ready`,
  { jar: owner },
))
const worker = new NebulaWorkerClient({
  baseURL: workerURL,
  token: workerToken,
  workspaceImage,
})
const runtimeAccess = await worker.getRuntimeAccess({ workspaceId })
const networkInspection = Bun.spawnSync([
  'docker', 'network', 'inspect', runtimeAccess.network,
  '--format', '{{(index .IPAM.Config 0).Gateway}}',
])
if (networkInspection.exitCode !== 0) {
  throw new Error(`Could not inspect the demo workspace network: ${networkInspection.stderr.toString()}`)
}
const dockerHostGateway = networkInspection.stdout.toString().trim()
if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(dockerHostGateway)) {
  throw new Error(`Docker returned an invalid workspace gateway: ${dockerHostGateway}`)
}
const nubols = `NUBOLS_CONTROL_URL=http://${dockerHostGateway}:7791 NUBOLS_WORKSPACE_ID=${workspaceId} nubols`
const chats = await json<{ chats?: unknown[] }>(await request(
  `/api/workspaces/${encodeURIComponent(workspaceId)}/runtime/chats`,
  { jar: owner },
))
if (!Array.isArray(chats.chats)) throw new Error('Runtime chat route did not return a chat list')

const consoleProof = await runConsoleCommand(workspaceId, owner, "printf 'NEBULA_CONSOLE_OK\\n'; pwd")
if (!consoleProof.includes('NEBULA_CONSOLE_OK') || !consoleProof.includes('/home/nebula/workspace')) {
  throw new Error(`Console proof failed: ${consoleProof.slice(-1000)}`)
}

const tcpServer = Buffer.from(`import socket\nlistener = socket.socket()\nlistener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)\nlistener.bind(('0.0.0.0', 15432))\nlistener.listen()\nwhile True:\n    client, _ = listener.accept()\n    with client:\n        client.sendall(b'NEBULA_TCP_OK\\n')\n`).toString('base64')
await runConsoleCommand(workspaceId, owner, [
  "mkdir -p /home/nebula/workspace/demo-http",
  "printf 'NEBULA_HTTP_OK\\n' > /home/nebula/workspace/demo-http/index.html",
  "nohup python3 -m http.server 18080 --bind 0.0.0.0 --directory /home/nebula/workspace/demo-http >/tmp/nubols-demo-http.log 2>&1 &",
  `nohup python3 -c \"import base64;exec(base64.b64decode('${tcpServer}'))\" >/tmp/nubols-demo-tcp.log 2>&1 &`,
  'sleep 1',
].join('\n'))

const helpProof = await runConsoleCommand(workspaceId, owner, `${nubols} --help`)
if (!helpProof.includes('nubols expose')) throw new Error('nubols --help did not describe expose')
await runConsoleCommand(workspaceId, owner, `${nubols} expose web 18080`)
const privateOutput = await runConsoleCommand(workspaceId, owner, `${nubols} expose --private private-api 18080`)
const privateToken = privateOutput.match(
  /X-Nubols-Publication-Token:\s*([A-Za-z0-9_-]{32,256})/,
)?.[1]
if (!privateToken) throw new Error(`Private publication token was not shown once: ${privateOutput}`)
const tcpOutput = await runConsoleCommand(workspaceId, owner, `${nubols} expose --tcp database 15432`)
const listOutput = await runConsoleCommand(workspaceId, owner, `${nubols} ps`)
for (const name of ['web', 'private-api', 'database']) {
  if (!listOutput.includes(name)) throw new Error(`nubols ps omitted ${name}`)
}

const publications = await json<{
  publications: Array<{
    name: string
    protocol: 'http' | 'tcp'
    publicUrl: string
    ingressPort: number | null
  }>
}>(await request(`/api/workspaces/${encodeURIComponent(workspaceId)}/publications`, {
  authorization: `Bearer ${runtimeAccess.accessToken}`,
}))
const webPublication = publications.publications.find(item => item.name === 'web')
const privatePublication = publications.publications.find(item => item.name === 'private-api')
const tcpPublication = publications.publications.find(item => item.name === 'database')
if (!webPublication || !privatePublication || !tcpPublication?.ingressPort) {
  throw new Error(`Publication list is incomplete: ${JSON.stringify(publications)}`)
}

function directPublishedURL(publicURL: string): URL {
  const published = new URL(publicURL)
  return new URL(`${published.pathname}${published.search}`, baseURL)
}

const publicHTTP = await fetch(directPublishedURL(webPublication.publicUrl))
if (publicHTTP.status !== 200 || !(await publicHTTP.text()).includes('NEBULA_HTTP_OK')) {
  throw new Error(`Public HTTP publication failed (${publicHTTP.status})`)
}
const deniedPrivate = await fetch(directPublishedURL(privatePublication.publicUrl))
if (deniedPrivate.status !== 401) {
  throw new Error(`Private HTTP publication was not protected (${deniedPrivate.status})`)
}
const allowedPrivate = await fetch(directPublishedURL(privatePublication.publicUrl), {
  headers: { 'x-nubols-publication-token': privateToken },
})
if (allowedPrivate.status !== 200 || !(await allowedPrivate.text()).includes('NEBULA_HTTP_OK')) {
  throw new Error(`Authenticated private HTTP publication failed (${allowedPrivate.status})`)
}
if (!(await tcpRead('127.0.0.1', tcpPublication.ingressPort)).includes('NEBULA_TCP_OK')) {
  throw new Error(`Raw TCP publication failed: ${tcpOutput}`)
}

const database = openCloudDatabase({ path: databasePath })
try {
  recordUsageEvent(database, {
    eventId: `demo-usage-${runId}`,
    organizationId: organization.id,
    membershipId: ownerMembership.membershipId,
    workspaceId,
    sessionId: 'demo-session',
    sessionDisplayName: 'Demo session',
    provider: 'openai',
    model: 'gpt-demo',
    inputTokens: 3094,
    outputTokens: 906,
    cachedTokens: 1000,
    reasoningTokens: 128,
    estimatedCostMicrousd: 5000,
    cacheSavingsMicrousd: 1000,
    occurredAt: Date.now(),
  })
} finally {
  database.close()
}
const usage = await json<{
  totals: { inputTokens: number; totalTokens: number }
  models: Array<{ model: string }>
}>(await request('/api/usage/me?days=30', { jar: owner }))
if (usage.totals.inputTokens < 3094 || usage.totals.totalTokens < 4000
  || !usage.models.some(model => model.model === 'gpt-demo')) {
  throw new Error(`Synthetic usage proof failed: ${JSON.stringify(usage)}`)
}

const contact = await json<{ status: string }>(await request('/api/contact', {
  method: 'POST',
  body: {
    submissionId: crypto.randomUUID(),
    name: 'Demo Prospect',
    email: `prospect-${runId}@example.test`,
    organization: 'Demo Prospect Ltd',
    topic: 'sales',
    message: 'Please schedule a synthetic Nubols technical demo.',
    privacyVersion: '2026-08-29',
  },
}), 202)
if (contact.status !== 'received') throw new Error('Contact Sales fixture was not accepted')

for (const name of ['web', 'private-api', 'database']) {
  await runConsoleCommand(workspaceId, owner, `${nubols} stop ${name}`)
}
const revokedHTTP = await fetch(directPublishedURL(webPublication.publicUrl))
if (revokedHTTP.status !== 404) {
  throw new Error(`Revoked HTTP publication remained reachable (${revokedHTTP.status})`)
}
let revokedTCPRejected = false
try {
  await tcpRead('127.0.0.1', tcpPublication.ingressPort, 1_000)
} catch {
  revokedTCPRejected = true
}
if (!revokedTCPRejected) throw new Error('Revoked TCP publication remained reachable')

console.log(JSON.stringify({
  status: 'ok',
  runId,
  organizationId: organization.id,
  workspaceId,
  proofs: {
    authAndMembership: true,
    fourteenDayEntitlement: true,
    runtimeAndChatGateway: true,
    console: true,
    nubolsHelpAndLifecycle: true,
    publicHTTP: true,
    privateHTTPToken: true,
    rawTCP: true,
    usage: true,
    contactSales: true,
    revocation: true,
  },
}))
