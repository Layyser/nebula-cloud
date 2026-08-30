export interface PublicationConnectionLimits {
  global: number
  perWorker: number
  perOrganization: number
  perRoute: number
}

export interface PublicationConnectionScope {
  workerId: string
  organizationId: string
  routeId: string
}

export interface PublicationConnectionLease {
  release(): void
}

function positiveLimit(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive safe integer`)
  }
  return value
}

export class PublicationConnectionLimiter {
  readonly #limits: PublicationConnectionLimits
  readonly #workers = new Map<string, number>()
  readonly #organizations = new Map<string, number>()
  readonly #routes = new Map<string, number>()
  #global = 0

  constructor(limits: PublicationConnectionLimits) {
    this.#limits = {
      global: positiveLimit(limits.global, 'global connection limit'),
      perWorker: positiveLimit(limits.perWorker, 'per-worker connection limit'),
      perOrganization: positiveLimit(limits.perOrganization, 'per-organization connection limit'),
      perRoute: positiveLimit(limits.perRoute, 'per-route connection limit'),
    }
    if (
      this.#limits.perWorker > this.#limits.global
      || this.#limits.perOrganization > this.#limits.global
      || this.#limits.perRoute > this.#limits.global
    ) {
      throw new Error('Scoped publication connection limits cannot exceed the global limit')
    }
  }

  tryAcquire(scope: PublicationConnectionScope): PublicationConnectionLease | null {
    const worker = this.#workers.get(scope.workerId) ?? 0
    const organization = this.#organizations.get(scope.organizationId) ?? 0
    const route = this.#routes.get(scope.routeId) ?? 0
    if (
      this.#global >= this.#limits.global
      || worker >= this.#limits.perWorker
      || organization >= this.#limits.perOrganization
      || route >= this.#limits.perRoute
    ) return null

    this.#global += 1
    this.#workers.set(scope.workerId, worker + 1)
    this.#organizations.set(scope.organizationId, organization + 1)
    this.#routes.set(scope.routeId, route + 1)
    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        this.#global -= 1
        this.#decrement(this.#workers, scope.workerId)
        this.#decrement(this.#organizations, scope.organizationId)
        this.#decrement(this.#routes, scope.routeId)
      },
    }
  }

  #decrement(counts: Map<string, number>, key: string): void {
    const remaining = (counts.get(key) ?? 1) - 1
    if (remaining > 0) counts.set(key, remaining)
    else counts.delete(key)
  }
}
