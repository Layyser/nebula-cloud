import { isIP } from 'node:net'

const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export interface PublishedServiceOrigin {
  origin: string
  hostnameSuffix: string
  urlForSlug: (slug: string) => string
}

export type PublishedServiceHostMatch =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'service'; slug: string }

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

function validHostname(value: string): boolean {
  return value.length <= 253
    && value.includes('.')
    && isIP(value) === 0
    && value.split('.').every(label => hostnameLabel.test(label))
}

export function parsePublishedServiceOrigin(
  raw: string | undefined,
): PublishedServiceOrigin | null {
  const value = raw?.trim()
  if (!value) return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('NEBULA_PUBLISHED_SERVICE_ORIGIN must be an absolute HTTP(S) origin')
  }
  const hostnameSuffix = normalizeHostname(url.hostname)
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || !validHostname(hostnameSuffix)
  ) {
    throw new Error('NEBULA_PUBLISHED_SERVICE_ORIGIN must be a clean HTTP(S) origin with a DNS hostname')
  }
  url.hostname = hostnameSuffix
  const origin = url.origin
  return {
    origin,
    hostnameSuffix,
    urlForSlug: (slug: string) => {
      const normalizedSlug = slug.trim().toLowerCase()
      if (!hostnameLabel.test(normalizedSlug)) {
        throw new Error('Published service slug is not a valid DNS label')
      }
      const published = new URL(origin)
      published.hostname = `${normalizedSlug}.${hostnameSuffix}`
      return published.origin
    },
  }
}

export function matchPublishedServiceHostname(
  hostname: string,
  configuredSuffix: string | undefined,
): PublishedServiceHostMatch {
  const suffix = normalizeHostname(configuredSuffix ?? '')
  if (!suffix) return { kind: 'none' }

  const candidate = normalizeHostname(hostname)
  if (candidate === suffix) return { kind: 'invalid' }
  const ending = `.${suffix}`
  if (!candidate.endsWith(ending)) return { kind: 'none' }

  const slug = candidate.slice(0, -ending.length)
  if (!hostnameLabel.test(slug)) return { kind: 'invalid' }
  return { kind: 'service', slug }
}
