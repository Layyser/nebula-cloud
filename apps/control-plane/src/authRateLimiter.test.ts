import { expect, test } from 'bun:test'
import { openCloudDatabase, migrateCloudSchema } from '@nebula-cloud/database'
import { AuthRateLimiter } from './authRateLimiter'

const secret = 'test-auth-rate-limit-secret-with-32-characters'

function databaseWithRateLimitSchema() {
  const database = openCloudDatabase({ path: ':memory:' })
  database.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY);
    CREATE TABLE organization (id TEXT PRIMARY KEY);
    CREATE TABLE member (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id),
      organizationId TEXT NOT NULL REFERENCES organization(id),
      role TEXT NOT NULL DEFAULT 'member'
    );
  `)
  migrateCloudSchema(database)
  return database
}

function post(path: string, email = 'person@example.test'): Request {
  return new Request(`http://control.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'irrelevant' }),
  })
}

test('limits signup independently by normalized address without storing raw identifiers', async () => {
  const database = databaseWithRateLimitSchema()
  let calls = 0
  const limiter = new AuthRateLimiter({ database, hashSecret: secret, now: () => 1000 })
  const next = () => { calls += 1; return new Response('ok') }
  for (let index = 0; index < 3; index += 1) {
    expect((await limiter.handle(post('/api/auth/sign-up/email', ' Person@Example.Test '), `192.0.2.${index}`, next)).status).toBe(200)
  }
  const denied = await limiter.handle(post('/api/auth/sign-up/email', 'person@example.test'), '192.0.2.9', next)
  expect(denied.status).toBe(429)
  expect((await denied.json()).code).toBe('auth_rate_limited')
  expect(calls).toBe(3)
  expect(JSON.stringify(database.query('SELECT * FROM auth_rate_limit_bucket').all()))
    .not.toContain('person@example.test')
  database.close()
})

test('returns the same recovery success shape after an address reaches its limit', async () => {
  const database = databaseWithRateLimitSchema()
  let calls = 0
  const limiter = new AuthRateLimiter({ database, hashSecret: secret, now: () => 1000 })
  const next = () => { calls += 1; return Response.json({ status: true }) }
  for (let index = 0; index < 4; index += 1) {
    const response = await limiter.handle(
      post('/api/auth/request-password-reset'),
      `198.51.100.${index}`,
      next,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: true })
  }
  expect(calls).toBe(3)
  database.close()
})

test('resets a bucket after its fixed window and leaves unrelated auth routes alone', async () => {
  const database = databaseWithRateLimitSchema()
  let now = 1000
  let calls = 0
  const limiter = new AuthRateLimiter({ database, hashSecret: secret, now: () => now })
  const next = () => { calls += 1; return new Response('ok') }
  for (let index = 0; index < 11; index += 1) {
    await limiter.handle(post('/api/auth/sign-up/email', `person-${index}@example.test`), '192.0.2.1', next)
  }
  expect(calls).toBe(10)
  now += 60 * 60 * 1000
  expect((await limiter.handle(post('/api/auth/sign-up/email', 'new@example.test'), '192.0.2.1', next)).status).toBe(200)
  expect((await limiter.handle(post('/api/auth/get-session'), '192.0.2.1', next)).status).toBe(200)
  database.close()
})
