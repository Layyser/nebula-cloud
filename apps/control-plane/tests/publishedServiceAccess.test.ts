import { expect, test } from 'bun:test'
import {
  hashPublishedServiceToken,
  publishedServiceTokenAuthenticated,
} from '../src/publishedServiceAccess'

test('authenticates a private publication token without retaining plaintext', () => {
  const hash = hashPublishedServiceToken('private-token')
  expect(hash).toHaveLength(64)
  expect(hash).not.toContain('private-token')
  expect(publishedServiceTokenAuthenticated(new Request('https://service.test', {
    headers: { 'x-nubols-publication-token': 'private-token' },
  }), hash)).toBe(true)
  expect(publishedServiceTokenAuthenticated(new Request('https://service.test', {
    headers: { 'x-nubols-publication-token': 'wrong-token' },
  }), hash)).toBe(false)
})
