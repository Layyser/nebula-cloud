import { createHmac, randomBytes } from 'node:crypto'

const scheme = 'Nebula-HMAC'
const version = 'v1'
const lifetimeSeconds = 60

export interface WorkerAuthorizationOptions {
  secret: string
  method: string
  path: string
  now?: () => number
  nonce?: () => string
}

export function workerAuthorizationHeader({
  secret,
  method,
  path,
  now = Date.now,
  nonce = () => randomBytes(18).toString('base64url'),
}: WorkerAuthorizationOptions): string {
  if (!secret.trim()) throw new Error('Worker service signing secret is required')
  const requestNonce = nonce()
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestNonce)) {
    throw new Error('Worker service credential nonce is invalid')
  }
  const expiresAt = Math.floor(now() / 1000) + lifetimeSeconds
  const payload = [
    version,
    String(expiresAt),
    requestNonce,
    method.toUpperCase(),
    path,
  ].join('\n')
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')
  return `${scheme} ${version}.${expiresAt}.${requestNonce}.${signature}`
}
