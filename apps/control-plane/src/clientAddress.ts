import { isIP } from 'node:net'

export interface ResolveClientAddressOptions {
  directAddress: string | null
  trustLocalProxy: boolean
}

function normalizedIPAddress(value: string | null): string | null {
  const candidate = value?.trim() ?? ''
  return isIP(candidate) ? candidate : null
}

function isLoopback(value: string): boolean {
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1'
}

export function resolveClientAddress(
  request: Request,
  { directAddress, trustLocalProxy }: ResolveClientAddressOptions,
): string | null {
  const direct = normalizedIPAddress(directAddress)
  if (!trustLocalProxy || !direct || !isLoopback(direct)) return direct

  // Only a loopback reverse proxy is trusted. Nginx overwrites X-Real-IP, so a
  // public client cannot select the value that reaches this process.
  return normalizedIPAddress(request.headers.get('x-real-ip')) ?? direct
}
