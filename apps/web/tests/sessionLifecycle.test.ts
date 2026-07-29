import { expect, test } from 'bun:test'
import {
  clearSessionExpired,
  consumeSessionExpired,
  observeAuthenticationResponse,
  rememberSessionExpired,
} from '../src/auth/sessionLifecycle'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

test('persists and consumes the session-expired notice exactly once', () => {
  const storage = memoryStorage()
  rememberSessionExpired(storage)
  expect(consumeSessionExpired(storage)).toBe(true)
  expect(consumeSessionExpired(storage)).toBe(false)
  rememberSessionExpired(storage)
  clearSessionExpired(storage)
  expect(consumeSessionExpired(storage)).toBe(false)
})

test('only authentication failures trigger session expiry', () => {
  let expirations = 0
  observeAuthenticationResponse(
    new Response(null, { status: 401 }),
    () => { expirations += 1 },
  )
  observeAuthenticationResponse(
    new Response(null, { status: 403 }),
    () => { expirations += 1 },
  )
  expect(expirations).toBe(1)
})
