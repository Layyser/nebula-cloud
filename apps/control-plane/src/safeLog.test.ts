import { expect, test } from 'bun:test'
import { safeLogJSON } from './safeLog'

test('redacts prompts, credentials, auth headers, provider secrets, addresses, paths, and Console data', () => {
  const output = safeLogJSON({
    event: 'test',
    prompt: 'private prompt',
    token: 'provider-token',
    authorization: 'Bearer direct-secret',
    providerCredential: 'provider-secret',
    workerAddress: 'http://10.0.0.4:7780',
    workspacePath: '/home/nebula/workspace/private.txt',
    consoleData: 'terminal output',
    message: 'failed with Authorization: Bearer nested-secret at /var/lib/nebula-workspaces/ws-1/home',
  })
  for (const secret of [
    'private prompt', 'provider-token', 'direct-secret', 'provider-secret',
    '10.0.0.4', 'private.txt', 'terminal output', 'nested-secret', 'ws-1',
  ]) expect(output).not.toContain(secret)
  expect(output).toContain('"event":"test"')
  expect(output).toContain('[REDACTED]')
})

test('bounds untrusted values and preserves safe operational fields', () => {
  const output = safeLogJSON({ event: 'failed', code: 'timeout', message: 'x'.repeat(5000) })
  expect(output.length).toBeLessThan(1200)
  expect(output).toContain('"code":"timeout"')
})
