import { useState } from 'react'
import { ArrowRight, BriefcaseBusiness, LifeBuoy, Mail, ShieldCheck } from 'lucide-react'
import { Button, ContextSelect, Field, Input, Textarea } from '@nebula/runtime-ui'
import { PublicPageShell } from '../public/PublicPageShell'
import { SectionEyebrow } from '../public/SectionEyebrow'

const CONTACT_PATHS = [
  {
    icon: BriefcaseBusiness,
    title: 'Sales',
    description: 'Talk through operator capacity, deployment, and organization requirements.',
    action: 'Contact sales',
  },
  {
    icon: LifeBuoy,
    title: 'Support',
    description: 'Get help with an existing account, runtime, or workspace.',
    action: 'Open support',
  },
  {
    icon: ShieldCheck,
    title: 'Security',
    description: 'Report a vulnerability through the future disclosure channel.',
    action: 'Report securely',
  },
] as const

type ContactTopic = 'sales' | 'support' | 'security' | 'partnerships' | 'other'

const CONTACT_TOPICS: Array<{ value: ContactTopic; label: string }> = [
  { value: 'sales', label: 'Sales' },
  { value: 'support', label: 'Support' },
  { value: 'security', label: 'Security' },
  { value: 'partnerships', label: 'Press and partnerships' },
  { value: 'other', label: 'Other' },
]

export function ContactPage({ onLaunch }: { onLaunch: () => void }) {
  const [topic, setTopic] = useState<ContactTopic>('sales')

  return (
    <PublicPageShell onLaunch={onLaunch} className="public-page-plain">
      <main className="mx-auto min-h-screen max-w-[1280px] px-6 pb-28 pt-32 lg:px-10 lg:pt-40">
        <section className="grid gap-14 lg:grid-cols-[minmax(0,0.82fr)_minmax(460px,1.18fr)] lg:gap-20">
          <div>
            <SectionEyebrow>/contact</SectionEyebrow>
            <h1 className="mt-5 text-5xl font-medium tracking-[-0.055em] sm:text-7xl">Start a conversation.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[var(--color-text-secondary)]">Placeholder contact paths for product questions, customer support, security reports, and company inquiries.</p>

            <div className="mt-12 divide-y divide-[var(--color-border-subtle)]">
              {CONTACT_PATHS.map(path => {
                const Icon = path.icon
                return (
                  <a key={path.title} href="#contact-form" className="group grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-4 py-6">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-surface)] bg-[var(--color-surface-recessed)] text-[var(--color-text-secondary)] transition-colors group-hover:bg-[var(--color-surface-hover)] group-hover:text-[var(--color-text-primary)]">
                      <Icon size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-[var(--color-text-primary)]">{path.title}</span>
                      <span className="mt-1 block max-w-md text-sm leading-6 text-[var(--color-text-muted)]">{path.description}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors group-hover:text-[var(--color-text-primary)]">
                      {path.action} <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </a>
                )
              })}
            </div>

            <div className="mt-10 flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
              <Mail size={16} />
              <span>hello@example.com</span>
            </div>
          </div>

          <section id="contact-form" className="scroll-mt-28 rounded-[var(--radius-surface)] bg-[var(--color-surface-panel)] p-6 sm:p-8 lg:p-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">Send a message</p>
            <h2 className="mt-3 text-3xl font-medium tracking-[-0.04em]">Tell us what you need.</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">This form is a visual placeholder and does not submit yet.</p>

            <form className="mt-9 space-y-5" onSubmit={event => event.preventDefault()}>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Name" required className="[&_label]:!text-[var(--color-text-muted)]">
                  <Input placeholder="Your name" />
                </Field>
                <Field label="Work email" required className="[&_label]:!text-[var(--color-text-muted)]">
                  <Input type="email" placeholder="you@company.com" />
                </Field>
              </div>
              <Field label="Organization" className="[&_label]:!text-[var(--color-text-muted)]">
                <Input placeholder="Company or team" />
              </Field>
              <Field label="Topic" className="[&_label]:!text-[var(--color-text-muted)]">
                <ContextSelect
                  value={topic}
                  options={CONTACT_TOPICS}
                  onChange={setTopic}
                  ariaLabel="Contact topic"
                  contentWidth="w-[var(--radix-popover-trigger-width)]"
                  side="bottom"
                />
              </Field>
              <Field label="Message" required className="[&_label]:!text-[var(--color-text-muted)]">
                <Textarea className="min-h-40 resize-none" placeholder="How can we help?" />
              </Field>
              <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-sm text-xs leading-5 text-[var(--color-text-subtle)]">By submitting, you agree to the placeholder privacy notice.</p>
                <Button type="submit" variant="primary" size="hero" radius="marketing-pill">
                  Send message <ArrowRight size={15} />
                </Button>
              </div>
            </form>
          </section>
        </section>
      </main>
    </PublicPageShell>
  )
}
