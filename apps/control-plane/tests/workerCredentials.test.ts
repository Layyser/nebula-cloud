import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWorkerCredentials } from '../src/workerCredentials'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('loads worker credentials by database key ID without persisting them', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nebula-worker-credentials-'))
  directories.push(directory)
  const filePath = join(directory, 'credentials.json')
  writeFileSync(filePath, JSON.stringify({
    'worker-a-token': 'worker-a-secret-0123456789abcdef0123456789',
  }), { mode: 0o600 })

  expect(loadWorkerCredentials({ filePath })).toEqual(new Map([
    ['worker-a-token', 'worker-a-secret-0123456789abcdef0123456789'],
  ]))
})

test('legacy worker credential overrides the matching file entry', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nebula-worker-credentials-'))
  directories.push(directory)
  const filePath = join(directory, 'credentials.json')
  writeFileSync(filePath, JSON.stringify({
    local: 'file-worker-secret-0123456789abcdef0123456789',
  }))

  expect(loadWorkerCredentials({
    filePath,
    legacyCredential: {
      keyId: 'local',
      secret: 'environment-secret-0123456789abcdef0123456789',
    },
  }).get('local')).toBe('environment-secret-0123456789abcdef0123456789')
})

test('rejects malformed or weak credential files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nebula-worker-credentials-'))
  directories.push(directory)
  const filePath = join(directory, 'credentials.json')
  writeFileSync(filePath, JSON.stringify({ worker: 'short' }))

  expect(() => loadWorkerCredentials({ filePath })).toThrow('at least 32 characters')
})
