import { expect, test } from 'bun:test'
import { workerAuthorizationHeader } from '../src/workerAuth'

test('derives a short-lived request-bound worker credential', () => {
  expect(workerAuthorizationHeader({
    secret: 'worker-signing-secret',
    method: 'POST',
    path: '/internal/v1/workspaces/workspace-1/restart',
    now: () => Date.UTC(2026, 6, 29, 12, 0, 0),
    nonce: () => '0123456789abcdef',
  })).toBe(
    'Nebula-HMAC v1.1785326460.0123456789abcdef.'
    + 'LtsjHjo72824rrECW1w6ehairsV0Bq22FTtrSUOTgCI',
  )
})
