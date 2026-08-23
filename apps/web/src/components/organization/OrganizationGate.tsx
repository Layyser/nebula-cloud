import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Building2, KeyRound, LoaderCircle } from 'lucide-react'
import type { JoinOrganizationResponse } from '@nebula-cloud/contracts'
import { authClient } from '../../auth/authClient'
import { AuthLoading } from '../auth/AuthLoading'
import { CloudBrand } from '../auth/CloudBrand'

export interface CloudOrganization {
  id: string
  name: string
  slug: string
  logo?: string | null
}

interface OrganizationGateProps {
  onBack: () => void
  children: (
    activeOrganization: CloudOrganization,
    organizations: CloudOrganization[],
  ) => ReactNode
}

export function OrganizationGate({ children, onBack }: OrganizationGateProps) {
  const organizationsQuery = authClient.useListOrganizations()
  const activeQuery = authClient.useActiveOrganization()
  const organizations = (organizationsQuery.data || []) as CloudOrganization[]
  const activeOrganization = activeQuery.data as CloudOrganization | null | undefined

  if (organizationsQuery.isPending || activeQuery.isPending) {
    return <AuthLoading label="Loading organization" />
  }

  if (activeOrganization) {
    return children(activeOrganization, organizations)
  }

  return (
    <OrganizationSetup
      organizations={organizations}
      onBack={onBack}
      onChanged={async () => {
        await organizationsQuery.refetch()
        await activeQuery.refetch()
      }}
    />
  )
}

export function OrganizationSetup({
  organizations,
  onChanged,
  onBack,
}: {
  organizations: CloudOrganization[]
  onChanged: () => Promise<void>
  onBack: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

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
        <h1 className="mt-7 text-3xl font-medium tracking-[-0.04em]">Join your organization</h1>
        <p className="mt-2 text-sm leading-6 text-white/45">
          Select an existing membership or enter the access code provided by an administrator.
        </p>

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
          {organizations.length ? 'or join another' : 'organization access'}
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
      </div>
    </div>
  )
}
