import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { origin, pages, seoHead } from '../src/seo'

test('public metadata has unique titles, canonical URLs and social previews', () => {
  expect(new Set(Object.values(pages).map(([title]) => title)).size).toBe(Object.keys(pages).length)
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8')
  for (const path of Object.keys(pages)) {
    expect(seoHead(path)).toContain(`rel="canonical" href="${origin}${path}"`)
    expect(seoHead(path)).toContain('summary_large_image')
    expect(sitemap).toContain(`<loc>${origin}${path}</loc>`)
  }
  expect(seoHead('/')).toContain('application/ld+json')
})
test('private routes and unknown pages are not indexable and have no canonical', () => {
  for (const path of ['/login', '/app', '/app/terminal', '/reset-password', '/auth/callback/provider', '/missing']) {
    expect(seoHead(path)).toContain('noindex,follow')
    expect(seoHead(path)).not.toContain('rel="canonical"')
  }
  expect(seoHead('/missing?x="<script>')).not.toContain('x="<script>')
})
test('crawler files reference real public resources', () => {
  expect(readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')).toContain(`${origin}/sitemap.xml`)
  expect(readFileSync(new URL('../public/llms.txt', import.meta.url), 'utf8')).toContain(`${origin}/docs?topic=capabilities`)
})
test('deployment routes preserve the app but do not serve the landing for missing URLs', () => {
  const config = readFileSync(new URL('../../../deploy/nginx/nubols.conf', import.meta.url), 'utf8')
  expect(config).toContain('error_page 404 /404.html;')
  expect(config).toContain('try_files /private.html =404;')
  expect(config).toContain('try_files $uri/index.html =404;')
  expect(config).not.toContain('try_files $uri $uri/ /index.html;')
})
