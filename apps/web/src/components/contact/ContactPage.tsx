import { useRef, useState } from 'react'
import { ArrowRight, BriefcaseBusiness, LifeBuoy, Mail, ShieldCheck } from 'lucide-react'
import { Button, ContextSelect, Field, Input, Textarea } from '@nebula/runtime-ui'
import { PublicPageShell } from '../public/PublicPageShell'
import { SectionEyebrow } from '../public/SectionEyebrow'

const CONTACT_PATHS = [
  {
    icon: BriefcaseBusiness,
    title: 'Sales',
    topic: 'sales',
    description: 'Talk through operator capacity, deployment, and organization requirements.',
    action: 'Contact sales',
  },
  {
    icon: LifeBuoy,
    title: 'Support',
    topic: 'support',
    description: 'Get help with an existing account, runtime, or workspace.',
    action: 'Open support',
  },
  {
    icon: ShieldCheck,
    title: 'Security',
    topic: 'security',
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

const CONTACT_PRIVACY_VERSION = '2026-08-24'

type SubmitState = 'idle' | 'pending' | 'success' | 'error'

export function ContactPage({ onLaunch }: { onLaunch: () => void }) {
  const [topic, setTopic] = useState<ContactTopic>('sales')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [organization, setOrganization] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const submissionId = useRef<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitState === 'pending' || submitState === 'success') return
    setSubmitState('pending')
    submissionId.current ??= crypto.randomUUID()
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          submissionId: submissionId.current,
          name,
          email,
          organization,
          topic,
          message,
          privacyVersion: CONTACT_PRIVACY_VERSION,
          website,
        }),
      })
      if (!response.ok) throw new Error('Contact request failed')
      setSubmitState('success')
    } catch {
      setSubmitState('error')
    }
  }

  return (
    <PublicPageShell onLaunch={onLaunch} className="public-page-plain">
      <main className="mx-auto min-h-screen max-w-[1280px] px-6 pb-28 pt-32 lg:px-10 lg:pt-40">
        <section className="grid gap-14 lg:grid-cols-[minmax(0,0.82fr)_minmax(460px,1.18fr)] lg:gap-20">
          <div>
            <SectionEyebrow>/contact</SectionEyebrow>
            <h1 className="mt-5 text-5xl font-medium tracking-[-0.055em] sm:text-7xl">Start a conversation.</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[var(--color-text-secondary)]">Talk with us about a team demo, product questions, support, or security.</p>

            <div className="mt-12 divide-y divide-[var(--color-border-subtle)]">
              {CONTACT_PATHS.map(path => {
                const Icon = path.icon
                return (
                  <a key={path.title} href="#contact-form" onClick={() => setTopic(path.topic)} className="group grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-4 py-6">
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
              <a href="mailto:hello@nubols.com" className="transition-colors hover:text-[var(--color-text-primary)]">hello@nubols.com</a>
            </div>
          </div>

          <section id="contact-form" className="scroll-mt-28 rounded-[var(--radius-surface)] bg-[var(--color-surface-panel)] p-6 sm:p-8 lg:p-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">Send a message</p>
            <h2 className="mt-3 text-3xl font-medium tracking-[-0.04em]">Tell us what you need.</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">We’ll reply from a Nubols address. Please do not include passwords, API keys, or other secrets.</p>

            <form className="mt-9 space-y-5" onSubmit={submit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Name" required className="[&_label]:!text-[var(--color-text-muted)]">
                  <Input name="name" autoComplete="name" maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Your name" required />
                </Field>
                <Field label="Work email" required className="[&_label]:!text-[var(--color-text-muted)]">
                  <Input name="email" type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" required />
                </Field>
              </div>
              <Field label="Organization" className="[&_label]:!text-[var(--color-text-muted)]">
                <Input name="organization" autoComplete="organization" maxLength={160} value={organization} onChange={event => setOrganization(event.target.value)} placeholder="Company or team" />
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
                <Textarea name="message" minLength={10} maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} className="min-h-40 resize-none" placeholder="How can we help?" required />
              </Field>
              <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label htmlFor="contact-website">Website</label>
                <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
              </div>
              <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-sm text-xs leading-5 text-[var(--color-text-subtle)]" aria-live="polite">
                  {submitState === 'success' ? (
                    <p className="text-[var(--color-text-primary)]">Message received. We’ll get back to you by email.</p>
                  ) : submitState === 'error' ? (
                    <p className="text-[var(--color-danger)]">We couldn’t deliver that message. Please retry or email hello@nubols.com.</p>
                  ) : (
                    <p>See our <a href="/legal?document=privacy" className="underline underline-offset-2 hover:text-[var(--color-text-primary)]">Privacy Notice</a>. Accepted requests are kept for up to 730 days; rejected and honeypot submissions are not stored in the contact database.</p>
                  )}
                </div>
                <Button type="submit" variant="primary" size="hero" radius="marketing-pill" disabled={submitState === 'pending' || submitState === 'success'}>
                  {submitState === 'pending' ? 'Sending…' : submitState === 'success' ? 'Message sent' : 'Send message'} <ArrowRight size={15} />
                </Button>
              </div>
            </form>
          </section>
        </section>
      </main>
    </PublicPageShell>
  )
}
