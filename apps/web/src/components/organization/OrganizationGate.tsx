import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Building2, Check, KeyRound, LoaderCircle, LogOut, UserRound } from 'lucide-react'
import type {
  JoinOrganizationResponse,
  NubolsPlan,
  PlanAccount,
  PlanAccountsResponse,
  PlanAccountType,
} from '@nebula-cloud/contracts'
import { authClient } from '../../auth/authClient'
import { AuthLoading } from '../auth/AuthLoading'
import { CloudBrand } from '../auth/CloudBrand'

export interface CloudOrganization {
  id: string
  name: string
  slug: string
  logo?: string | null
  accountType: PlanAccountType
  plan: NubolsPlan
}

interface OrganizationGateProps {
  onBack: () => void
  onSignedOut: () => void
  children: (
    activeOrganization: CloudOrganization,
    organizations: CloudOrganization[],
    addOrganization: () => void,
  ) => ReactNode
}

export function OrganizationGate({ children, onBack, onSignedOut }: OrganizationGateProps) {
  const organizationsQuery = authClient.useListOrganizations()
  const activeQuery = authClient.useActiveOrganization()
  const [showSetup, setShowSetup] = useState(false)
  const [planAccounts, setPlanAccounts] = useState<PlanAccount[] | null>(null)
  const [planError, setPlanError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const loadPlanAccounts = useCallback(async () => {
    setPlanError('')
    try {
      const response = await fetch('/api/plan-accounts', { credentials: 'include' })
      const body = await response.json().catch(() => null) as (PlanAccountsResponse & { error?: string }) | null
      if (!response.ok || !body) throw new Error(body?.error || 'Could not load account plans')
      setPlanAccounts(body.accounts)
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'Could not load account plans')
    }
  }, [])

  const signOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      const result = await authClient.signOut()
      if (result.error) throw new Error(result.error.message || 'Could not sign out')
      onSignedOut()
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'Could not sign out')
    } finally {
      setSigningOut(false)
    }
  }, [onSignedOut, signingOut])

  useEffect(() => { void loadPlanAccounts() }, [loadPlanAccounts])

  const authOrganizations = (organizationsQuery.data || []) as Array<Omit<CloudOrganization, 'accountType' | 'plan'>>
  const activeAuthOrganization = activeQuery.data as Omit<CloudOrganization, 'accountType' | 'plan'> | null | undefined
  const organizations = (planAccounts || []).flatMap(account => {
    const organization = authOrganizations.find(candidate => candidate.id === account.organizationId)
    return organization ? [{ ...organization, accountType: account.accountType, plan: account.plan }] : []
  })
  const activeOrganization = activeAuthOrganization
    ? organizations.find(organization => organization.id === activeAuthOrganization.id)
    : undefined

  if (organizationsQuery.isPending || activeQuery.isPending || planAccounts === null) {
    if (planError) {
      return (
        <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 text-white">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-auth)] p-6 text-center">
            <p className="text-sm text-white/70">{planError}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button type="button" onClick={() => void loadPlanAccounts()} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Try again</button>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void signOut()}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-white/65 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                <LogOut size={13} />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      )
    }
    return <AuthLoading label="Loading account" />
  }

  if (activeOrganization && !showSetup) {
    return children(activeOrganization, organizations, () => setShowSetup(true))
  }

  return (
      <OrganizationSetup
        organizations={organizations}
        onBack={activeOrganization ? () => setShowSetup(false) : onBack}
        onSignedOut={signOut}
      onChanged={async () => {
        await Promise.all([
          organizationsQuery.refetch(),
          activeQuery.refetch(),
          loadPlanAccounts(),
        ])
        setShowSetup(false)
      }}
    />
  )
}

export function OrganizationSetup({
  organizations,
  onChanged,
  onBack,
  onSignedOut,
}: {
  organizations: CloudOrganization[]
  onChanged: () => Promise<void>
  onBack: () => void
  onSignedOut: () => Promise<void>
}) {
  const [code, setCode] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const hasIndividualAccount = organizations.some(organization => organization.accountType === 'individual')
  const [accountType, setAccountType] = useState<PlanAccountType>(hasIndividualAccount ? 'organization' : 'individual')
  const [organizationPlan, setOrganizationPlan] = useState<Exclude<NubolsPlan, 'individual'>>('team')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const createAccount = async (event: FormEvent) => {
    event.preventDefault()
    const name = accountType === 'individual' ? 'Personal workspace' : organizationName.trim()
    if (!name) return

    setError('')
    setBusy('create')
    try {
      const slugBase = name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 44) || 'organization'
      const slug = `${accountType === 'individual' ? 'personal' : slugBase}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
      const result = await authClient.organization.create({ name, slug })
      if (result.error || !result.data?.id) {
        throw new Error(result.error?.message || 'Could not create the organization')
      }
      const planResponse = await fetch('/api/plan-accounts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountType,
          plan: accountType === 'individual' ? 'individual' : organizationPlan,
          organizationId: result.data.id,
        }),
      })
      const planBody = await planResponse.json().catch(() => null) as { error?: string } | null
      if (!planResponse.ok) {
        throw new Error(planBody?.error || 'The account plan could not be created')
      }
      const activation = await authClient.organization.setActive({
        organizationId: result.data.id,
      })
      if (activation.error) {
        throw new Error(activation.error.message || 'Organization created, but could not be selected')
      }
      await onChanged()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create the account')
    } finally {
      setBusy('')
    }
  }

  const selectOrganization = async (organizationId: string) => {
    setError('')
    setBusy(organizationId)
    const result = await authClient.organization.setActive({ organizationId })
    if (result.error) {
      setError(result.error.message || 'Could not select the organization')
    } else {
      await onChanged()
    }
    setBusy('')
  }

  const joinOrganization = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy('join')
    try {
      const response = await fetch('/api/organizations/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const body = await response.json().catch(() => null) as (JoinOrganizationResponse & { error?: string }) | null
      if (!response.ok || !body?.organizationId) {
        throw new Error(body?.error || 'Could not join the organization')
      }
      const activation = await authClient.organization.setActive({
        organizationId: body.organizationId,
      })
      if (activation.error) {
        throw new Error(activation.error.message || 'Organization joined, but could not be selected')
      } else {
        await onChanged()
      }
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Could not join the organization')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 py-12 text-white">
      <div className="w-full max-w-[520px] rounded-2xl bg-[var(--color-surface-auth)] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
        <CloudBrand onSelect={onBack} />
        <h1 className="mt-7 text-3xl font-medium tracking-[-0.04em]">Choose how you use Nubols</h1>
        <p className="mt-2 text-sm leading-6 text-white/45">
          Start with your own operator, create a shared organization, or join one with an access code.
        </p>

        <form onSubmit={createAccount} className="mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              { type: 'individual' as const, label: 'Individual', detail: '$9 / month', icon: <UserRound size={16} /> },
              { type: 'organization' as const, label: 'Organization', detail: 'From $10 / month', icon: <Building2 size={16} /> },
            ].filter(option => option.type !== 'individual' || !hasIndividualAccount)).map(option => (
              <button
                key={option.type}
                type="button"
                onClick={() => setAccountType(option.type)}
                className={`relative rounded-xl p-3 text-left transition ${accountType === option.type ? 'bg-white/[0.11] ring-1 ring-white/20' : 'bg-white/[0.035] hover:bg-white/[0.06]'}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-white/80">{option.icon}{option.label}</span>
                <span className="mt-1 block text-xs text-white/35">{option.detail}</span>
                {accountType === option.type && <Check size={13} className="absolute right-3 top-3 text-white/70" />}
              </button>
            ))}
          </div>
          {accountType === 'organization' && (
            <>
              <div className="flex h-11 items-center gap-2.5 rounded-xl bg-[var(--color-surface-field)] px-3.5 text-sm transition focus-within:bg-[var(--color-surface-field-focus)]">
                <Building2 size={15} className="shrink-0 text-white/35" />
                <input
                  value={organizationName}
                  onChange={event => setOrganizationName(event.target.value)}
                  required
                  maxLength={100}
                  autoComplete="organization"
                  placeholder="Organization name"
                  className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/25"
                />
              </div>
              <div className="grid grid-cols-3 rounded-xl bg-white/[0.035] p-1 text-xs">
                {(['team', 'business', 'enterprise'] as const).map(plan => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setOrganizationPlan(plan)}
                    className={`h-9 rounded-lg capitalize transition ${organizationPlan === plan ? 'bg-white/[0.11] text-white/80' : 'text-white/35 hover:text-white/60'}`}
                  >
                    {plan}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            type="submit"
            disabled={Boolean(busy) || (accountType === 'organization' && !organizationName.trim())}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy === 'create' ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            {accountType === 'individual' ? 'Continue as Individual' : `Create ${organizationPlan} organization`}
          </button>
        </form>

        {organizations.length > 0 && (
          <div className="mt-6 space-y-2">
            {organizations.map(organization => (
              <button
                key={organization.id}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => selectOrganization(organization.id)}
                className="group flex w-full items-center gap-3 rounded-xl bg-white/[0.035] p-3 text-left transition hover:bg-white/[0.065] disabled:opacity-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.055] text-white/55">
                  <Building2 size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white/80">{organization.name}</span>
                  <span className="block truncate text-xs text-white/30">{organization.slug}</span>
                </span>
                {busy === organization.id
                  ? <LoaderCircle size={15} className="animate-spin text-white/35" />
                  : <ArrowRight size={15} className="text-white/25 transition-transform group-hover:translate-x-0.5" />}
              </button>
            ))}
          </div>
        )}

        <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.15em] text-white/20">
          <span className="h-px flex-1 bg-white/[0.07]" />
          {organizations.length ? 'or join another' : 'or join an existing organization'}
          <span className="h-px flex-1 bg-white/[0.07]" />
        </div>

        <form onSubmit={joinOrganization} className="space-y-3">
          <div className="flex h-11 items-center gap-2.5 rounded-xl bg-[var(--color-surface-field)] px-3.5 text-sm transition focus-within:bg-[var(--color-surface-field-focus)]">
            <KeyRound size={15} className="shrink-0 text-white/35" />
            <input
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase())}
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="NBL-XXXXXXXXXXXX-XXXXXXXXXXXX"
              className="min-w-0 flex-1 bg-transparent font-mono text-white outline-none placeholder:text-white/25"
            />
          </div>

          {error && <p role="alert" className="text-xs leading-5 text-[var(--color-status-danger)]">{error}</p>}

          <button
            type="submit"
            disabled={Boolean(busy) || !code.trim()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy === 'join' ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            Join organization
          </button>
        </form>

        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void onSignedOut()}
          className="mx-auto mt-6 inline-flex items-center gap-1.5 text-xs text-white/35 transition hover:text-white/70 disabled:opacity-50"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </div>
  )
}
