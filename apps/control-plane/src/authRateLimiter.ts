import type { Database } from 'bun:sqlite'
import { createHmac } from 'node:crypto'

type AuthAction = 'signup' | 'login' | 'recovery' | 'resend' | 'invitation'

interface AuthRatePolicy {
  action: AuthAction
  ipLimit: number
  addressLimit: number
  windowMs: number
  nonEnumerating: boolean
}

const policies = new Map<string, AuthRatePolicy>([
  ['/api/auth/sign-up/email', {
    action: 'signup', ipLimit: 10, addressLimit: 3, windowMs: 60 * 60 * 1000,
    nonEnumerating: false,
  }],
  ['/api/auth/sign-in/email', {
    action: 'login', ipLimit: 60, addressLimit: 30, windowMs: 15 * 60 * 1000,
    nonEnumerating: false,
  }],
  ['/api/auth/request-password-reset', {
    action: 'recovery', ipLimit: 10, addressLimit: 3, windowMs: 60 * 60 * 1000,
    nonEnumerating: true,
  }],
  ['/api/auth/send-verification-email', {
    action: 'resend', ipLimit: 10, addressLimit: 3, windowMs: 60 * 60 * 1000,
    nonEnumerating: true,
  }],
  ['/api/auth/organization/invite-member', {
    action: 'invitation', ipLimit: 30, addressLimit: 10, windowMs: 24 * 60 * 60 * 1000,
    nonEnumerating: false,
  }],
])

export interface AuthRateLimiterOptions {
  database: Database
  hashSecret: string
  now?: () => number
}

interface RateBucketRow {
  window_started_at: number
  request_count: number
}

export class AuthRateLimiter {
  readonly #database: Database
  readonly #hashSecret: string
  readonly #now: () => number

  constructor({ database, hashSecret, now = Date.now }: AuthRateLimiterOptions) {
    if (hashSecret.trim().length < 32) {
      throw new Error('Authentication rate-limit hash secret must contain at least 32 characters')
    }
    this.#database = database
    this.#hashSecret = hashSecret
    this.#now = now
  }

  async handle(
    request: Request,
    clientAddress: string | null,
    next: (request: Request) => Response | Promise<Response>,
  ): Promise<Response> {
    const policy = request.method === 'POST'
      ? policies.get(new URL(request.url).pathname)
      : undefined
    if (!policy) return await next(request)

    const address = await readAddress(request.clone())
    const timestamp = this.#now()
    const subjects = [
      { scope: 'ip' as const, value: clientAddress ?? 'unavailable', limit: policy.ipLimit },
      ...(address
        ? [{ scope: 'address' as const, value: address, limit: policy.addressLimit }]
        : []),
    ]
    const allowed = this.#database.transaction(() => subjects.every(subject => (
      this.#consume(subject.scope, subject.value, policy, subject.limit, timestamp)
    )))()

    if (allowed) return await next(request)
    if (policy.nonEnumerating) {
      return Response.json({ status: true }, {
        status: 200,
        headers: { 'cache-control': 'no-store' },
      })
    }
    return Response.json({
      error: 'Too many authentication attempts. Try again later.',
      code: 'auth_rate_limited',
      retryable: true,
    }, {
      status: 429,
      headers: {
        'cache-control': 'no-store',
        'retry-after': String(Math.max(1, Math.ceil(policy.windowMs / 1000))),
      },
    })
  }

  #consume(
    scope: 'ip' | 'address',
    subject: string,
    policy: AuthRatePolicy,
    limit: number,
    timestamp: number,
  ): boolean {
    const subjectHash = createHmac('sha256', this.#hashSecret)
      .update(`${scope}:${subject.trim().toLowerCase()}`)
      .digest('hex')
    const row = this.#database.query<RateBucketRow, [string, string, string]>(`
      SELECT window_started_at, request_count
      FROM auth_rate_limit_bucket
      WHERE scope = ? AND subject_hash = ? AND action = ?
    `).get(scope, subjectHash, policy.action)
    const windowStartedAt = row && timestamp - row.window_started_at < policy.windowMs
      ? row.window_started_at
      : timestamp
    const requestCount = row && windowStartedAt === row.window_started_at
      ? row.request_count + 1
      : 1
    this.#database.prepare(`
      INSERT INTO auth_rate_limit_bucket (
        scope, subject_hash, action, window_started_at, request_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, subject_hash, action) DO UPDATE SET
        window_started_at = excluded.window_started_at,
        request_count = excluded.request_count,
        updated_at = excluded.updated_at
    `).run(scope, subjectHash, policy.action, windowStartedAt, requestCount, timestamp)
    return requestCount <= limit
  }
}

async function readAddress(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > 16 * 1024) return null
  try {
    const text = await request.text()
    if (text.length > 16 * 1024) return null
    const value = JSON.parse(text) as { email?: unknown }
    return typeof value.email === 'string' && value.email.trim()
      ? value.email.trim().toLowerCase()
      : null
  } catch {
    return null
  }
}
