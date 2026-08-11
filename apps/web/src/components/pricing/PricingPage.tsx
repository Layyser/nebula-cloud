import type { MouseEvent } from 'react'
import { Check } from 'lucide-react'
import { Header } from '../landing/LandingPage'

interface PricingPageProps {
  onLaunch: () => void
}

export function PricingPage({ onLaunch }: PricingPageProps) {
  const handleLaunch = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return

    event.preventDefault()
    onLaunch()
  }

  return (
    <div className="relative z-[2] min-h-screen overflow-x-hidden bg-[var(--color-surface-page)] text-[var(--color-text-primary)]">
      <Header onLaunch={handleLaunch} />
      <main className="relative z-10">
        <PricingSection onLaunch={handleLaunch} />
      </main>
    </div>
  )
}

const PRICING_PLANS = [
  {
    name: 'Individual',
    price: '9',
    priceDetail: null,
    featured: false,
    audience: 'For one person',
    inherits: null,
    description: 'Your first persistent AI operator, with a private managed Linux workspace.',
    features: [
      '1 deployed operator',
      'Persistent Linux home and Console',
      'Skills, MCPs, hooks, and web fetch',
    ],
  },
  {
    name: 'Team',
    price: '10',
    priceDetail: '+ $5 per operator',
    featured: false,
    audience: 'For small teams',
    inherits: 'Everything in Individual, plus',
    description: 'Deploy up to 15 operators and equip them from one shared organization library.',
    features: [
      '$5 per deployed operator',
      'Shared agent templates and capabilities',
      'Usage and cost dashboard',
    ],
  },
  {
    name: 'Business',
    price: '99',
    priceDetail: '+ $10 per operator after 15',
    featured: true,
    audience: 'For organizations',
    inherits: 'Everything in Team, plus',
    description: 'Governed operator access and visibility as Nebula expands across departments.',
    features: [
      '15 deployed operators included',
      '$10 per additional operator',
      'Roles and artifact permissions',
      'Audit history and budget controls',
      'SSO and priority support',
    ],
  },
  {
    name: 'Enterprise',
    price: '999',
    priceDetail: '+ $15 per operator after 100',
    featured: false,
    audience: 'For enterprises',
    inherits: 'Everything in Business, plus',
    description: 'Dedicated capacity and hands-on operations for business-critical AI workforces.',
    features: [
      '100 deployed operators included',
      '$15 per additional operator',
      'Dedicated worker capacity',
      'Advanced security policies',
      'Provisioning and migration support',
    ],
  },
] as const

function PricingSection({ onLaunch }: { onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <section id="pricing" className="mx-auto max-w-[1240px] px-6 py-28 lg:px-10 lg:py-36">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.17em] text-[var(--color-text-muted)]">Straightforward pricing</p>
          <h2 className="mt-5 mb-4 text-4xl font-medium tracking-[-0.045em] text-[var(--color-text-primary)] sm:text-6xl">Pay for each operator.<br></br>Bring your own intelligence.</h2>
        </div>
        <p className="max-w-sm text-right text-sm leading-6 text-[var(--color-text-secondary)]">Every operator includes a managed Linux workspace, persistent home, Console access, automatic runtime updates, and encrypted storage.</p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {PRICING_PLANS.map(plan => <PricingCard key={plan.name} plan={plan} onLaunch={onLaunch} />)}
      </div>

      <div className="mt-4 flex flex-col gap-5 rounded-xl border border-white/[0.07] bg-white/[0.018] px-5 py-4 text-xs text-white/38 sm:flex-row sm:items-center sm:justify-between">
        <span><strong className="font-medium text-white/65">Use subscriptions you already have—even on Individual.</strong> Connect Codex, OpenCode Go, and other supported plans through OAuth—or bring provider API keys. Model and API charges are not included, and Nebula adds no token markup.</span>
        <span className="shrink-0 text-white/28">Prices in USD exclude taxes · Dedicated capacity available</span>
      </div>
    </section>
  )
}

function PricingCard({ plan, onLaunch }: {
  plan: typeof PRICING_PLANS[number]
  onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <article className={`relative flex min-h-[490px] flex-col overflow-hidden rounded-2xl border p-6 ${plan.featured ? 'border-sky-300/20 bg-sky-300/[0.035] shadow-[0_24px_80px_rgba(56,189,248,0.055)]' : 'border-white/[0.08] bg-[#0a0b0b]'}`}>
      {plan.featured && <span className="absolute right-5 top-5 rounded-full border border-sky-300/15 bg-sky-300/[0.07] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-sky-200/65">Most popular</span>}
      <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/25">{plan.audience}</p>
      <p className="text-sm font-medium text-white/75">{plan.name}</p>
      <div className="mt-5 flex items-end gap-1.5">
        <span className="pb-1 text-lg text-white/45">$</span>
        <span className="text-5xl font-medium tracking-[-0.055em] text-white/95">{plan.price}</span>
        <span className="pb-1.5 text-xs text-white/30">/ month</span>
      </div>
      <p className={`mt-2 min-h-4 text-[11px] font-medium ${plan.priceDetail ? 'text-white/42' : 'invisible'}`}>
        {plan.priceDetail ?? 'Operator pricing'}
      </p>
      <p className="mt-5 min-h-[72px] text-sm leading-6 text-white/40">{plan.description}</p>
      <div className="mb-5 mt-6 border-t border-white/[0.07]" />
      <p className={`mb-3 text-[9px] font-medium uppercase tracking-[0.12em] ${plan.featured ? 'text-sky-200/48' : 'text-white/28'}`}>
        {plan.inherits ?? 'Included'}
      </p>
      <ul className="space-y-3">
        {plan.features.map(feature => (
          <li key={feature} className="flex items-start gap-2.5 text-xs leading-5 text-white/52">
            <Check size={13} strokeWidth={2} className={`mt-1 shrink-0 ${plan.featured ? 'text-sky-300/65' : 'text-white/30'}`} />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-8">
        <a href="/app" onClick={onLaunch} className={`flex h-10 items-center justify-center rounded-full text-xs font-medium transition ${plan.featured ? 'bg-white text-black hover:bg-white/90' : 'border border-white/[0.1] bg-white/[0.035] text-white/65 hover:bg-white/[0.07] hover:text-white/85'}`}>
          Choose {plan.name}
        </a>
      </div>
    </article>
  )
}
