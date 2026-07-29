import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createCloudAuth, migrateCloudAuthSchema } from '../src'

test('Better Auth owns the core and organization SQLite schema', async () => {
  const database = new Database(':memory:', { strict: true })
  try {
    const auth = createCloudAuth({
      database,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:7790',
    })
    await migrateCloudAuthSchema(auth)

    const tables = new Set(database.query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all().map(table => table.name))

    for (const table of [
      'user',
      'session',
      'account',
      'verification',
      'organization',
      'member',
      'invitation',
    ]) {
      expect(tables.has(table)).toBe(true)
    }
  } finally {
    database.close()
  }
})

test('rejects a weak Better Auth secret', () => {
  const database = new Database(':memory:')
  try {
    expect(() => createCloudAuth({
      database,
      secret: 'too-short',
      baseURL: 'http://localhost:7790',
    })).toThrow('at least 32 characters')
  } finally {
    database.close()
  }
})

test('supports an email session and organization lifecycle', async () => {
  const database = new Database(':memory:', { strict: true })
  try {
    const auth = createCloudAuth({
      database,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:7790',
      trustedOrigins: ['http://localhost:5173'],
    })
    await migrateCloudAuthSchema(auth)

    const signUp = await auth.handler(new Request(
      'http://localhost:7790/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          name: 'George',
          email: 'george@example.test',
          password: 'secure-password',
        }),
      },
    ))
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie')?.split(';', 1)[0]
    expect(cookie).toBeTruthy()

    const session = await auth.handler(new Request(
      'http://localhost:7790/api/auth/get-session',
      { headers: { cookie: cookie! } },
    ))
    expect(session.status).toBe(200)
    expect((await session.json()).user.email).toBe('george@example.test')

    const createOrganization = await auth.handler(new Request(
      'http://localhost:7790/api/auth/organization/create',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookie!,
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({ name: 'Nebula', slug: 'nebula' }),
      },
    ))
    expect(createOrganization.status).toBe(200)

    const organizations = await auth.handler(new Request(
      'http://localhost:7790/api/auth/organization/list',
      { headers: { cookie: cookie! } },
    ))
    expect(organizations.status).toBe(200)
    expect((await organizations.json())[0].slug).toBe('nebula')
  } finally {
    database.close()
  }
})

test('rejects an expired Better Auth session', async () => {
  const database = new Database(':memory:', { strict: true })
  try {
    const auth = createCloudAuth({
      database,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:7790',
      trustedOrigins: ['http://localhost:5173'],
    })
    await migrateCloudAuthSchema(auth)

    const signUp = await auth.handler(new Request(
      'http://localhost:7790/api/auth/sign-up/email',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({
          name: 'Expired User',
          email: 'expired@example.test',
          password: 'secure-password',
        }),
      },
    ))
    expect(signUp.status).toBe(200)
    const cookie = signUp.headers.get('set-cookie')?.split(';', 1)[0]
    expect(cookie).toBeTruthy()

    database.prepare('UPDATE session SET expiresAt = 0').run()
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookie! }),
    })
    expect(session).toBeNull()
  } finally {
    database.close()
  }
})
