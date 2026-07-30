import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Building2, LoaderCircle, Plus } from 'lucide-react'
import { authClient } from '../../auth/authClient'
import { AuthLoading } from '../auth/AuthLoading'
import { CloudBrand } from '../auth/CloudBrand'
import { ActionButton, IconFrame, SurfacePanel, TextField } from '../ui/CloudUI'

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
    <div className="cloud-state">
      <SurfacePanel className="cloud-organization">
        <CloudBrand onSelect={onBack} />
        <h1 className="cloud-organization__title">Choose your organization</h1>
        <p className="cloud-organization__copy">
          Your organization owns memberships, shared capabilities, governance, and billing.
        </p>

        {organizations.length > 0 && (
          <div className="cloud-organization__list">
            {organizations.map(organization => (
              <button
                key={organization.id}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => selectOrganization(organization.id)}
                className="cloud-organization__option group"
              >
                <IconFrame size="lg">
                  <Building2 size={16} />
                </IconFrame>
                <span className="cloud-organization__identity">
                  <strong>{organization.name}</strong>
                  <small>{organization.slug}</small>
                </span>
                {busy === organization.id
                  ? <LoaderCircle size={15} className="animate-spin text-white/35" />
                  : <ArrowRight size={15} className="text-white/25 transition-transform group-hover:translate-x-0.5" />}
              </button>
            ))}
          </div>
        )}

        <div className="cloud-organization__divider">
          <span />
          {organizations.length ? 'or create another' : 'create your first organization'}
          <span />
        </div>

        <form onSubmit={createOrganization} className="cloud-organization__form">
          <TextField
            value={name}
            onChange={event => setName(event.target.value)}
            required
            placeholder="Organization name"
          />
          <div className="ui-field cloud-slug-field">
            <span>nebula.cloud/</span>
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

          {error && <p role="alert" className="ui-notice ui-notice--error">{error}</p>}

          <ActionButton
            type="submit"
            disabled={Boolean(busy) || !name.trim() || !effectiveSlug}
            tone="primary"
            className="w-full"
          >
            {busy === 'create' ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
            Create organization
          </ActionButton>
        </form>
      </SurfacePanel>
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
