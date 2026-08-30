export interface ReconciledTCPIngress {
  readonly activeListenerPorts: number[]
  activate(port: number): Promise<void>
  deactivate(port: number): Promise<void>
}

export interface TCPPublicationReconcilerOptions {
  ingress: ReconciledTCPIngress
  desiredPorts: () => number[]
  intervalMs?: number
  onError?: (error: unknown) => void
}

export class TCPPublicationReconciler {
  readonly #ingress: ReconciledTCPIngress
  readonly #desiredPorts: () => number[]
  readonly #intervalMs: number
  readonly #onError: (error: unknown) => void
  #timer: ReturnType<typeof setInterval> | null = null
  #reconciling: Promise<void> | null = null

  constructor({
    ingress,
    desiredPorts,
    intervalMs = 5_000,
    onError = () => {},
  }: TCPPublicationReconcilerOptions) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
      throw new Error('TCP publication reconciliation interval is invalid')
    }
    this.#ingress = ingress
    this.#desiredPorts = desiredPorts
    this.#intervalMs = intervalMs
    this.#onError = onError
  }

  async start(): Promise<void> {
    if (this.#timer) return
    await this.reconcile()
    this.#timer = setInterval(() => {
      void this.reconcile().catch(this.#onError)
    }, this.#intervalMs)
    this.#timer.unref?.()
  }

  async reconcile(): Promise<void> {
    if (this.#reconciling) return await this.#reconciling
    this.#reconciling = this.#reconcileOnce()
    try {
      await this.#reconciling
    } finally {
      this.#reconciling = null
    }
  }

  async close(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = null
    if (this.#reconciling) await this.#reconciling
  }

  async #reconcileOnce(): Promise<void> {
    const desired = new Set(this.#desiredPorts())
    const active = new Set(this.#ingress.activeListenerPorts)
    for (const port of active) {
      if (!desired.has(port)) await this.#ingress.deactivate(port)
    }
    for (const port of desired) {
      if (!active.has(port)) await this.#ingress.activate(port)
    }
  }
}
