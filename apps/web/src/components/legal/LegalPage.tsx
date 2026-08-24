import { useMemo, useState } from 'react'
import { ChevronDown, Cookie, EyeOff, Globe2, ListChecks, Scale, ShieldCheck } from 'lucide-react'
import { ArticleIndex } from '../public/ArticleIndex'
import { MarkdownContent } from '../public/MarkdownContent'
import { PublicPageShell } from '../public/PublicPageShell'
import { SectionEyebrow } from '../public/SectionEyebrow'

type LegalDocumentId = 'privacy' | 'terms' | 'acceptable-use' | 'cookies' | 'security'

type LegalDocument = {
  id: LegalDocumentId
  icon: typeof ShieldCheck
  label: string
  title: string
  effective: string
  sections: string[]
  markdown: string
}

const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    id: 'privacy',
    icon: EyeOff,
    label: 'Privacy',
    title: 'Privacy Notice',
    effective: 'Draft updated 24 August 2026',
    sections: ['Status and scope', 'Contact requests', 'Purpose and legal basis', 'Recipients and transfers', 'Retention', 'Your rights'],
    markdown: `
## Status and scope

This pre-launch notice currently covers the public Nubols contact form. The controller's complete legal identity and address, plus the wider service privacy terms, must be added and reviewed before external outreach. Questions can be sent to hello@nubols.com.

## Contact requests

When you submit the form, Nubols receives your name, work email, organization if supplied, selected topic, message, the notice version, and submission timestamps. The application stores a keyed one-way identifier derived from the request source address for abuse throttling; the contact record does not store the raw source address. Please do not submit passwords, API keys, or other secrets.

## Purpose and legal basis

The information is used to answer the request, route it to the appropriate role mailbox, manage follow-up, prevent abuse, and protect the service. The intended bases are taking steps at your request and Nubols' legitimate interests in responding to requested business communications and securing the form. These bases require legal review before launch.

## Recipients and transfers

Access is limited to the founder or authorized platform operators and service providers needed to host the application and deliver the notification email. The final notice will name the providers, processing locations, safeguards, and any international transfer mechanism before production data is sent to them. Contact details are not sold and user input cannot select an arbitrary notification recipient.

## Retention

Invalid, origin-blocked, rate-limited, and honeypot submissions are not intentionally added to the contact database. Accepted contact records are automatically deleted from that database after 730 days. Copies delivered to the role mailbox must follow the same deletion schedule; deployment operations must configure and verify that mailbox retention before outreach. Infrastructure security logs may have a separate, shorter schedule that the final notice will disclose.

## Your rights

You may ask to access, correct, or delete contact-form information by emailing hello@nubols.com. The final notice will provide the controller identity, the complete set of applicable rights, and the competent supervisory-authority information after legal review.
`,
  },
  {
    id: 'terms',
    icon: Scale,
    label: 'Terms',
    title: 'Terms of Service',
    effective: 'Effective date placeholder',
    sections: ['Agreement', 'Accounts', 'Use of the service', 'Fees', 'Intellectual property', 'Termination'],
    markdown: `
## Agreement

These placeholder terms outline the future agreement governing access to Nubols and Nebula products.

## Accounts

Final terms will define account eligibility, organization administration, and responsibility for credentials.

## Use of the service

Customers will be responsible for instructions, workspace content, exposed services, and compliance with applicable law.

## Fees

Billing cadence, taxes, renewals, refunds, and usage-based charges will be documented here.

## Intellectual property

This section will distinguish Nubols software, customer content, generated output, and feedback.

## Termination

Final language will cover suspension, termination, data export, and post-termination obligations.
`,
  },
  {
    id: 'acceptable-use',
    icon: ListChecks,
    label: 'Acceptable use',
    title: 'Acceptable Use Policy',
    effective: 'Effective date placeholder',
    sections: ['Purpose', 'Prohibited activity', 'Public services', 'Enforcement'],
    markdown: `
## Purpose

This placeholder policy will set boundaries for model use, tool execution, public services, and shared infrastructure.

## Prohibited activity

Final categories will be reviewed against provider requirements and applicable law.

## Public services

Customers exposing databases, game servers, websites, or other network services remain responsible for access controls and content.

## Enforcement

Nubols may investigate, restrict, suspend, or terminate activity that threatens users, infrastructure, or third parties.
`,
  },
  {
    id: 'cookies',
    icon: Cookie,
    label: 'Cookies',
    title: 'Cookie Policy',
    effective: 'Effective date placeholder',
    sections: ['About cookies', 'Essential storage', 'Analytics', 'Managing preferences'],
    markdown: `
## About cookies

This placeholder will explain browser storage used by the public website and authenticated application.

## Essential storage

Authentication, security, theme, and product preferences may require essential storage.

## Analytics

Any analytics or marketing technologies will be listed here before they are enabled.

## Managing preferences

Final controls and browser-specific instructions will be documented here.
`,
  },
  {
    id: 'security',
    icon: ShieldCheck,
    label: 'Security',
    title: 'Security and Disclosure',
    effective: 'Updated date placeholder',
    sections: ['Security program', 'Workspace isolation', 'Responsible disclosure', 'Contact'],
    markdown: `
## Security program

This placeholder page will summarize organizational and technical safeguards without exposing sensitive implementation detail.

## Workspace isolation

The final document will describe the boundaries between Cloud, workers, operator workspaces, persistent storage, and public ingress.

## Responsible disclosure

Researchers will receive a dedicated reporting channel, scope, safe-harbor language, and response expectations.

## Contact

Security contact information will be published before the service opens publicly.
`,
  },
]

export function LegalPage({ onLaunch }: { onLaunch: () => void }) {
  const documentFromQuery = new URLSearchParams(window.location.search).get('document') as LegalDocumentId | null
  const [documentId, setDocumentId] = useState<LegalDocumentId>(
    documentFromQuery && LEGAL_DOCUMENTS.some(document => document.id === documentFromQuery) ? documentFromQuery : 'privacy',
  )
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const document = useMemo(() => LEGAL_DOCUMENTS.find(candidate => candidate.id === documentId) ?? LEGAL_DOCUMENTS[0], [documentId])
  const activeIndex = LEGAL_DOCUMENTS.findIndex(candidate => candidate.id === document.id)
  const previous = activeIndex > 0 ? LEGAL_DOCUMENTS[activeIndex - 1] : null
  const next = activeIndex < LEGAL_DOCUMENTS.length - 1 ? LEGAL_DOCUMENTS[activeIndex + 1] : null

  const chooseDocument = (nextId: LegalDocumentId) => {
    setDocumentId(nextId)
    setMobileNavOpen(false)
    window.history.replaceState(null, '', `/legal?document=${nextId}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <PublicPageShell onLaunch={onLaunch} className="public-page-plain legal-page">
      <main className="mx-auto min-h-screen max-w-[1480px] px-6 pb-10 pt-32 lg:px-10 lg:pt-36">
        <div className="flex justify-center">
          <div className="hidden min-w-0 grow basis-0 pr-10 min-[1280px]:flex">
            <aside className="sticky top-32 max-h-[calc(100vh-8rem)] w-60 max-w-full shrink-0 self-start overflow-y-auto pb-12 lg:top-36">
              <div className="mb-7">
                <SectionEyebrow>/legal</SectionEyebrow>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Policy and legal documents.</p>
              </div>
              <nav aria-label="Legal documents" className="space-y-6">
                <div>
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">Documents</p>
                  <div className="space-y-0.5">
                    {LEGAL_DOCUMENTS.map(candidate => {
                      const selected = candidate.id === document.id
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => chooseDocument(candidate.id)}
                          className={`flex h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-left text-sm transition-colors ${selected ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'}`}
                        >
                          <candidate.icon size={15} strokeWidth={1.8} />
                          {candidate.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </nav>
            </aside>
          </div>

          <section className="w-full min-w-0 max-w-[760px] pb-28">
            <div className="relative mb-10 min-[1280px]:hidden">
              <button
                type="button"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(open => !open)}
                className="flex h-11 w-full items-center justify-between rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] px-4 font-serif text-base text-[var(--color-text-primary)]"
              >
                <span className="flex items-center gap-3">
                  <document.icon size={15} strokeWidth={1.8} />
                  {document.title}
                </span>
                <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} />
              </button>
              {mobileNavOpen && (
                <div className="absolute inset-x-0 top-full z-40 mt-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-diagram-node)] p-2 shadow-[var(--shadow-surface)]">
                  <div className="py-1.5">
                    <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">Documents</p>
                    {LEGAL_DOCUMENTS.map(candidate => {
                      const selected = candidate.id === document.id
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => chooseDocument(candidate.id)}
                          className={`flex h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left text-sm transition-colors ${selected ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'}`}
                        >
                          <candidate.icon size={15} strokeWidth={1.8} />
                          {candidate.title}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <header className="text-center">
              <h1 className="font-serif text-5xl font-normal tracking-[-0.04em] sm:text-6xl">{document.title}</h1>
            </header>
            <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border-strong)] pb-7 text-sm">
              <span className="font-medium">{document.effective}</span>
              <div className="flex items-center gap-5 text-[var(--color-text-secondary)]">
                <button type="button" className="font-medium underline underline-offset-4">Previous version</button>
                <button type="button" className="flex items-center gap-2 font-medium">
                  <Globe2 size={17} /> English <ChevronDown size={14} />
                </button>
              </div>
            </div>
            <div className="mt-9">
              <MarkdownContent source={document.markdown} legal />
            </div>

            <nav aria-label="Legal document pagination" className="mt-14 flex items-stretch justify-between gap-4 border-t border-[var(--color-border-subtle)] pt-6 min-[1280px]:hidden">
              {previous ? (
                <button
                  type="button"
                  onClick={() => chooseDocument(previous.id)}
                  className="min-w-0 flex-1 rounded-[var(--radius-control)] px-1 text-left transition-colors hover:text-[var(--color-text-primary)]"
                >
                  <span className="block text-xs text-[var(--color-text-muted)]">Previous</span>
                  <span className="mt-1 block truncate font-serif text-base text-[var(--color-text-secondary)] underline decoration-[var(--color-border-strong)] decoration-1 underline-offset-4">{previous.title}</span>
                </button>
              ) : <span className="flex-1" />}
              {next ? (
                <button
                  type="button"
                  onClick={() => chooseDocument(next.id)}
                  className="min-w-0 flex-1 rounded-[var(--radius-control)] px-1 text-right transition-colors hover:text-[var(--color-text-primary)]"
                >
                  <span className="block text-xs text-[var(--color-text-muted)]">Next</span>
                  <span className="mt-1 block truncate font-serif text-base text-[var(--color-text-secondary)] underline decoration-[var(--color-border-strong)] decoration-1 underline-offset-4">{next.title}</span>
                </button>
              ) : <span className="flex-1" />}
            </nav>
          </section>

          <div className="hidden min-w-0 grow basis-0 justify-end pl-10 min-[1280px]:flex">
            <aside className="sticky top-32 max-h-[calc(100vh-8rem)] w-[190px] max-w-full shrink-0 self-start overflow-y-auto lg:top-36 min-[1380px]:w-[210px]">
              <ArticleIndex sections={document.sections} copyText={document.markdown.trim()} />
            </aside>
          </div>
        </div>
      </main>
    </PublicPageShell>
  )
}
