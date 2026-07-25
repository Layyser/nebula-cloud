/**
 * Organization-neutral request identity consumed by the control plane.
 * CLOUD-03 will provide the Better Auth implementation.
 */
export interface CloudPrincipal {
  userId: string
  sessionId: string
}

export interface SessionResolver {
  resolve(request: Request): Promise<CloudPrincipal | null>
}
