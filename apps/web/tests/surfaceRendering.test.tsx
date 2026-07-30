import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspaceResolutionError } from '../src/App'
import { AuthPage } from '../src/components/auth/AuthPage'
import { WorkspaceStartup } from '../src/components/cloud/WorkspaceStartup'
import { DocsPage } from '../src/components/docs/DocsPage'
import { LegalPage } from '../src/components/legal/LegalPage'
import { OrganizationSetup } from '../src/components/organization/OrganizationGate'
import { WorkspaceStartupError } from '../src/runtime/workspaceStartup'

const noop = () => {}

test('renders the Cloud brand on login, organization, startup, and error states', () => {
  const login = renderToStaticMarkup(createElement(AuthPage, {
    onAuthenticated: noop,
    onBack: noop,
  }))
  const organization = renderToStaticMarkup(createElement(OrganizationSetup, {
    organizations: [],
    onBack: noop,
    onChanged: async () => {},
  }))
  const startup = renderToStaticMarkup(createElement(WorkspaceStartup, {
    progress: { stage: 'starting' },
  }))
  const error = renderToStaticMarkup(createElement(WorkspaceResolutionError, {
    error: new WorkspaceStartupError('starting', 'Runtime unavailable'),
    onRetry: noop,
  }))

  for (const surface of [login, organization, startup, error]) {
    expect(surface).toContain('brand-lockup__surface')
    expect(surface).toContain('cloud')
  }
  expect(startup).toContain('Opening your operator')
  expect(startup).toContain('ui-status-glyph')
  expect(error).toContain('Try again')
})

test('renders Docs with active navigation and placeholder-only article content', () => {
  const markup = renderToStaticMarkup(createElement(DocsPage, {
    pathname: '/docs/concepts/operators',
    onNavigate: noop,
  }))
  expect(markup).toContain('>docs<')
  expect(markup).toContain('aria-current="page"')
  expect(markup).toContain('TODO: reviewed technical documentation')
})

test('renders Legal with the draft warning and neutral placeholders', () => {
  const markup = renderToStaticMarkup(createElement(LegalPage, {
    pathname: '/legal/terms',
    onNavigate: noop,
  }))
  expect(markup).toContain('>legal<')
  expect(markup).toContain('DRAFT — NOT PUBLISHED')
  expect(markup).toContain('TODO: reviewed legal text')
})
