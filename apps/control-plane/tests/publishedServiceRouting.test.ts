import { describe, expect, test } from 'bun:test'
import {
  matchPublishedServiceHostname,
  parsePublishedServiceOrigin,
} from '../src/publishedServiceRouting'

describe('published service origin', () => {
  test('builds one opaque subdomain while retaining scheme and port', () => {
    const routing = parsePublishedServiceOrigin('https://apps.nubols.com')
    expect(routing?.hostnameSuffix).toBe('apps.nubols.com')
    expect(routing?.urlForSlug('ABC-123')).toBe('https://abc-123.apps.nubols.com')

    const local = parsePublishedServiceOrigin('http://apps.localhost:7790')
    expect(local?.urlForSlug('service')).toBe('http://service.apps.localhost:7790')
  })

  test('rejects origins that contain routing ambiguity or credentials', () => {
    for (const value of [
      'ftp://apps.nubols.com',
      'https://user:secret@apps.nubols.com',
      'https://apps.nubols.com/path',
      'https://apps.nubols.com?worker=1',
      'https://*.apps.nubols.com',
      'https://127.0.0.1',
    ]) {
      expect(() => parsePublishedServiceOrigin(value)).toThrow()
    }
  })
})

describe('published service hostname routing', () => {
  test('accepts exactly one service label under the configured suffix', () => {
    expect(matchPublishedServiceHostname(
      'opaque-slug.apps.nubols.com',
      'apps.nubols.com',
    )).toEqual({ kind: 'service', slug: 'opaque-slug' })
    expect(matchPublishedServiceHostname(
      'OPAQUE-SLUG.APPS.NUBOLS.COM.',
      'apps.nubols.com',
    )).toEqual({ kind: 'service', slug: 'opaque-slug' })
  })

  test('separates unrelated hosts from invalid names in the publication zone', () => {
    expect(matchPublishedServiceHostname('app.nubols.com', 'apps.nubols.com'))
      .toEqual({ kind: 'none' })
    expect(matchPublishedServiceHostname('apps.nubols.com', 'apps.nubols.com'))
      .toEqual({ kind: 'invalid' })
    expect(matchPublishedServiceHostname('nested.slug.apps.nubols.com', 'apps.nubols.com'))
      .toEqual({ kind: 'invalid' })
  })
})
