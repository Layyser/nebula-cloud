import { useMemo, useState, type MouseEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, ChevronDown, FileText, Menu, Search, X } from 'lucide-react'
import { DOCS_ROUTES, findDocsRoute } from '../../publicRoutes'
import { TextField } from '../ui/CloudUI'
import {
  PublicFooter,
  PublicHeader,
  PublicPage,
  type PublicNavigate,
} from '../public/PublicChrome'

interface DocsPageProps {
  pathname: string
  onNavigate: PublicNavigate
}

function routeClick(
  event: MouseEvent<HTMLAnchorElement>,
  path: string,
  onNavigate: PublicNavigate,
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  onNavigate(path)
}

export function DocsPage({ pathname, onNavigate }: DocsPageProps) {
  const page = findDocsRoute(pathname)
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return DOCS_ROUTES
    return DOCS_ROUTES.filter(route =>
      `${route.title} ${route.group}`.toLowerCase().includes(normalized),
    )
  }, [query])

  const navigate = (path: string) => {
    setMobileOpen(false)
    onNavigate(path)
  }

  return (
    <PublicPage className="reading-page docs-page">
      <PublicHeader onNavigate={onNavigate} surface="docs" quiet />
      <div className="docs-toolbar">
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Trigger asChild>
            <button type="button" className="docs-toolbar__menu" aria-label="Open documentation navigation">
              <Menu size={16} />
              Browse
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="mobile-nav__overlay" />
            <Dialog.Content className="docs-drawer">
              <header>
                <strong>Documentation</strong>
                <Dialog.Close asChild>
                  <button type="button" aria-label="Close documentation navigation"><X size={17} /></button>
                </Dialog.Close>
              </header>
              <DocsNavigation pathname={pathname} routes={filtered} onNavigate={navigate} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <label className="docs-search">
          <Search size={15} aria-hidden="true" />
          <TextField
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search documentation"
            aria-label="Search documentation"
          />
          <kbd>/</kbd>
        </label>
      </div>

      <div className="docs-shell">
        <aside className="docs-sidebar">
          <DocsNavigation pathname={pathname} routes={filtered} onNavigate={onNavigate} />
        </aside>
        <article className="docs-article">
          <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
            <a href="/docs" onClick={event => routeClick(event, '/docs', onNavigate)}>Docs</a>
            <span>/</span>
            <span>{page.group}</span>
          </nav>
          <p className="reading-eyebrow">{page.group}</p>
          <h1>{page.title}</h1>
          <p className="docs-article__summary">{page.summary}</p>

          <section id="overview">
            <h2>TODO: documentation section title</h2>
            <p>TODO: reviewed technical documentation</p>
          </section>
          <section id="details">
            <h2>TODO: documentation section title</h2>
            <p>TODO: reviewed technical documentation</p>
            <pre><code>TODO: verified example</code></pre>
          </section>
          <section id="next">
            <h2>TODO: documentation section title</h2>
            <p>TODO: reviewed technical documentation</p>
          </section>

          <div className="docs-next">
            <span>Next</span>
            <strong>TODO: next documented topic</strong>
            <ArrowRight size={16} />
          </div>
        </article>
        <aside className="docs-outline">
          <span>On this page</span>
          <a href="#overview">TODO: section</a>
          <a href="#details">TODO: section</a>
          <a href="#next">TODO: section</a>
        </aside>
      </div>
      <PublicFooter onNavigate={onNavigate} surface="docs" />
    </PublicPage>
  )
}

function DocsNavigation({
  pathname,
  routes,
  onNavigate,
}: {
  pathname: string
  routes: typeof DOCS_ROUTES
  onNavigate: PublicNavigate
}) {
  const groups = [...new Set(routes.map(route => route.group))]
  if (!routes.length) {
    return <p className="docs-navigation__empty">No pages match this search.</p>
  }
  return (
    <nav className="docs-navigation" aria-label="Documentation">
      {groups.map(group => (
        <section key={group}>
          <h2>{group}<ChevronDown size={12} /></h2>
          {routes.filter(route => route.group === group).map(route => (
            <a
              key={route.path}
              href={route.path}
              aria-current={pathname === route.path ? 'page' : undefined}
              onClick={event => routeClick(event, route.path, onNavigate)}
            >
              <FileText size={13} />
              {route.title}
            </a>
          ))}
        </section>
      ))}
    </nav>
  )
}
