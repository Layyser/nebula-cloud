import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  DOCS_ROUTES,
  LEGAL_ROUTES,
  findDocsRoute,
  findLegalRoute,
  resolvePublicSurface,
} from '../src/publicRoutes'

test('classifies every public surface without treating Cloud routes as public', () => {
  expect(resolvePublicSurface('/')).toBe('landing')
  expect(resolvePublicSurface('/docs')).toBe('docs')
  expect(resolvePublicSurface('/docs/concepts/operators')).toBe('docs')
  expect(resolvePublicSurface('/legal')).toBe('legal')
  expect(resolvePublicSurface('/legal/privacy')).toBe('legal')
  expect(resolvePublicSurface('/login')).toBeNull()
  expect(resolvePublicSurface('/app')).toBeNull()
})

test('exposes every planned documentation route and resolves active pages', () => {
  expect(DOCS_ROUTES.map(route => route.path)).toEqual([
    '/docs',
    '/docs/getting-started',
    '/docs/concepts/operators',
    '/docs/concepts/workspaces',
    '/docs/reference/runtime',
  ])
  expect(findDocsRoute('/docs/concepts/workspaces').title).toBe('Workspaces')
  expect(findDocsRoute('/docs/not-yet-written').path).toBe('/docs')
  for (const route of DOCS_ROUTES) {
    expect(route.summary.startsWith('TODO:')).toBe(true)
  }
})

test('keeps legal routes explicitly draft-only', () => {
  expect(LEGAL_ROUTES.map(route => route.path)).toEqual([
    '/legal/privacy',
    '/legal/terms',
    '/legal/acceptable-use',
  ])
  expect(findLegalRoute('/legal')).toBeNull()
  expect(findLegalRoute('/legal/terms')?.title).toBe('Terms')

  const legalSource = readFileSync(
    new URL('../src/components/legal/LegalPage.tsx', import.meta.url),
    'utf8',
  )
  expect(legalSource).toContain('DRAFT — NOT PUBLISHED')
  expect(legalSource).toContain('TODO: legal section title')
  expect(legalSource).toContain('TODO: reviewed legal text')
})

test('routes the dominant public action through the protected app entry', () => {
  const headerSource = readFileSync(
    new URL('../src/components/public/PublicChrome.tsx', import.meta.url),
    'utf8',
  )
  const landingSource = readFileSync(
    new URL('../src/components/landing/LandingPage.tsx', import.meta.url),
    'utf8',
  )
  expect(headerSource).toContain('href="/app"')
  expect(headerSource).toContain('Try Nebula')
  expect(landingSource).toContain('AI operators with a computer of their own.')
  expect(landingSource).toContain("price: '9'")
  expect(landingSource).toContain("price: '999'")
})

test('uses the Cloud brand on every control-plane-owned state', () => {
  const sources = [
    '../src/components/auth/CloudBrand.tsx',
    '../src/components/auth/AuthLoading.tsx',
    '../src/components/cloud/WorkspaceStartup.tsx',
    '../src/App.tsx',
  ]
  for (const relativePath of sources) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    expect(source).toContain('surface="cloud"')
  }
})
