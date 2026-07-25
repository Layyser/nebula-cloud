import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Building2, LoaderCircle, Plus } from 'lucide-react'
import { NebulaMark } from '@nebula/runtime-ui'
import { authClient } from '../../auth/authClient'
import { AuthLoading } from '../auth/AuthLoading'

export interface CloudOrganization {
  id: string
  name: string
  slug: string
  logo?: string | null
}

interface OrganizationGateProps {
  children: (
    activeOrganization: CloudOrganization,
    organizations: CloudOrganization[],
  ) => ReactNode
}

export function OrganizationGate({ children }: OrganizationGateProps) {
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
      onChanged={async () => {
        await organizationsQuery.refetch()
        await activeQuery.refetch()
      }}
    />
  )
}

function OrganizationSetup({
  organizations,
  onChanged,
}: {
  organizations: CloudOrganization[]
  onChanged: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const suggestedSlug = useMemo(() => toSlug(name), [name])
  const effectiveSlug = slugEdited ? slug : suggestedSlug

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

  const createOrganization = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy('create')
    const result = await authClient.organization.create({
      name: name.trim(),
      slug: effectiveSlug,
    })
    if (result.error || !result.data) {
      setError(result.error?.message || 'Could not create the organization')
    } else {
      const activation = await authClient.organization.setActive({
        organizationId: result.data.id,
      })
      if (activation.error) {
        setError(activation.error.message || 'Organization created, but could not be selected')
      } else {
        await onChanged()
      }
    }
    setBusy('')
  }

  return (
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 py-12 text-white">
      <div className="w-full max-w-[520px] rounded-2xl border border-white/[0.09] bg-[#0d0e0f]/92 p-6 shadow-[0_32px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
        <div className="flex items-center gap-2.5">
          <NebulaMark size={24} />
          <span className="nebula-wordmark text-sm font-semibold">Nebula</span>
        </div>
        <h1 className="mt-7 text-3xl font-medium tracking-[-0.04em]">Choose your organization</h1>
        <p className="mt-2 text-sm leading-6 text-white/45">
          Your organization owns memberships, shared capabilities, governance, and billing.
        </p>

        {organizations.length > 0 && (
          <div className="mt-6 space-y-2">
            {organizations.map(organization => (
              <button
                key={organization.id}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => selectOrganization(organization.id)}
                className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-left transition hover:border-white/[0.14] hover:bg-white/[0.055] disabled:opacity-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.045] text-white/55">
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
          {organizations.length ? 'or create another' : 'create your first organization'}
          <span className="h-px flex-1 bg-white/[0.07]" />
        </div>

        <form onSubmit={createOrganization} className="space-y-3">
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            required
            placeholder="Organization name"
            className="h-11 w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-white/[0.18]"
          />
          <div className="flex h-11 items-center rounded-xl border border-white/[0.09] bg-black/25 px-3.5 text-sm focus-within:border-white/[0.18]">
            <span className="mr-1 text-white/22">nebula.cloud/</span>
            <input
              value={effectiveSlug}
              onChange={event => {
                setSlugEdited(true)
                setSlug(toSlug(event.target.value))
              }}
              required
              placeholder="organization"
              className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/20"
            />
          </div>

          {error && <p role="alert" className="text-xs leading-5 text-red-200/80">{error}</p>}

          <button
            type="submit"
            disabled={Boolean(busy) || !name.trim() || !effectiveSlug}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy === 'create' ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
            Create organization
          </button>
        </form>
      </div>
    </div>
  )
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}
