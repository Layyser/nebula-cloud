import { useState } from 'react'
import { Check, Minus } from 'lucide-react'
import { PublicPageShell } from '../public/PublicPageShell'
import { SectionEyebrow } from '../public/SectionEyebrow'
import { SegmentedControl } from '../ui/SegmentedControl'

type BillingCadence = 'monthly' | 'annual'

const PLANS = [
  {
    name: 'Individual',
    audience: 'For one person',
    monthly: 9,
    detail: 'One persistent operator',
    description: 'A private managed Linux workspace for an individual workflow.',
    features: ['1 deployed operator', 'Persistent Linux home', 'Chat and Console', 'Personal capabilities'],
    featured: false,
  },
  {
    name: 'Team',
    audience: 'For small teams',
    monthly: 10,
    detail: '+ $5 per operator',
    description: 'Shared operator templates and visibility for a growing team.',
    features: ['Up to 15 operators', 'Shared capabilities', 'Usage visibility', 'Workspace administration'],
    featured: false,
  },
  {
    name: 'Business',
    audience: 'For organizations',
    monthly: 99,
    detail: '15 operators included',
    description: 'Governance, controls, and support for organization-wide adoption.',
    features: ['Role-aware access', 'Organization usage', 'Audit history', 'Priority support'],
    featured: true,
  },
  {
    name: 'Enterprise',
    audience: 'For larger deployments',
    monthly: 999,
    detail: '100 operators included',
    description: 'Dedicated capacity and deployment support for critical workloads.',
    features: ['Dedicated capacity', 'Advanced policies', 'SSO placeholders', 'Migration support'],
    featured: false,
  },
] as const

const COMPARISON = [
  { label: 'Persistent Linux workspace', values: ['Included', 'Included', 'Included', 'Included'] },
  { label: 'Operator allowance', values: ['1', 'Up to 15', '15 included', '100 included'] },
  { label: 'Shared capabilities', values: [false, true, true, true] },
  { label: 'Organization usage', values: [false, true, true, true] },
  { label: 'Budget and policy controls', values: [false, false, true, true] },
  { label: 'Dedicated worker capacity', values: [false, false, false, true] },
] as const

function priceFor(plan: typeof PLANS[number], cadence: BillingCadence): string {
  return cadence === 'monthly' ? String(plan.monthly) : String(plan.monthly * 12)
}

export function PlansPage({ onLaunch }: { onLaunch: () => void }) {
  const [cadence, setCadence] = useState<BillingCadence>('monthly')

  return (
    <PublicPageShell onLaunch={onLaunch} className="public-page-plain">
      <main className="mx-auto max-w-[1480px] px-6 pb-28 pt-32 lg:px-10 lg:pt-40">
        <section className="mx-auto max-w-4xl text-center">
          <SectionEyebrow>/plans</SectionEyebrow>
          <h1 className="mt-5 text-5xl font-medium tracking-[-0.055em] sm:text-7xl">Choose how you deploy.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[var(--color-text-secondary)]">Placeholder plan details for Nebula Agent, managed operators, and organization controls. Final commercial terms will replace this copy.</p>
          <SegmentedControl
            ariaLabel="Billing cadence"
            value={cadence}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'annual', label: 'Annual' },
            ]}
            onValueChange={setCadence}
            tone="dark"
            className="mx-auto mt-10 w-[250px]"
          />
        </section>

        <section aria-label="Plans" className="mt-16 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map(plan => (
            <article key={plan.name} className={`flex min-h-[530px] flex-col rounded-[var(--radius-surface)] border p-6 ${plan.featured ? 'border-[var(--color-diagram-active-border)] bg-[var(--color-diagram-active-surface)]' : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-panel)]'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">{plan.audience}</p>
              <h2 className="mt-3 text-2xl font-medium tracking-[-0.035em]">{plan.name}</h2>
              <div className="mt-8 flex items-end gap-2">
                <span className="pb-2 text-lg text-[var(--color-text-muted)]">$</span>
                <span className="text-6xl font-medium tracking-[-0.06em]">{priceFor(plan, cadence)}</span>
                <span className="pb-2 text-xs text-[var(--color-text-muted)]">/ {cadence === 'monthly' ? 'month' : 'year'}</span>
              </div>
              <p className="mt-3 min-h-5 text-xs text-[var(--color-text-muted)]">{plan.detail}</p>
              <p className="mt-6 text-sm leading-6 text-[var(--color-text-secondary)]">{plan.description}</p>
              <a href="/app" onClick={event => { event.preventDefault(); onLaunch() }} className={`mt-7 inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold transition-colors ${plan.featured ? 'bg-[var(--color-control-primary)] text-[var(--color-control-on-primary)] hover:bg-[var(--color-control-primary-hover)]' : 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]'}`}>
                Choose {plan.name}
              </a>
              <div className="mt-8 border-t border-[var(--color-border-subtle)] pt-6">
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">Included</p>
                <ul className="space-y-3">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex gap-2.5 text-sm leading-5 text-[var(--color-text-secondary)]">
                      <Check size={14} className="mt-0.5 shrink-0 text-[var(--color-status-success)]" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-28">
          <div className="mb-10 max-w-2xl">
            <SectionEyebrow>/compare</SectionEyebrow>
            <h2 className="mt-3 text-4xl font-medium tracking-[-0.045em]">Find the right operating model.</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-border-strong)]">
                  <th className="w-[28%] py-5 pr-5 text-xs font-medium text-[var(--color-text-muted)]">Capability</th>
                  {PLANS.map(plan => <th key={plan.name} className="px-4 py-5 text-sm font-medium">{plan.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.label} className="border-b border-[var(--color-border-subtle)]">
                    <th className="py-5 pr-5 text-sm font-normal text-[var(--color-text-secondary)]">{row.label}</th>
                    {row.values.map((value, index) => (
                      <td key={`${row.label}-${PLANS[index].name}`} className="px-4 py-5 text-sm text-[var(--color-text-primary)]">
                        {value === true ? <Check size={15} className="text-[var(--color-status-success)]" /> : value === false ? <Minus size={15} className="text-[var(--color-text-disabled)]" /> : value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </PublicPageShell>
  )
}
