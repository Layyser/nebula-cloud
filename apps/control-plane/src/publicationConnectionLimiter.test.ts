import { expect, test } from 'bun:test'
import { PublicationConnectionLimiter } from './publicationConnectionLimiter'

test('enforces global, worker, organization, and route publication connection limits', () => {
  const scope = (workerId: string, organizationId: string, routeId: string) => ({
    workerId,
    organizationId,
    routeId,
  })

  const routeLimiter = new PublicationConnectionLimiter({
    global: 8,
    perWorker: 6,
    perOrganization: 4,
    perRoute: 1,
  })
  const routeLease = routeLimiter.tryAcquire(scope('worker-a', 'org-a', 'route-a'))
  expect(routeLease).not.toBeNull()
  expect(routeLimiter.tryAcquire(scope('worker-a', 'org-a', 'route-a'))).toBeNull()
  routeLease?.release()
  expect(routeLimiter.tryAcquire(scope('worker-a', 'org-a', 'route-a'))).not.toBeNull()

  const organizationLimiter = new PublicationConnectionLimiter({
    global: 8,
    perWorker: 8,
    perOrganization: 1,
    perRoute: 8,
  })
  expect(organizationLimiter.tryAcquire(scope('worker-a', 'org-a', 'route-a'))).not.toBeNull()
  expect(organizationLimiter.tryAcquire(scope('worker-b', 'org-a', 'route-b'))).toBeNull()

  const workerLimiter = new PublicationConnectionLimiter({
    global: 8,
    perWorker: 1,
    perOrganization: 8,
    perRoute: 8,
  })
  expect(workerLimiter.tryAcquire(scope('worker-a', 'org-a', 'route-a'))).not.toBeNull()
  expect(workerLimiter.tryAcquire(scope('worker-a', 'org-b', 'route-b'))).toBeNull()

  const globalLimiter = new PublicationConnectionLimiter({
    global: 1,
    perWorker: 1,
    perOrganization: 1,
    perRoute: 1,
  })
  const globalLease = globalLimiter.tryAcquire(scope('worker-a', 'org-a', 'route-a'))
  expect(globalLease).not.toBeNull()
  expect(globalLimiter.tryAcquire(scope('worker-b', 'org-b', 'route-b'))).toBeNull()
  globalLease?.release()
  globalLease?.release()
  expect(globalLimiter.tryAcquire(scope('worker-b', 'org-b', 'route-b'))).not.toBeNull()
})
