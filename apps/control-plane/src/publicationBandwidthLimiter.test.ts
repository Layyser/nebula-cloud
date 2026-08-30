import { expect, test } from 'bun:test'
import { PublicationBandwidthLimiter } from './publicationBandwidthLimiter'

test('accounts bandwidth across every scope and releases only after the fixed window', () => {
  let now = 1000
  const limiter = new PublicationBandwidthLimiter({
    windowMs: 60_000,
    globalBytes: 12,
    perWorkerBytes: 10,
    perOrganizationBytes: 8,
    perRouteBytes: 6,
  }, () => now)
  const first = { workerId: 'worker-a', organizationId: 'org-a', routeId: 'route-a' }
  const second = { workerId: 'worker-a', organizationId: 'org-a', routeId: 'route-b' }

  expect(limiter.tryConsume(first, 6)).toBe(true)
  expect(limiter.tryConsume(first, 1)).toBe(false)
  expect(limiter.tryConsume(second, 2)).toBe(true)
  expect(limiter.tryConsume(second, 1)).toBe(false)

  now += 60_000
  expect(limiter.tryConsume(first, 6)).toBe(true)
})
