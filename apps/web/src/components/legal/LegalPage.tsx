import { type MouseEvent } from 'react'
import { ArrowRight, FileText } from 'lucide-react'
import { LEGAL_ROUTES, findLegalRoute } from '../../publicRoutes'
import { SurfacePanel } from '../ui/CloudUI'
import {
  PublicFooter,
  PublicHeader,
  PublicPage,
  type PublicNavigate,
} from '../public/PublicChrome'

interface LegalPageProps {
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

export function LegalPage({ pathname, onNavigate }: LegalPageProps) {
  const document = findLegalRoute(pathname)
  return (
    <PublicPage className="reading-page legal-page">
      <PublicHeader onNavigate={onNavigate} surface="legal" quiet />
      {document ? (
        <LegalDocument title={document.title} onNavigate={onNavigate} />
      ) : (
        <LegalHub onNavigate={onNavigate} />
      )}
      <PublicFooter onNavigate={onNavigate} surface="legal" />
    </PublicPage>
  )
}

function LegalHub({ onNavigate }: { onNavigate: PublicNavigate }) {
  return (
    <main className="legal-hub">
      <p className="reading-eyebrow">Legal center</p>
      <h1>Documents prepared for review.</h1>
      <p className="legal-hub__lead">
        This area is scaffolding only. No document is published or legally operative.
      </p>
      <div className="legal-draft-banner">DRAFT — NOT PUBLISHED</div>
      <div className="legal-card-grid">
        {LEGAL_ROUTES.map(route => (
          <a
            key={route.path}
            href={route.path}
            onClick={event => routeClick(event, route.path, onNavigate)}
          >
            <SurfacePanel level={1} className="legal-card">
              <FileText size={18} />
              <div>
                <strong>{route.title}</strong>
                <span>TODO: reviewed legal text</span>
              </div>
              <ArrowRight size={15} />
            </SurfacePanel>
          </a>
        ))}
      </div>
    </main>
  )
}

function LegalDocument({
  title,
  onNavigate,
}: {
  title: string
  onNavigate: PublicNavigate
}) {
  return (
    <main className="legal-document">
      <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
        <a href="/legal" onClick={event => routeClick(event, '/legal', onNavigate)}>Legal</a>
        <span>/</span>
        <span>{title}</span>
      </nav>
      <div className="legal-draft-banner">DRAFT — NOT PUBLISHED</div>
      <div className="legal-document__grid">
        <article>
          <p className="reading-eyebrow">Legal document</p>
          <h1>{title}</h1>
          <dl className="legal-metadata">
            <div><dt>Status</dt><dd>DRAFT — NOT PUBLISHED</dd></div>
            <div><dt>Metadata</dt><dd>TODO: reviewed legal metadata</dd></div>
          </dl>
          {[1, 2, 3, 4].map(index => (
            <section id={`legal-section-${index}`} key={index}>
              <h2>TODO: legal section title</h2>
              <p>TODO: reviewed legal text</p>
            </section>
          ))}
        </article>
        <aside className="legal-outline">
          <span>In this draft</span>
          {[1, 2, 3, 4].map(index => (
            <a key={index} href={`#legal-section-${index}`}>TODO: section</a>
          ))}
        </aside>
      </div>
    </main>
  )
}
