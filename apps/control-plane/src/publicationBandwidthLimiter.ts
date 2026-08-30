import type { PublicationConnectionScope } from './publicationConnectionLimiter'

export interface PublicationBandwidthLimits {
  windowMs: number
  globalBytes: number
  perWorkerBytes: number
  perOrganizationBytes: number
  perRouteBytes: number
}

interface Counter {
  windowStartedAt: number
  bytes: number
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive safe integer`)
  }
  return value
}

export class PublicationBandwidthLimiter {
  readonly #limits: PublicationBandwidthLimits
  readonly #now: () => number
  readonly #global = new Map<string, Counter>()
  readonly #workers = new Map<string, Counter>()
  readonly #organizations = new Map<string, Counter>()
  readonly #routes = new Map<string, Counter>()

  constructor(limits: PublicationBandwidthLimits, now: () => number = Date.now) {
    this.#limits = {
      windowMs: positiveInteger(limits.windowMs, 'bandwidth window'),
      globalBytes: positiveInteger(limits.globalBytes, 'global bandwidth limit'),
      perWorkerBytes: positiveInteger(limits.perWorkerBytes, 'per-worker bandwidth limit'),
      perOrganizationBytes: positiveInteger(
        limits.perOrganizationBytes,
        'per-organization bandwidth limit',
      ),
      perRouteBytes: positiveInteger(limits.perRouteBytes, 'per-route bandwidth limit'),
    }
    this.#now = now
  }

  canConsume(scope: PublicationConnectionScope, bytes: number): boolean {
    if (!Number.isSafeInteger(bytes) || bytes < 0) return false
    const now = this.#now()
    return this.#value(this.#global, 'global', now) + bytes <= this.#limits.globalBytes
      && this.#value(this.#workers, scope.workerId, now) + bytes <= this.#limits.perWorkerBytes
      && this.#value(this.#organizations, scope.organizationId, now) + bytes
        <= this.#limits.perOrganizationBytes
      && this.#value(this.#routes, scope.routeId, now) + bytes <= this.#limits.perRouteBytes
  }

  tryConsume(scope: PublicationConnectionScope, bytes: number): boolean {
    if (!this.canConsume(scope, bytes)) return false
    if (bytes === 0) return true
    const now = this.#now()
    this.#add(this.#global, 'global', now, bytes)
    this.#add(this.#workers, scope.workerId, now, bytes)
    this.#add(this.#organizations, scope.organizationId, now, bytes)
    this.#add(this.#routes, scope.routeId, now, bytes)
    return true
  }

  #value(counters: Map<string, Counter>, key: string, now: number): number {
    const counter = counters.get(key)
    if (!counter) return 0
    if (now - counter.windowStartedAt >= this.#limits.windowMs) {
      counters.delete(key)
      return 0
    }
    return counter.bytes
  }

  #add(counters: Map<string, Counter>, key: string, now: number, bytes: number): void {
    const current = this.#value(counters, key, now)
    counters.set(key, {
      windowStartedAt: current === 0 ? now : counters.get(key)!.windowStartedAt,
      bytes: current + bytes,
    })
  }
}
