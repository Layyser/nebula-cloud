import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  Check,
  CircleDollarSign,
  Copy,
  Cpu,
  KeyRound,
  MessageSquare,
  PlugZap,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
  Zap,
  X,
} from 'lucide-react'
import type {
  OrganizationAdminResponse,
  OrganizationDashboardResponse,
  OrganizationMember,
  OrganizationMembersResponse,
  OrganizationOperatorsResponse,
  PlanAccountType,
  RotateOrganizationJoinCodeResponse,
} from '@nebula-cloud/contracts'
import {
  Badge,
  Button,
  ContentContainer,
  EmptyState,
  Field,
  IconButton,
  Input,
  MetadataChip,
  PageHeader,
  Spinner,
  StatusBadge,
  Surface,
  WorkspaceCard,
} from '@nebula/runtime-ui'
import { Dashboard as UsageDashboard } from './Dashboard'

type DashboardView = 'home' | 'usage' | 'users' | 'operators' | 'providers' | 'organization'

interface OrganizationDashboardProps {
  userName: string
  userKey: string
  organizationId: string
  organizationName: string
  accountType: PlanAccountType
  previewOverview?: OrganizationDashboardResponse
  previewMembers?: OrganizationMembersResponse
  onBackgroundChange?: (overShader: boolean) => void
}

const documentationUrl = '/docs'

export function OrganizationDashboard(props: OrganizationDashboardProps) {
  const [view, setView] = useState<DashboardView>('home')
  const [overview, setOverview] = useState<LoadState<OrganizationDashboardResponse>>(
    props.previewOverview
      ? { status: 'ready', data: props.previewOverview }
      : { status: 'loading' },
  )
  const reduceMotion = useReducedMotion()

  const loadOverview = useCallback(async () => {
    if (props.previewOverview) {
      setOverview({ status: 'ready', data: props.previewOverview })
      return
    }
    setOverview({ status: 'loading' })
    try {
      setOverview({
        status: 'ready',
        data: await getJson<OrganizationDashboardResponse>(
          `/api/organizations/${encodeURIComponent(props.organizationId)}/dashboard`,
        ),
      })
    } catch (error) {
      setOverview({ status: 'error', message: errorMessage(error) })
    }
  }, [props.organizationId, props.previewOverview])

  useEffect(() => { void loadOverview() }, [loadOverview])

  useEffect(() => {
    props.onBackgroundChange?.(view === 'home')
  }, [props.onBackgroundChange, view])

  useEffect(() => () => {
    props.onBackgroundChange?.(true)
  }, [props.onBackgroundChange])

  if (view === 'usage') {
    return (
      <div className="min-h-full bg-[var(--color-surface-page)]">
        <UsageDashboard
          {...props}
          onClose={() => setView('home')}
        />
      </div>
    )
  }

  if (view !== 'home') {
    return (
      <div className="min-h-full bg-[var(--color-surface-page)]">
        <DashboardSubmenu
          title={viewTitle(view)}
          description={viewDescription(view)}
          onClose={() => setView('home')}
        >
          {view === 'users' && (
            <UsersView
              organizationId={props.organizationId}
              previewMembers={props.previewMembers}
            />
          )}
          {view === 'operators' && <OperatorsView organizationId={props.organizationId} />}
          {view === 'providers' && <ProvidersView />}
          {view === 'organization' && (
            <OrganizationView
              organizationId={props.organizationId}
              fallbackName={props.organizationName}
            />
          )}
        </DashboardSubmenu>
      </div>
    )
  }

  const cards: Array<{
    id: Exclude<DashboardView, 'home'> | 'documentation'
    title: string
    description: string
    icon: ReactNode
    meta?: string
  }> = [
    {
      id: 'usage',
      title: 'Usage',
      description: 'Model activity, cost estimates, cache savings, and session breakdowns.',
      icon: <BarChart3 size={15} />,
    },
    {
      id: 'users',
      title: 'Users',
      description: 'Manage organization members, roles, and workspace access.',
      icon: <UsersRound size={15} />,
    },
    {
      id: 'operators',
      title: 'Operators',
      description: 'Inspect the state of every persistent operator workspace.',
      icon: <Cpu size={15} />,
    },
    {
      id: 'providers',
      title: 'Providers',
      description: 'Organization model access through the upcoming Nubols credential gateway.',
      icon: <PlugZap size={15} />,
    },
    {
      id: 'organization',
      title: 'Organization',
      description: 'Company identity, administrators, and organization access codes.',
      icon: <Building2 size={15} />,
      meta: 'Admin',
    },
    {
      id: 'documentation',
      title: 'Documentation',
      description: 'Open product, runtime, API, and administration documentation.',
      icon: <BookOpen size={15} />,
      meta: 'New window',
    },
  ]
  const visibleCards = cards.filter(card => props.accountType === 'organization'
    || (card.id !== 'users' && card.id !== 'organization'))

  return (
    <div className="relative min-h-full overflow-hidden">
      <ContentContainer asChild gutter="workspace" spacing="page" width="workspace" className="relative z-10">
        <main>
          <PageHeader
            title="Dashboard"
            description={props.accountType === 'individual'
              ? 'Manage your usage, operator, and model providers.'
              : `Manage usage, people, and operators across ${props.organizationName}.`}
            spacing="comfortable"
          />
          <DashboardOverview state={overview} onRetry={loadOverview} />
          <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
            Manage
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleCards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                transition={reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.42, delay: Math.min(index, 8) * 0.045, ease: [0.22, 1, 0.36, 1] }}
              >
                <WorkspaceCard
                  className="h-full"
                  icon={card.icon}
                  title={card.title}
                  description={card.description}
                  footer={card.meta ? <Badge>{card.meta}</Badge> : undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDashboardCard(card.id, setView)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openDashboardCard(card.id, setView)
                    }
                  }}
                />
              </motion.div>
            ))}
          </div>
        </main>
      </ContentContainer>
    </div>
  )
}

function DashboardOverview({
  state,
  onRetry,
}: {
  state: LoadState<OrganizationDashboardResponse>
  onRetry: () => void | Promise<void>
}) {
  if (state.status === 'loading') {
    return (
      <section aria-label="Loading dashboard overview" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Surface key={index} bordered variant="panel" density="none" radius="surface" className="h-28 animate-pulse shadow-[var(--shadow-surface)]" />
        ))}
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <Surface bordered variant="panel" density="comfortable" radius="surface" className="flex items-center justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Overview unavailable</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{state.message}</p>
        </div>
        <Button variant="secondary" size="compact" onClick={() => { void onRetry() }}>Try again</Button>
      </Surface>
    )
  }

  const data = state.data
  const metrics = [
    {
      label: data.scope === 'organization' ? 'Entitled users' : 'Your entitlement',
      value: data.scope === 'organization'
        ? formatDashboardNumber(data.entitledMembers)
        : data.entitledMembers > 0 ? 'Active' : 'Missing',
      detail: 'Active or grace',
      icon: <UsersRound size={14} />,
    },
    {
      label: 'Ready operators',
      value: `${formatDashboardNumber(data.operators.ready)} / ${formatDashboardNumber(data.operators.total)}`,
      detail: data.scope === 'organization' ? 'Organization scope' : 'Your operator',
      icon: <Cpu size={14} />,
    },
    {
      label: 'Sessions',
      value: formatDashboardNumber(data.usage.sessions),
      detail: 'Last 30 days',
      icon: <MessageSquare size={14} />,
    },
    {
      label: 'Model turns',
      value: formatDashboardNumber(data.usage.modelTurns),
      detail: 'Last 30 days',
      icon: <Zap size={14} />,
    },
    {
      label: 'Tokens',
      value: formatDashboardCompactNumber(data.usage.totalTokens),
      detail: 'Input + output',
      icon: <Activity size={14} />,
    },
    {
      label: 'Estimated cost',
      value: formatDashboardCost(data.usage.estimatedCostMicrousd),
      detail: 'Public API rates',
      icon: <CircleDollarSign size={14} />,
    },
    {
      label: 'Provisioning failures',
      value: formatDashboardNumber(data.provisioningFailures),
      detail: 'Last 30 days',
      icon: <TriangleAlert size={14} />,
    },
    {
      label: 'Worker health',
      value: `${formatDashboardNumber(data.workers.healthy)} / ${formatDashboardNumber(data.workers.total)}`,
      detail: 'Assigned workers',
      icon: <Server size={14} />,
    },
  ]

  return (
    <section aria-label="Dashboard overview" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {metrics.map(metric => (
        <Surface key={metric.label} bordered variant="panel" density="default" radius="surface" className="min-w-0 shadow-[var(--shadow-surface)]">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-subtle)]">
            {metric.icon}
            <span className="truncate">{metric.label}</span>
          </div>
          <p className="mt-4 truncate text-xl font-medium tabular-nums tracking-[-0.035em] text-[var(--color-text-primary)]">
            {metric.value}
          </p>
          <p className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">{metric.detail}</p>
        </Surface>
      ))}
    </section>
  )
}

function formatDashboardNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Number.isFinite(value) ? value : 0))
}

function formatDashboardCompactNumber(value: number): string {
  const normalized = Math.max(0, Number.isFinite(value) ? value : 0)
  return new Intl.NumberFormat('en-US', {
    notation: normalized >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(normalized)
}

function formatDashboardCost(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 10_000 ? 4 : 2,
  }).format(Math.max(0, Number.isFinite(value) ? value : 0) / 1_000_000)
}

function DashboardSubmenu({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <ContentContainer asChild gutter="workspace" spacing="page" width="workspace">
      <main>
        <PageHeader
          title={title}
          description={description}
          action={<CloseButton onClick={onClose} />}
        />
        {children}
      </main>
    </ContentContainer>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Back to Dashboard" variant="primary" onClick={onClick}>
      <X size={16} />
    </IconButton>
  )
}

function openDashboardCard(
  id: Exclude<DashboardView, 'home'> | 'documentation',
  setView: (view: DashboardView) => void,
) {
  if (id === 'documentation') {
    window.open(documentationUrl, '_blank', 'noopener,noreferrer')
    return
  }
  setView(id)
}

function UsersView({
  organizationId,
  previewMembers,
}: {
  organizationId: string
  previewMembers?: OrganizationMembersResponse
}) {
  const [state, setState] = useState<LoadState<OrganizationMembersResponse>>(
    previewMembers ? { status: 'ready', data: previewMembers } : { status: 'loading' },
  )
  const [pendingMember, setPendingMember] = useState('')
  const load = useCallback(async () => {
    if (previewMembers) {
      setState({ status: 'ready', data: previewMembers })
      return
    }
    setState({ status: 'loading' })
    try {
      setState({ status: 'ready', data: await getJson<OrganizationMembersResponse>(`/api/organizations/${encodeURIComponent(organizationId)}/members`) })
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error) })
    }
  }, [organizationId, previewMembers])
  useEffect(() => { void load() }, [load])

  const toggle = async (member: OrganizationMember) => {
    setPendingMember(member.membershipId)
    try {
      const updated = await getJson<OrganizationMember>(
        `/api/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(member.membershipId)}`,
        { method: 'PATCH', body: JSON.stringify({ disabled: !member.disabled }) },
      )
      setState(current => current.status === 'ready'
        ? { ...current, data: { ...current.data, members: current.data.members.map(item => item.membershipId === updated.membershipId ? updated : item) } }
        : current)
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error) })
    } finally {
      setPendingMember('')
    }
  }

  const updatePaidSeat = async (member: OrganizationMember, assigned: boolean) => {
    if (previewMembers) return
    setPendingMember(`seat:${member.membershipId}`)
    try {
      await getJson(
        `/api/organizations/${encodeURIComponent(organizationId)}/entitlements/operator/${encodeURIComponent(member.membershipId)}`,
        { method: assigned ? 'DELETE' : 'PUT' },
      )
      await load()
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error) })
    } finally {
      setPendingMember('')
    }
  }

  return <LoadBoundary state={state} onRetry={load}>{data => data.members.length === 0 ? (
    <EmptyState appearance="panel" size="page" title="No organization members" description="Members will appear here after joining this organization." />
  ) : (
    <div className="space-y-3">
      {data.operatorSeats && (
        <Surface bordered variant="panel" density="default" radius="surface" className="flex flex-wrap items-center gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]">
            <CircleDollarSign size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm text-[var(--color-text-primary)]">Operator seats</strong>
            <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
              {data.operatorSeats.assigned} of {data.operatorSeats.purchased} purchased seats assigned
              {data.operatorSeats.paymentState === 'grace' && data.operatorSeats.graceEndsAt
                ? ` · Payment grace ends ${new Date(data.operatorSeats.graceEndsAt).toLocaleDateString()}`
                : ''}
            </span>
          </span>
          <StatusBadge tone={data.operatorSeats.paymentState === 'current' ? 'success' : data.operatorSeats.paymentState === 'grace' ? 'warning' : 'danger'}>
            {data.operatorSeats.paymentState === 'current' ? 'Paid' : data.operatorSeats.paymentState === 'grace' ? 'Payment grace' : 'Payment overdue'}
          </StatusBadge>
        </Surface>
      )}
      {data.members.map(member => (
        <Surface key={member.membershipId} bordered variant="panel" density="default" radius="surface" className="flex flex-wrap items-center gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-sm font-semibold text-[var(--color-text-primary)]">
            {member.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <strong className="truncate text-sm text-[var(--color-text-primary)]">{member.name}</strong>
              <Badge>{member.role}</Badge>
            </span>
            <span className="mt-1 block truncate text-xs text-[var(--color-text-muted)]">{member.email}</span>
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusBadge tone={member.disabled ? 'danger' : 'success'}>
              {member.disabled ? 'Disabled' : 'Active'}
            </StatusBadge>
            <StatusBadge tone={member.operatorEntitlement && member.operatorEntitlement.state !== 'revoked'
              ? member.operatorEntitlement.state === 'suspended'
                ? 'danger'
                : member.operatorEntitlement.state === 'grace' ? 'warning' : 'success'
              : 'neutral'}>
              {member.operatorEntitlement && member.operatorEntitlement.state !== 'revoked'
                ? member.operatorEntitlement.source === 'stripe'
                  ? member.operatorEntitlement.state === 'suspended'
                    ? 'Seat suspended'
                    : member.operatorEntitlement.state === 'grace' ? 'Paid seat · grace' : 'Paid seat'
                  : `${member.operatorEntitlement.source} access`
                : 'No Operator seat'}
            </StatusBadge>
          </div>
          {data.operatorSeats && (() => {
            const assigned = Boolean(
              member.operatorEntitlement?.source === 'stripe'
              && member.operatorEntitlement.state !== 'revoked',
            )
            if (member.disabled && !assigned) return null
            const capacityReached = data.operatorSeats.assigned >= data.operatorSeats.purchased
            return (
              <Button
                variant={assigned ? 'secondary' : 'primary'}
                size="compact"
                disabled={pendingMember === `seat:${member.membershipId}` || (!assigned && capacityReached)}
                onClick={() => { void updatePaidSeat(member, assigned) }}
              >
                {pendingMember === `seat:${member.membershipId}` ? <Spinner size="compact" label="Updating paid seat" /> : null}
                {assigned ? 'Remove seat' : 'Assign seat'}
              </Button>
            )
          })()}
          {member.role !== 'owner' && (
            <Button variant={member.disabled ? 'secondary' : 'danger'} size="compact" disabled={pendingMember === member.membershipId} onClick={() => { void toggle(member) }}>
              {pendingMember === member.membershipId ? <Spinner size="compact" label="Updating member" /> : null}
              {member.disabled ? 'Enable' : 'Disable'}
            </Button>
          )}
        </Surface>
      ))}
    </div>
  )}</LoadBoundary>
}

function OperatorsView({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<LoadState<OrganizationOperatorsResponse>>({ status: 'loading' })
  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'ready', data: await getJson<OrganizationOperatorsResponse>(`/api/organizations/${encodeURIComponent(organizationId)}/operators`) })
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error) })
    }
  }, [organizationId])
  useEffect(() => { void load() }, [load])

  return <LoadBoundary state={state} onRetry={load}>{data => data.operators.length === 0 ? (
    <EmptyState appearance="panel" size="page" title="No operators yet" description="Persistent operator workspaces will appear here once members start using Nubols." />
  ) : (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.operators.map(operator => (
        <WorkspaceCard
          key={operator.membershipId}
          icon={<Cpu size={15} />}
          title={operator.name}
          description={operator.email}
          badge={(
            <StatusBadge tone={operator.state === 'ready' ? 'success' : operator.state === 'failed' ? 'danger' : 'neutral'}>
              {operator.state.replace('_', ' ')}
            </StatusBadge>
          )}
          footer={<MetadataChip>{operator.workspaceId ? 'Persistent workspace assigned' : 'Workspace not created'}</MetadataChip>}
        />
      ))}
    </div>
  )}</LoadBoundary>
}

function ProvidersView() {
  return (
    <EmptyState
      appearance="panel"
      size="page"
      icon={<ShieldCheck size={20} />}
      title="Cloud credential gateway"
      description="Organization API keys will be held by Nubols and used through a scoped provider proxy. Real credentials will never be injected into an operator environment or returned to a browser. This gateway is not configured in this release."
    />
  )
}

function OrganizationView({ organizationId, fallbackName }: { organizationId: string; fallbackName: string }) {
  const [state, setState] = useState<LoadState<OrganizationAdminResponse>>({ status: 'loading' })
  const [name, setName] = useState(fallbackName)
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState(false)
  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const data = await getJson<OrganizationAdminResponse>(`/api/organizations/${encodeURIComponent(organizationId)}/admin`)
      setName(data.organization.name)
      setState({ status: 'ready', data })
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error) })
    }
  }, [organizationId])
  useEffect(() => { void load() }, [load])

  const rotateCode = async () => {
    setBusy('code')
    try {
      const response = await getJson<RotateOrganizationJoinCodeResponse>(`/api/organizations/${encodeURIComponent(organizationId)}/admin/join-code`, { method: 'POST' })
      setState(current => current.status === 'ready' ? { ...current, data: { ...current.data, joinCode: response.joinCode } } : current)
    } finally { setBusy('') }
  }

  const saveName = async () => {
    setBusy('name')
    try {
      await getJson(`/api/organizations/${encodeURIComponent(organizationId)}`, { method: 'PATCH', body: JSON.stringify({ name }) })
      setState(current => current.status === 'ready' ? { ...current, data: { ...current.data, organization: { ...current.data.organization, name: name.trim() } } } : current)
    } finally { setBusy('') }
  }

  return <LoadBoundary state={state} onRetry={load}>{data => (
    <div className="grid gap-4 xl:grid-cols-2">
      <Surface bordered variant="panel" density="comfortable" radius="surface">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"><Building2 size={16} /> Company information</div>
        <div className="mt-6 flex items-end gap-2">
          <Field label="Organization name" className="min-w-0 flex-1">
            <Input value={name} onChange={event => setName(event.target.value)} />
          </Field>
          <Button variant="primary" onClick={() => { void saveName() }} disabled={busy === 'name' || !name.trim()}>Save</Button>
        </div>
        <MetadataChip className="mt-3">Slug: {data.organization.slug}</MetadataChip>
      </Surface>

      <Surface bordered variant="panel" density="comfortable" radius="surface">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"><KeyRound size={16} /> Organization access code</div>
        {data.joinCode ? (
          <div className="mt-6 flex items-end gap-2">
            <Field label="Access code" className="min-w-0 flex-1">
              <Input value={data.joinCode} readOnly className="font-mono" />
            </Field>
            <IconButton label="Copy organization code" variant="recessed" onClick={() => { void navigator.clipboard.writeText(data.joinCode!); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </IconButton>
          </div>
        ) : <p className="mt-6 text-sm text-[var(--color-text-muted)]">Generate a code for people joining this organization.</p>}
        <Button className="mt-4" variant="secondary" onClick={() => { void rotateCode() }} disabled={busy === 'code'}>
          {busy === 'code' ? <Spinner size="compact" label="Updating access code" /> : <RefreshCw size={14} />}
          {data.joinCode ? 'Regenerate code' : 'Generate code'}
        </Button>
      </Surface>

      <Surface bordered variant="panel" density="comfortable" radius="surface" className="xl:col-span-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"><ShieldCheck size={16} /> Administrators</div>
        <div className="mt-5 divide-y divide-[var(--color-border-subtle)]">
          {data.admins.map(admin => (
            <div key={admin.membershipId} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div><p className="text-sm text-[var(--color-text-primary)]">{admin.name}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{admin.email}</p></div>
              <Badge>{admin.role}</Badge>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  )}</LoadBoundary>
}

type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }

function LoadBoundary<T>({ state, onRetry, children }: { state: LoadState<T>; onRetry: () => void | Promise<void>; children: (data: T) => ReactNode }) {
  if (state.status === 'loading') return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[0, 1, 2, 3].map(item => <Surface key={item} bordered variant="panel" density="none" radius="surface" className="h-28 animate-pulse" />)}
    </div>
  )
  if (state.status === 'error') return (
    <EmptyState
      appearance="panel"
      size="page"
      title="Organization data could not be loaded"
      description={state.message}
      action={<Button variant="primary" onClick={() => { void onRetry() }}>Try again</Button>}
    />
  )
  return children(state.data)
}

async function getJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
    ...init,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || `Request failed (${response.status})`)
  }
  return await response.json() as T
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The organization data could not be loaded'
}

function viewTitle(view: Exclude<DashboardView, 'home' | 'usage'>) {
  return ({ users: 'Users', operators: 'Operators', providers: 'Providers', organization: 'Organization' })[view]
}

function viewDescription(view: Exclude<DashboardView, 'home' | 'usage'>) {
  return ({
    users: 'Manage the people who can access this organization.',
    operators: 'Inspect persistent workspaces without mixing infrastructure with membership.',
    providers: 'Control organization model access without exposing provider credentials.',
    organization: 'Manage company identity, administrators, and access codes.',
  })[view]
}
