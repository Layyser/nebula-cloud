import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type {
  OrganizationUsageResponse,
  PersonalUsageResponse,
  UsageTotals,
} from '@nebula-cloud/contracts'
import {
  Button,
  ContentContainer,
  IconButton,
  PageHeader,
  ScrollArea,
  Surface,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@nebula/runtime-ui'
import { CircleAlert, RefreshCw, X } from 'lucide-react'
import { BsAnthropic, BsOpenai } from 'react-icons/bs'
import { SiX } from 'react-icons/si'
import { FcGoogle } from 'react-icons/fc'
import type { IconType } from 'react-icons'

interface DashboardProps {
  userName: string
  userKey: string
  organizationId: string
  organizationName: string
  onClose?: () => void
}

type ReadyUsageState = {
  status: 'ready'
  personal: PersonalUsageResponse
  organization: OrganizationUsageResponse | null
}

type UsageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ReadyUsageState

type UsageRange = 7 | 30 | 90
type UsageMetric = 'cost' | 'tokens'
type BreakdownMode = 'model' | 'day' | 'sessions'

const MODEL_COLORS = [
  'var(--color-data-series-1)',
  'var(--color-data-series-2)',
  'var(--color-data-series-3)',
  'var(--color-data-series-4)',
  'var(--color-data-series-5)',
  'var(--color-data-series-6)',
  'var(--color-data-series-7)',
] as const

const OpenCodeIcon: IconType = props => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M19.4004 21H5V3H19.4004V6.59961H8.59961V17.4004H15.7998V13.7998H12.2002V10.2002H19.4004V21Z"
      fill="currentColor"
    />
  </svg>
)

const usageSnapshotCache = new Map<string, ReadyUsageState>()

function usageSnapshotKey(userKey: string, organizationId: string, rangeDays: UsageRange) {
  return `${userKey}:${organizationId}:${rangeDays}`
}

export function Dashboard({ userKey, organizationId, organizationName, onClose }: DashboardProps) {
  const [rangeDays, setRangeDays] = useState<UsageRange>(30)
  const [metric, setMetric] = useState<UsageMetric>('tokens')
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>('model')
  const [usage, setUsage] = useState<UsageState>(() => (
    usageSnapshotCache.get(usageSnapshotKey(userKey, organizationId, 30))
      ?? { status: 'loading' }
  ))
  const [usageRevision, setUsageRevision] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshTurns, setRefreshTurns] = useState(0)
  const requestSequence = useRef(0)
  const reduceMotion = useReducedMotion()

  const loadUsage = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++requestSequence.current
    const cacheKey = usageSnapshotKey(userKey, organizationId, rangeDays)
    setIsRefreshing(true)

    try {
      const personalResponse = await fetch(`/api/usage/me?days=${rangeDays}`, {
        credentials: 'include',
        signal,
      })
      if (!personalResponse.ok) {
        throw new Error(await responseMessage(personalResponse, 'Could not load usage'))
      }
      const personal = await personalResponse.json() as PersonalUsageResponse

      const organizationResponse = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/usage?days=${rangeDays}`,
        { credentials: 'include', signal },
      )
      let organization: OrganizationUsageResponse | null = null
      if (organizationResponse.ok) {
        organization = await organizationResponse.json() as OrganizationUsageResponse
      } else if (organizationResponse.status !== 403 && organizationResponse.status !== 404) {
        throw new Error(await responseMessage(
          organizationResponse,
          'Could not load organization usage',
        ))
      }

      if (requestId === requestSequence.current) {
        const nextUsage: ReadyUsageState = { status: 'ready', personal, organization }
        const previousUsage = usageSnapshotCache.get(cacheKey)
        const changed = previousUsage !== undefined
          && JSON.stringify(previousUsage) !== JSON.stringify(nextUsage)
        usageSnapshotCache.set(cacheKey, nextUsage)
        setUsage(nextUsage)
        if (changed) setUsageRevision(revision => revision + 1)
      }
    } catch (error) {
      if (signal?.aborted || requestId !== requestSequence.current) return
      if (!usageSnapshotCache.has(cacheKey)) {
        setUsage({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not load usage',
        })
      }
    } finally {
      if (requestId === requestSequence.current) setIsRefreshing(false)
    }
  }, [organizationId, rangeDays, userKey])

  useEffect(() => {
    const controller = new AbortController()
    const cached = usageSnapshotCache.get(
      usageSnapshotKey(userKey, organizationId, rangeDays),
    )
    setUsage(cached ?? { status: 'loading' })
    void loadUsage(controller.signal)
    return () => controller.abort()
  }, [loadUsage, organizationId, rangeDays, userKey])

  return (
    <ContentContainer asChild gutter="workspace" spacing="page" width="workspace">
      <main>
        <PageHeader
          title="Usage"
          description="Track model activity across your Nebula sessions."
          action={(
            <div className="flex items-center gap-4">
              <Tabs value={String(rangeDays)} onValueChange={value => setRangeDays(Number(value) as UsageRange)}>
                <TabsList aria-label="Usage period" variant="panel" size="compact">
                  {[7, 30, 90].map(days => (
                    <TabsTrigger key={days} value={String(days)} className="min-w-16 px-3">
                      {days} days
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Button
                variant="primary"
                onClick={() => {
                  setRefreshTurns(turns => turns + 1)
                  void loadUsage()
                }}
                disabled={isRefreshing}
              >
                <RefreshCw
                  size={13}
                  style={{
                    transform: `rotate(${refreshTurns * 360}deg)`,
                    transition: 'transform 450ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                />
                Refresh
              </Button>
              {onClose && (
                <IconButton label="Back to Dashboard" variant="primary" onClick={onClose}>
                  <X size={16} />
                </IconButton>
              )}
            </div>
          )}
        />

        {usage.status === 'loading' && <DashboardLoading />}
        {usage.status === 'error' && (
          <DashboardError message={usage.message} onRetry={() => void loadUsage()} />
        )}
        {usage.status === 'ready' && (
          <motion.div
            key={`${userKey}:${organizationId}:${rangeDays}:${usageRevision}`}
            initial={reduceMotion ? false : { opacity: 0.72, filter: 'blur(2px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <UsageOverview
              personal={usage.personal}
              organization={usage.organization}
              organizationName={organizationName}
              metric={metric}
              onMetricChange={setMetric}
              breakdownMode={breakdownMode}
              onBreakdownModeChange={setBreakdownMode}
            />
          </motion.div>
        )}
      </main>
    </ContentContainer>
  )
}

function UsageOverview({
  personal,
  organization,
  organizationName,
  metric,
  onMetricChange,
  breakdownMode,
  onBreakdownModeChange,
}: {
  personal: PersonalUsageResponse
  organization: OrganizationUsageResponse | null
  organizationName: string
  metric: UsageMetric
  onMetricChange: (metric: UsageMetric) => void
  breakdownMode: BreakdownMode
  onBreakdownModeChange: (mode: BreakdownMode) => void
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-10">
      <section className="grid gap-10 pt-5 lg:h-[360px] lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.28fr)]">
        <div className="flex max-h-[430px] min-h-0 flex-col overflow-hidden lg:h-full lg:max-h-none">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">
            {metric === 'cost' ? 'Estimated model cost' : 'Processed tokens'}
          </p>
          <p className="mt-2 text-[clamp(2rem,3.4vw,3rem)] font-medium leading-none tracking-[-0.05em] text-[var(--color-text-primary)]">
            {metric === 'cost'
              ? `${formatCurrencyMicrousd(personal.totals.estimatedCostMicrousd)}*`
              : formatCompactNumber(personal.totals.totalTokens)}
          </p>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            {metric === 'cost'
              ? '* Estimated at public API rates.'
              : `Across ${formatNumber(personal.sessions.length)} active ${plural(personal.sessions.length, 'session', 'sessions')}`}
          </p>

          <ModelShares models={personal.models} totals={personal.totals} metric={metric} />
        </div>

        <DailyActivity
          timeline={personal.timeline}
          modelTimeline={personal.modelTimeline ?? []}
          models={personal.models}
          rangeDays={personal.rangeDays}
          metric={metric}
          onMetricChange={onMetricChange}
        />
      </section>

      <MetricStrip
        totals={personal.totals}
        timeline={personal.timeline}
      />

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Breakdown</h2>
          <Tabs value={breakdownMode} onValueChange={value => onBreakdownModeChange(value as BreakdownMode)}>
            <TabsList aria-label="Group usage by" variant="panel" size="compact">
              <TabsTrigger value="model" className="min-w-20 px-3">Model</TabsTrigger>
              <TabsTrigger value="day" className="min-w-20 px-3">Day</TabsTrigger>
              <TabsTrigger value="sessions" className="min-w-20 px-3">Sessions</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <BreakdownTable personal={personal} mode={breakdownMode} metric={metric} />
      </section>

      {organization && (
        <section>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{organizationName}</h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Usage across organization members.</p>
          </div>
          <MemberTable
            members={organization.members}
            currentMembershipId={personal.membershipId}
            metric={metric}
          />
        </section>
      )}
      </div>
    </TooltipProvider>
  )
}

function ModelShares({ models, totals, metric }: {
  models: PersonalUsageResponse['models']
  totals: UsageTotals
  metric: UsageMetric
}) {
  const total = metric === 'cost' ? totals.estimatedCostMicrousd : totals.totalTokens
  return (
    <div className="relative mt-8 min-h-0 flex-1 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="space-y-6 pb-9 pr-5 [mask-image:linear-gradient(to_bottom,#000_0%,#000_calc(100%-2.25rem),transparent_100%)]">
        {models.length === 0 ? (
          <p className="text-xs text-[var(--color-text-subtle)]">Model distribution will appear after the first turn.</p>
        ) : models.map(model => {
          const value = metric === 'cost' ? model.estimatedCostMicrousd : model.totalTokens
          const percentage = total > 0 ? Math.min(100, (value / total) * 100) : 0
          const color = modelColor(model.provider, model.model)
          return (
            <div key={`${model.provider}:${model.model}`}>
              <div className="flex items-center justify-between gap-4 text-sm">
                <ProviderModelLabel provider={model.provider} model={model.model} />
                <span className="shrink-0 tabular-nums text-[var(--color-text-primary)]">
                  {metric === 'cost'
                    ? formatCurrencyMicrousd(value)
                    : formatCompactNumber(value)}
                </span>
              </div>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--color-surface-selected)]">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${percentage}%`, backgroundColor: color }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--color-text-subtle)]">
                {percentage.toFixed(1)}% of {metric === 'cost' ? 'cost' : 'processed tokens'}
                {' · '}{formatCompactNumber(model.totalTokens)} tokens
              </p>
            </div>
          )
        })}
        </div>
      </ScrollArea>
    </div>
  )
}

function providerPresentation(provider: string, model: string): {
  icon: IconType
  color?: string
  label: string
} {
  const providerIdentity = provider.trim().toLowerCase()
  const identity = `${provider} ${model}`.toLowerCase()
  if (
    providerIdentity.includes('opencode')
    || identity.includes('opencode-go/')
    || identity.includes('opencode go')
  ) {
    return { icon: OpenCodeIcon, color: 'var(--color-text-primary)', label: 'OpenCode' }
  }
  if (identity.includes('anthropic') || identity.includes('claude')) {
    return { icon: BsAnthropic, color: '#d97757', label: 'Anthropic' }
  }
  if (identity.includes('google') || identity.includes('gemini')) {
    return { icon: FcGoogle, label: 'Google' }
  }
  if (identity.includes('xai') || identity.includes('grok')) {
    return { icon: SiX, color: 'var(--color-text-primary)', label: 'xAI' }
  }
  if (providerIdentity.includes('codex')) {
    return { icon: BsOpenai, color: 'var(--color-text-primary)', label: 'Codex' }
  }
  return { icon: BsOpenai, color: 'var(--color-text-primary)', label: 'OpenAI' }
}

function ProviderModelLabel({ provider, model }: { provider: string; model: string }) {
  const presentation = providerPresentation(provider, model)
  const ProviderIcon = presentation.icon

  return (
    <span className="flex min-w-0 items-center gap-2.5 leading-none text-[var(--color-text-secondary)]">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex size-4 shrink-0 items-center justify-center leading-none"
            aria-label={`${presentation.label} provider`}
          >
            <ProviderIcon
              aria-hidden="true"
              className="block size-[15px] shrink-0"
              style={presentation.color ? { color: presentation.color } : undefined}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{presentation.label}</TooltipContent>
      </Tooltip>
      <span className="inline-flex min-h-4 items-center truncate leading-4">{displayModelName(model)}</span>
    </span>
  )
}

function modelColor(provider: string, model: string): string {
  const identity = `${provider}:${model}`.toLowerCase()
  let hash = 0
  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash << 5) - hash + identity.charCodeAt(index)) | 0
  }
  return MODEL_COLORS[Math.abs(hash) % MODEL_COLORS.length]
}

function displayModelName(model: string): string {
  const normalized = model.trim()
  if (!normalized) return 'Unknown model'
  if (normalized.toLowerCase().startsWith('opencode-go/')) {
    return normalized.slice('opencode-go/'.length)
  }
  return normalized
}

function DailyActivity({ timeline, modelTimeline, models, rangeDays, metric, onMetricChange }: {
  timeline: PersonalUsageResponse['timeline']
  modelTimeline: PersonalUsageResponse['modelTimeline']
  models: PersonalUsageResponse['models']
  rangeDays: UsageRange
  metric: UsageMetric
  onMetricChange: (metric: UsageMetric) => void
}) {
  const gradientId = useId()
  const visible = useMemo(() => fillTimeline(timeline, rangeDays), [timeline, rangeDays])
  const valueFor = (day: PersonalUsageResponse['timeline'][number]) => (
    metric === 'cost' ? day.estimatedCostMicrousd : day.totalTokens
  )
  const perModelValues = modelTimeline.map(valueFor).filter(value => Number.isFinite(value) && value > 0)
  const maximum = Math.max(1, ...(perModelValues.length > 0 ? perModelValues : visible.map(valueFor)))
  const chartWidth = 1000
  const chartHeight = 252
  const chartLeft = 76
  const chartTop = 12
  const chartBottom = 244
  const series = useMemo(() => buildModelSeries({
    visible,
    modelTimeline,
    models,
    metric,
    chartWidth,
    chartLeft,
    chartTop,
    chartBottom,
    maximum,
  }), [visible, modelTimeline, models, metric, maximum])
  const labelDates = visible.length > 0
    ? [visible[0], visible[Math.floor((visible.length - 1) / 2)], visible.at(-1)!]
    : []
  const axisMarks = [
    { y: chartTop, value: maximum, translate: 'translateY(0)' },
    { y: (chartTop + chartBottom) / 2, value: maximum / 2, translate: 'translateY(-50%)' },
    { y: chartBottom, value: 0, translate: 'translateY(-100%)' },
  ]

  return (
    <div className="flex min-w-0 flex-col lg:h-full">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">
          {metric === 'cost' ? 'Daily cost' : 'Daily tokens'}
        </h2>
        <Tabs value={metric} onValueChange={value => onMetricChange(value as UsageMetric)}>
          <TabsList aria-label="Usage metric" variant="panel" size="compact">
            <TabsTrigger value="cost" className="min-w-16 px-3">Cost</TabsTrigger>
            <TabsTrigger value="tokens" className="min-w-16 px-3">Tokens</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="relative mt-6 h-64 min-w-0 lg:h-auto lg:min-h-0 lg:flex-1">
        {timeline.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-text-subtle)]">
            Usage will appear after the first model turn.
          </div>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-0 z-10 text-[10px] tabular-nums text-[var(--color-text-subtle)]">
              {axisMarks.map(({ y, value, translate }) => (
                <span
                  key={y}
                  className="absolute left-0"
                  style={{
                    top: `${(y / chartHeight) * 100}%`,
                    transform: translate,
                  }}
                >
                  {formatChartAxisValue(value, metric)}
                </span>
              ))}
            </div>
            <svg
              className="h-full w-full overflow-visible"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={metric === 'cost' ? 'Daily estimated model cost' : 'Daily processed tokens'}
            >
            <defs>
              {series.map((item, index) => (
                <linearGradient key={item.key} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={item.color} stopOpacity="0.18" />
                  <stop offset="72%" stopColor={item.color} stopOpacity="0.045" />
                  <stop offset="100%" stopColor={item.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {axisMarks.map(({ y }) => (
              <g key={y}>
                <line
                  x1={chartLeft}
                  x2={chartWidth}
                  y1={y}
                  y2={y}
                  stroke="var(--color-border-subtle)"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}

            {series.map((item, seriesIndex) => (
              <g key={item.key}>
                <path d={item.areaPath} fill={`url(#${gradientId}-${seriesIndex})`} />
                <path
                  d={item.linePath}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 z-20">
              {series.flatMap(item => item.points.map(({ x, y, day, value }) => {
                const provider = providerPresentation(item.provider, item.model)
                return (
                  <Tooltip key={`${item.key}:${day.date}`}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${provider.label} ${displayModelName(item.model)}, ${formatChartDate(day.date)}`}
                        className="group pointer-events-auto absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-default items-center justify-center rounded-full"
                        style={{
                          left: `${(x / chartWidth) * 100}%`,
                          top: `${(y / chartHeight) * 100}%`,
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          style={{ backgroundColor: item.color }}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <span className="font-medium text-[var(--color-text-primary)]">
                        {provider.label} · {displayModelName(item.model)}
                      </span>
                      <span className="ml-1.5 text-[var(--color-text-muted)]">
                        {formatChartDate(day.date)} · {metric === 'cost'
                          ? formatCurrencyMicrousd(value)
                          : `${formatNumber(value)} tokens`}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                )
              }))}
            </div>
          </>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-subtle)]">
        {labelDates.map((day, index) => (
          <span key={day.date} className={index === 1 ? 'text-center' : index === 2 ? 'text-right' : ''}>
            {formatChartDate(day.date)}
          </span>
        ))}
      </div>
    </div>
  )
}

function buildModelSeries({
  visible,
  modelTimeline,
  models,
  metric,
  chartWidth,
  chartLeft,
  chartTop,
  chartBottom,
  maximum,
}: {
  visible: PersonalUsageResponse['timeline']
  modelTimeline: PersonalUsageResponse['modelTimeline']
  models: PersonalUsageResponse['models']
  metric: UsageMetric
  chartWidth: number
  chartLeft: number
  chartTop: number
  chartBottom: number
  maximum: number
}) {
  const valueFor = (usage: UsageTotals) => (
    metric === 'cost' ? usage.estimatedCostMicrousd : usage.totalTokens
  )
  const modelIdentities = new Map<string, { provider: string; model: string }>()
  for (const model of models) {
    modelIdentities.set(modelSeriesKey(model.provider, model.model), {
      provider: model.provider,
      model: model.model,
    })
  }
  for (const day of modelTimeline) {
    const key = modelSeriesKey(day.provider, day.model)
    if (!modelIdentities.has(key)) {
      modelIdentities.set(key, { provider: day.provider, model: day.model })
    }
  }
  const selectedModels = [...modelIdentities.values()]
  const hasPerModelData = modelTimeline.length > 0
  const selectedMetricTotal = models.reduce((total, model) => total + valueFor(model), 0)

  const sources = selectedModels.map(model => {
    const byDate = new Map(
      modelTimeline
        .filter(day => modelSeriesKey(day.provider, day.model) === modelSeriesKey(model.provider, model.model))
        .map(day => [day.date, day]),
    )
    const modelShare = selectedMetricTotal > 0
      ? valueFor(models.find(item => (
          modelSeriesKey(item.provider, item.model) === modelSeriesKey(model.provider, model.model)
        )) ?? EMPTY_USAGE_TOTALS) / selectedMetricTotal
      : 0

    return {
      key: modelSeriesKey(model.provider, model.model),
      provider: model.provider,
      model: model.model,
      color: modelColor(model.provider, model.model),
      // Older cached control-plane responses did not include modelTimeline.
      // Preserve model identity in that compatibility window instead of
      // collapsing every model into a misleading "All models" series.
      values: visible.map(day => hasPerModelData
        ? valueFor(byDate.get(day.date) ?? EMPTY_USAGE_TOTALS)
        : valueFor(day) * modelShare),
    }
  })

  return sources.map(source => {
    const points = visible.map((day, index) => {
      const value = source.values[index] ?? 0
      return {
        x: visible.length <= 1
          ? (chartLeft + chartWidth) / 2
          : chartLeft + (index / (visible.length - 1)) * (chartWidth - chartLeft),
        y: chartBottom - (value / maximum) * (chartBottom - chartTop),
        day,
        value,
      }
    })
    const linePath = smoothLinePath(points)
    return {
      ...source,
      points,
      linePath,
      areaPath: linePath
        ? `${linePath} L ${points.at(-1)?.x ?? chartWidth} ${chartBottom} L ${points[0]?.x ?? 0} ${chartBottom} Z`
        : '',
    }
  })
}

function modelSeriesKey(provider: string, model: string): string {
  return `${provider.trim().toLowerCase()}:${model.trim().toLowerCase()}`
}

const EMPTY_USAGE_TOTALS: UsageTotals = {
  modelTurns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  estimatedCostMicrousd: 0,
  cacheSavingsMicrousd: 0,
}

function smoothLinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]
    const controlX = (previous.x + point.x) / 2
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`
  }, `M ${points[0].x} ${points[0].y}`)
}

function formatChartDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function formatChartAxisValue(value: number, metric: UsageMetric): string {
  return metric === 'cost'
    ? formatCurrencyMicrousd(value)
    : formatCompactNumber(Math.round(value))
}

function MetricStrip({
  totals,
  timeline,
}: {
  totals: UsageTotals
  timeline: PersonalUsageResponse['timeline']
}) {
  const activeDays = Math.max(1, timeline.filter(day => day.modelTurns > 0).length)
  const inputTokens = finiteMetric(totals.inputTokens)
  const cachedTokens = finiteMetric(totals.cachedTokens)
  const outputTokens = finiteMetric(totals.outputTokens)
  const totalTokens = finiteMetric(totals.totalTokens)
  const reasoningTokens = finiteMetric(totals.reasoningTokens)
  const estimatedCostMicrousd = finiteMetric(totals.estimatedCostMicrousd)
  const cacheSavingsMicrousd = finiteMetric(totals.cacheSavingsMicrousd)
  const uncachedInput = Math.max(0, inputTokens - cachedTokens)
  const cachedShare = percentage(cachedTokens, inputTokens)
  const uncachedShare = percentage(uncachedInput, totals.inputTokens)
  const savingsRatio = estimatedCostMicrousd > 0
    ? cacheSavingsMicrousd / estimatedCostMicrousd
    : 0
  const metrics = [
    ['Processed tokens', formatCompactNumber(totalTokens), `${formatCompactNumber(Math.round(totalTokens / activeDays))} per active day`],
    ['Cached input', formatCompactNumber(cachedTokens), `${cachedShare.toFixed(1)}% of observed input`],
    ['Uncached input', formatCompactNumber(uncachedInput), `${uncachedShare.toFixed(1)}% of observed input`],
    ['Output', formatCompactNumber(outputTokens), `includes ${formatCompactNumber(reasoningTokens)} reasoning`],
    ['Cache savings', formatCurrencyMicrousd(cacheSavingsMicrousd), `${savingsRatio.toFixed(1)}x the recorded model cost`],
  ]
  return (
    <Surface density="none" radius="surface" variant="panel" className="grid overflow-hidden sm:grid-cols-2 lg:grid-cols-5">
      {metrics.map(([label, value, detail], index) => (
        <div key={label} className={`min-w-0 px-5 py-4 ${index > 0 ? 'border-t border-[var(--color-border-subtle)] sm:border-l lg:border-t-0' : ''}`}>
          <p className="text-[13px] text-[var(--color-text-muted)]">{label}</p>
          <p className="mt-1.5 text-xl font-medium tabular-nums tracking-[-0.025em] text-[var(--color-text-primary)]">{value}</p>
          <p className="mt-1 text-xs text-[var(--color-text-subtle)]">{detail}</p>
        </div>
      ))}
    </Surface>
  )
}

function BreakdownTable({ personal, mode, metric }: {
  personal: PersonalUsageResponse
  mode: BreakdownMode
  metric: UsageMetric
}) {
  const rows = mode === 'model'
    ? personal.models.map(model => ({
        id: `${model.provider}:${model.model}`,
        label: model.model,
        detail: model.provider,
        ...model,
      }))
    : mode === 'day'
      ? personal.timeline.slice().reverse().map(day => ({
          id: day.date,
          label: formatDay(day.date),
          detail: '',
          ...day,
        }))
      : personal.sessions.map(session => ({
          id: session.sessionId,
          label: session.displayName || `Session ${shortId(session.sessionId)}`,
          detail: '',
          ...session,
        }))

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-5 py-2.5 text-xs text-[var(--color-text-muted)]">
        <span>{mode === 'model' ? 'Model' : mode === 'day' ? 'Day' : 'Session'}</span>
        <span>Turns</span>
        <span className="min-w-24 text-right">{metric === 'cost' ? 'Cost' : 'Tokens'}</span>
      </div>
      {rows.length === 0 ? <EmptyRow label="No model turns have been recorded yet." /> : rows.map(row => (
        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-5 border-t border-[var(--color-border-subtle)] py-3.5 text-sm">
          <div className="min-w-0">
            {mode === 'model' ? (
              <ProviderModelLabel provider={row.detail} model={row.label} />
            ) : (
              <p className="truncate font-medium text-[var(--color-text-secondary)]">{row.label}</p>
            )}
          </div>
          <span className="tabular-nums text-[var(--color-text-muted)]">{formatNumber(row.modelTurns)}</span>
          <span className="min-w-24 text-right tabular-nums text-[var(--color-text-secondary)]">
            {metric === 'cost' ? formatCurrencyMicrousd(row.estimatedCostMicrousd) : formatNumber(row.totalTokens)}
          </span>
        </div>
      ))}
    </div>
  )
}

function MemberTable({
  members,
  currentMembershipId,
  metric,
}: {
  members: OrganizationUsageResponse['members']
  currentMembershipId: string
  metric: UsageMetric
}) {
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-5 py-2.5 text-xs text-[var(--color-text-muted)]">
        <span>Member</span><span>Turns</span><span className="min-w-24 text-right">{metric === 'cost' ? 'Cost' : 'Tokens'}</span>
      </div>
      {members.length === 0 ? <EmptyRow label="No organization usage has been recorded yet." /> : members.map(member => (
        <div key={member.membershipId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-5 border-t border-[var(--color-border-subtle)] py-3.5 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--color-text-secondary)]">
              {member.name || (member.membershipId === currentMembershipId ? 'You' : 'Unknown member')}
              {member.name && member.membershipId === currentMembershipId ? ' (You)' : ''}
            </p>
          </div>
          <span className="tabular-nums text-[var(--color-text-muted)]">{formatNumber(member.modelTurns)}</span>
          <span className="min-w-24 text-right tabular-nums text-[var(--color-text-secondary)]">
            {metric === 'cost' ? formatCurrencyMicrousd(member.estimatedCostMicrousd) : formatNumber(member.totalTokens)}
          </span>
        </div>
      ))}
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return <div className="border-t border-[var(--color-border-subtle)] py-8 text-center text-xs text-[var(--color-text-subtle)]">{label}</div>
}

function DashboardLoading() {
  return (
    <div className="space-y-10 pt-5" aria-label="Loading usage">
      <div className="grid gap-10 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.28fr)]">
        <Surface radius="surface" variant="recessed" className="h-[360px] animate-pulse" />
        <Surface radius="surface" variant="recessed" className="h-[360px] animate-pulse" />
      </div>
      <Surface
        density="none"
        radius="surface"
        variant="panel"
        className="grid overflow-hidden sm:grid-cols-2 lg:grid-cols-5"
      >
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className={`min-w-0 px-5 py-4 ${index > 0 ? 'border-t border-[var(--color-border-subtle)] sm:border-l lg:border-t-0' : ''}`}
          >
            <div className="h-3 w-20 animate-pulse rounded-full bg-[var(--color-surface-selected)]" />
            <div className="mt-2.5 h-5 w-24 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
            <div className="mt-2 h-3 w-28 max-w-full animate-pulse rounded-full bg-[var(--color-surface-selected)]" />
          </div>
        ))}
      </Surface>
    </div>
  )
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Surface density="comfortable" radius="surface" variant="recessed" className="flex min-h-56 items-center justify-center text-center">
      <div className="max-w-md">
        <CircleAlert size={20} className="mx-auto text-[var(--color-status-danger)]" />
        <h2 className="mt-4 text-base font-medium text-[var(--color-text-primary)]">Usage could not be loaded.</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{message}</p>
        <Button variant="primary" radius="marketing-pill" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Surface>
  )
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string }
    return body.error || fallback
  } catch {
    return fallback
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(finiteMetric(value))
}

function formatCompactNumber(value: number): string {
  const normalized = finiteMetric(value)
  return new Intl.NumberFormat('en-US', {
    notation: normalized >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(normalized)
}

function formatCurrencyMicrousd(value: number): string {
  const normalized = finiteMetric(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: normalized > 0 && normalized < 10_000 ? 4 : 2,
  }).format(normalized / 1_000_000)
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

function plural(count: number, singular: string, pluralValue: string): string {
  return count === 1 ? singular : pluralValue
}

function percentage(value: number, total: number): number {
  const normalizedValue = finiteMetric(value)
  const normalizedTotal = finiteMetric(total)
  return normalizedTotal > 0 ? Math.min(100, (normalizedValue / normalizedTotal) * 100) : 0
}

function finiteMetric(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function fillTimeline(
  timeline: PersonalUsageResponse['timeline'],
  rangeDays: UsageRange,
): PersonalUsageResponse['timeline'] {
  const byDate = new Map(timeline.map(day => [day.date, day]))
  const result: PersonalUsageResponse['timeline'] = []
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  for (let offset = rangeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setUTCDate(today.getUTCDate() - offset)
    const key = date.toISOString().slice(0, 10)
    result.push(byDate.get(key) ?? {
      date: key,
      modelTurns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      estimatedCostMicrousd: 0,
      cacheSavingsMicrousd: 0,
    })
  }
  return result
}
