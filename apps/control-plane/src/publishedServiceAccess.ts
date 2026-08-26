import { createHash, timingSafeEqual } from 'node:crypto'

export const publishedServiceTokenHeader = 'x-nubols-publication-token'

export function hashPublishedServiceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function publishedServiceTokenAuthenticated(
  request: Request,
  expectedHash: string,
): boolean {
  const token = request.headers.get(publishedServiceTokenHeader)?.trim() ?? ''
  if (!token || token.length > 256 || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false
  }
  const presented = Buffer.from(hashPublishedServiceToken(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return presented.length === expected.length && timingSafeEqual(presented, expected)
}
