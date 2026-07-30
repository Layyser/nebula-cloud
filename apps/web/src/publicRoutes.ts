export interface DocsRoute {
  path: string
  title: string
  group: string
  summary: string
}

export const DOCS_ROUTES: DocsRoute[] = [
  { path: '/docs', title: 'Documentation overview', group: 'Overview', summary: 'TODO: documentation overview' },
  { path: '/docs/getting-started', title: 'Getting started', group: 'Overview', summary: 'TODO: getting-started documentation' },
  { path: '/docs/concepts/operators', title: 'Operators', group: 'Concepts', summary: 'TODO: operator concept documentation' },
  { path: '/docs/concepts/workspaces', title: 'Workspaces', group: 'Concepts', summary: 'TODO: workspace concept documentation' },
  { path: '/docs/reference/runtime', title: 'Runtime reference', group: 'Reference', summary: 'TODO: runtime reference documentation' },
]

export interface LegalRoute {
  path: string
  title: string
}

export const LEGAL_ROUTES: LegalRoute[] = [
  { path: '/legal/privacy', title: 'Privacy' },
  { path: '/legal/terms', title: 'Terms' },
  { path: '/legal/acceptable-use', title: 'Acceptable use' },
]

export type PublicSurface = 'landing' | 'docs' | 'legal' | null

export function resolvePublicSurface(pathname: string): PublicSurface {
  if (pathname === '/') return 'landing'
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return 'docs'
  if (pathname === '/legal' || pathname.startsWith('/legal/')) return 'legal'
  return null
}

export function findDocsRoute(pathname: string): DocsRoute {
  return DOCS_ROUTES.find(route => route.path === pathname) || DOCS_ROUTES[0]
}

export function findLegalRoute(pathname: string): LegalRoute | null {
  return LEGAL_ROUTES.find(route => route.path === pathname) || null
}
