import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Building2,
  Cpu,
  HardDrive,
  MemoryStick,
  LayoutDashboard,
  LogOut,
  PlugZap,
  Palette,
  RotateCw,
  Settings,
  Terminal,
  UserRound,
} from 'lucide-react'
import {
  Button,
  AppearanceSettings,
  NebulaBackground,
  ProviderSettings,
  RuntimeWorkspace,
  SettingsShell,
  Surface,
  type RuntimeNavigationItem,
  type SettingsSection,
} from '@nebula/runtime-ui'
import type { RuntimeTransport } from '@nebula/runtime-ui/transport'
import type { OperatorRuntimeResponse } from '@nebula-cloud/contracts'
import { authClient } from './auth/authClient'
import {
  authenticationRedirect,
  isAuthenticationCallback,
} from './auth/authRouting'
import {
  clearSessionExpired,
  consumeSessionExpired,
  rememberSessionExpired,
  sessionExpiredEvent,
} from './auth/sessionLifecycle'
import { AuthLoading } from './components/auth/AuthLoading'
import { AuthPage } from './components/auth/AuthPage'
import { VerificationResultPage } from './components/auth/VerificationResultPage'
import { OrganizationDashboard } from './components/cloud/OrganizationDashboard'
import { InvitationPage } from './components/organization/InvitationPage'
import { WorkspaceStartup } from './components/cloud/WorkspaceStartup'
import { ContactPage } from './components/contact/ContactPage'
import { DocsPage } from './components/docs/DocsPage'
import { LandingPage } from './components/landing/LandingPage'
import { LegalPage } from './components/legal/LegalPage'
import { PlansPage } from './components/plans/PlansPage'
import {
  OrganizationGate,
  type CloudOrganization,
} from './components/organization/OrganizationGate'
import { createCloudRuntimeTransport } from './runtime/cloudRuntimeTransport'
import {
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  getOperatorRuntime,
  restartWorkspace,
} from './runtime/personalWorkspace'
import {
  startPersonalWorkspace,
  WorkspaceStartupError,
  type WorkspaceStartupProgress,
} from './runtime/workspaceStartup'

const runtimeGatewayBase = import.meta.env.VITE_NEBULA_RUNTIME_GATEWAY_BASE || '/api/workspaces'
const TerminalPage = lazy(async () => {
  const module = await import('./components/cloud/TerminalPage')
  return { default: module.TerminalPage }
})

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const update = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  const navigate = useCallback((path: string) => {
    if (window.location.pathname !== path) window.history.pushState(null, '', path)
    setPathname(path)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  return { pathname, navigate }
}

export default function App() {
  const { pathname, navigate } = usePathname()
  const [cloudBackgroundVisible, setCloudBackgroundVisible] = useState(true)
  const cloudRoute = pathname === '/login'
    || pathname === '/reset-password'
    || pathname === '/invite'
    || pathname === '/verify-email'
    || pathname.startsWith('/app')
    || isAuthenticationCallback(pathname)
  const plansRoute = pathname === '/plans' || pathname === '/pricing'
  const docsRoute = pathname === '/docs'
  const legalRoute = pathname === '/legal'
  const contactRoute = pathname === '/contact'
  const plainPublicRoute = plansRoute || docsRoute || legalRoute || contactRoute

  useEffect(() => {
    if (pathname === '/pricing') navigate('/plans')
  }, [navigate, pathname])

  useEffect(() => {
    if (!cloudRoute) setCloudBackgroundVisible(true)
  }, [cloudRoute])

  return (
    <PageBackground
      scrollReactive={!cloudRoute && !plainPublicRoute}
      visible={!plainPublicRoute && (!cloudRoute || cloudBackgroundVisible)}
    >
      {cloudRoute ? (
        <CloudSessionRoute
          pathname={pathname}
          navigate={navigate}
          onBackgroundVisibilityChange={setCloudBackgroundVisible}
        />
      ) : plansRoute ? (
        <PlansPage onLaunch={() => navigate('/login')} />
      ) : docsRoute ? (
        <DocsPage onLaunch={() => navigate('/login')} />
      ) : legalRoute ? (
        <LegalPage onLaunch={() => navigate('/login')} />
      ) : contactRoute ? (
        <ContactPage onLaunch={() => navigate('/login')} />
      ) : (
        <LandingPage onLaunch={() => navigate('/login')} />
      )}
    </PageBackground>
  )
}

export function PageBackground({ children, scrollReactive, visible = true }: { children: ReactNode; scrollReactive: boolean; visible?: boolean }) {
  return (
    <>
      {visible && <NebulaBackground fade={0} variant="classic" palette="graphite" resolutionScale={0.5} scrollReactive={scrollReactive} />}
      {visible && <div aria-hidden="true" className="page-shader-vignette pointer-events-none fixed inset-0 z-[1]" />}
      {visible && !scrollReactive && <div aria-hidden="true" className="shader-bottom-fade pointer-events-none fixed inset-x-0 bottom-0 z-[1]" />}
      {children}
    </>
  )
}

function CloudSessionRoute({
  pathname,
  navigate,
  onBackgroundVisibilityChange,
}: {
  pathname: string
  navigate: (path: string) => void
  onBackgroundVisibilityChange: (visible: boolean) => void
}) {
  const sessionQuery = authClient.useSession()
  const hadSession = useRef(false)
  const [sessionExpired, setSessionExpired] = useState(
    () => consumeSessionExpired(),
  )

  useEffect(() => {
    if (!sessionQuery.data) onBackgroundVisibilityChange(true)
  }, [onBackgroundVisibilityChange, sessionQuery.data])

  useEffect(() => {
    const handleSessionExpired = () => {
      setSessionExpired(true)
      void sessionQuery.refetch().catch(() => navigate('/login'))
    }
    window.addEventListener(sessionExpiredEvent, handleSessionExpired)
    return () => {
      window.removeEventListener(sessionExpiredEvent, handleSessionExpired)
    }
  }, [navigate, sessionQuery])

  useEffect(() => {
    if (sessionQuery.isPending) return
    if (sessionQuery.data) {
      hadSession.current = true
    } else if (hadSession.current && pathname !== '/login') {
      rememberSessionExpired()
      setSessionExpired(true)
    }
    const redirect = authenticationRedirect({
      pathname,
      pending: sessionQuery.isPending,
      authenticated: Boolean(sessionQuery.data),
    })
    if (redirect) navigate(redirect)
  }, [navigate, pathname, sessionQuery.data, sessionQuery.isPending])

  if (sessionQuery.isPending) {
    return <AuthLoading />
  }
  if (!sessionQuery.data) {
    if (isAuthenticationCallback(pathname)) {
      return <AuthLoading label="Completing sign in" />
    }
    if (pathname === '/verify-email') {
      return (
        <VerificationResultPage
          errorCode={new URLSearchParams(window.location.search).get('error') || ''}
          authenticated={false}
          onBack={() => navigate('/')}
          onContinue={() => navigate('/login')}
        />
      )
    }
    return (
      <AuthPage
        onBack={() => navigate('/')}
        initialMode={pathname === '/reset-password' ? 'reset-password' : 'sign-in'}
        resetToken={pathname === '/reset-password'
          ? new URLSearchParams(window.location.search).get('token') || ''
          : undefined}
        onAuthenticated={() => {
          clearSessionExpired()
          setSessionExpired(false)
          void sessionQuery.refetch().then(() => navigate(
            pathname === '/invite' ? `/invite${window.location.search}` : '/app',
          ))
        }}
        notice={sessionExpired
          ? 'Your session expired. Sign in again to continue.'
          : undefined}
      />
    )
  }
  if (pathname === '/login') {
    return <AuthLoading />
  }
  const session = sessionQuery.data

  if (pathname === '/verify-email') {
    return (
      <VerificationResultPage
        errorCode={new URLSearchParams(window.location.search).get('error') || ''}
        authenticated
        onBack={() => navigate('/')}
        onContinue={() => navigate('/app')}
      />
    )
  }

  if (pathname === '/invite') {
    return (
      <InvitationPage
        invitationId={new URLSearchParams(window.location.search).get('id') || ''}
        userEmail={session.user.email}
        onBack={() => navigate('/')}
        onAccepted={() => navigate('/app')}
      />
    )
  }

  return (
    <OrganizationGate onBack={() => navigate('/')}>
      {activeOrganization => (
        <AuthenticatedCloudApp
          navigate={navigate}
          user={session.user}
          activeOrganization={activeOrganization}
          onBackgroundVisibilityChange={onBackgroundVisibilityChange}
        />
      )}
    </OrganizationGate>
  )
}

function AuthenticatedCloudApp({
  navigate,
  user,
  activeOrganization,
  onBackgroundVisibilityChange,
}: {
  navigate: (path: string) => void
  user: { name: string; email: string }
  activeOrganization: CloudOrganization
  onBackgroundVisibilityChange: (visible: boolean) => void
}) {
  const [signingOut, setSigningOut] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [runtimeCatalogRevision, setRuntimeCatalogRevision] = useState(0)
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceProgress, setWorkspaceProgress] = useState<WorkspaceStartupProgress>({
    stage: 'resolving',
  })
  const [workspaceError, setWorkspaceError] = useState<WorkspaceStartupError | null>(null)
  const [workspaceAttempt, setWorkspaceAttempt] = useState(0)
  const [dashboardOverShader, setDashboardOverShader] = useState(true)
  const handleDashboardBackgroundChange = useCallback((overShader: boolean) => {
    setDashboardOverShader(overShader)
    onBackgroundVisibilityChange(overShader)
  }, [onBackgroundVisibilityChange])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setWorkspaceId('')
    setWorkspaceError(null)
    setWorkspaceProgress({ stage: 'resolving' })
    void startPersonalWorkspace({
      organizationId: activeOrganization.id,
      resolveWorkspace: ensurePersonalWorkspace,
      ensureRunning: ensureWorkspaceRunning,
      signal: controller.signal,
      onProgress: progress => {
        if (!cancelled) setWorkspaceProgress(progress)
      },
      runtimeReady: async (candidateWorkspaceId, signal) => {
        const candidateTransport = createCloudRuntimeTransport({
          workspaceId: candidateWorkspaceId,
          gatewayBase: runtimeGatewayBase,
        })
        const response = await candidateTransport.request('/health/ready', {
          signal,
        })
        return response.ok
      },
    })
      .then(resolvedWorkspaceId => {
        if (!cancelled) setWorkspaceId(resolvedWorkspaceId)
      })
      .catch(error => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return
        setWorkspaceError(error instanceof WorkspaceStartupError
          ? error
          : new WorkspaceStartupError(
              'resolving',
              error instanceof Error ? error.message : 'Your operator could not be started.',
            ))
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeOrganization.id, workspaceAttempt])

  const runtimeTransport = useMemo(() => createCloudRuntimeTransport({
    workspaceId: workspaceId || 'resolving',
    gatewayBase: runtimeGatewayBase,
  }), [workspaceId])

  const runtimeNavigation = useMemo<RuntimeNavigationItem[]>(() => [
    {
      id: 'terminal',
      label: 'Terminal',
      icon: <Terminal size={15} />,
      background: 'plain',
      keepMounted: true,
      onSelect: () => {},
      content: (
        <Suspense fallback={<div className="min-w-0 flex-1 bg-[var(--color-surface-page)]" />}>
          <TerminalPage key={workspaceId} workspaceId={workspaceId} />
        </Suspense>
      ),
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={15} />,
      background: dashboardOverShader ? 'shader' : 'plain',
      onSelect: () => {},
      content: () => (
        <div className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] bg-transparent">
          <OrganizationDashboard
            userName={user.name}
            userKey={user.email}
            organizationId={activeOrganization.id}
            organizationName={activeOrganization.name}
            onBackgroundChange={handleDashboardBackgroundChange}
          />
        </div>
      ),
    },
  ], [activeOrganization.id, activeOrganization.name, dashboardOverShader, user.name, workspaceId])

  const signOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await authClient.signOut()
      navigate('/login')
    } finally {
      setSigningOut(false)
    }
  }, [navigate, signingOut])

  if (workspaceError) {
    return (
      <WorkspaceResolutionError
        error={workspaceError}
        onRetry={() => setWorkspaceAttempt(current => current + 1)}
      />
    )
  }
  if (!workspaceId) {
    return <WorkspaceStartup progress={workspaceProgress} />
  }

  return (
    <>
      <RuntimeWorkspace
        transport={runtimeTransport}
        catalogRevision={runtimeCatalogRevision}
        brandLabel="Nebula"
        identityLabel={`${user.name} · ${activeOrganization.name}`}
        identityInitial={user.name.slice(0, 1).toUpperCase() || 'N'}
        identityMenuItems={[
          {
            label: 'Settings',
            icon: <Settings size={14} />,
            onSelect: () => setSettingsOpen(true),
          },
          {
            label: signingOut ? 'Logging out…' : 'Log out',
            icon: <LogOut size={14} />,
            onSelect: () => { void signOut() },
            disabled: signingOut,
            tone: 'danger',
          },
        ]}
        onBrandSelect={() => navigate('/')}
        externalNavigation={runtimeNavigation}
      />
      <AnimatePresence>
        {settingsOpen && (
          <SettingsWindow
            user={user}
            organization={activeOrganization}
            workspaceId={workspaceId}
            transport={runtimeTransport}
            onProviderConnected={() => {
              setRuntimeCatalogRevision(current => current + 1)
            }}
            onOperatorRestarted={() => {
              setRuntimeCatalogRevision(current => current + 1)
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function WorkspaceResolutionError({
  error,
  onRetry,
}: {
  error: WorkspaceStartupError
  onRetry: () => void
}) {
  const title = error.stage === 'resolving'
    ? 'Workspace unavailable'
    : error.stage === 'provisioning'
      ? 'Provisioning paused'
      : 'Nebula unavailable'
  return (
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 text-white">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-auth)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        <p className="text-[14px] font-semibold text-white/90">{title}</p>
        <p className="mt-2 text-[12px] leading-5 text-white/45">{error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 flex h-9 items-center justify-center rounded-xl bg-white px-4 text-[12px] font-medium text-black transition hover:bg-white/90"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

export function SettingsWindow({
  user,
  organization,
  workspaceId,
  transport,
  onProviderConnected,
  onOperatorRestarted,
  onClose,
}: {
  user: { name: string; email: string }
  organization: CloudOrganization
  workspaceId: string
  transport: RuntimeTransport
  onProviderConnected: () => void
  onOperatorRestarted: () => void
  onClose: () => void
}) {
  const reduceMotion = useReducedMotion()
  const [restartState, setRestartState] = useState<
    'idle' | 'confirming' | 'restarting' | 'restarted' | 'error'
  >('idle')
  const [restartError, setRestartError] = useState('')
  const [settingsSection, setSettingsSection] = useState('general')
  const [operatorRuntime, setOperatorRuntime] = useState<OperatorRuntimeResponse | null>(null)

  const settingsSections: SettingsSection[] = [
    { id: 'general', label: 'General', group: 'Account', icon: <UserRound size={15} /> },
    { id: 'organization', label: 'Organization', group: 'Account', icon: <Building2 size={15} /> },
    { id: 'providers', label: 'Providers', group: 'Runtime', icon: <PlugZap size={15} /> },
    { id: 'operator', label: 'Operator', group: 'Runtime', icon: <Cpu size={15} /> },
    { id: 'appearance', label: 'Appearance', group: 'Personalize', icon: <Palette size={15} /> },
  ]

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    if (settingsSection !== 'operator' || !workspaceId) return
    const controller = new AbortController()
    void getOperatorRuntime(workspaceId, {
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    })
      .then(setOperatorRuntime)
      .catch(() => {
        if (!controller.signal.aborted) setOperatorRuntime(null)
      })
    return () => controller.abort()
  }, [settingsSection, workspaceId])

  const restartOperator = async () => {
    if (restartState === 'restarting') return
    setRestartError('')
    setRestartState('restarting')
    try {
      await restartWorkspace(workspaceId)
      setRestartState('restarted')
      onOperatorRestarted()
      window.setTimeout(() => setRestartState('idle'), 2500)
    } catch (error) {
      setRestartError(error instanceof Error ? error.message : 'Operator restart failed')
      setRestartState('error')
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-5"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
        <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.985 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-5xl"
      >
        <SettingsShell
          title="Settings"
          sections={settingsSections}
          activeSection={settingsSection}
          onSectionChange={setSettingsSection}
          onClose={onClose}
        >
          {settingsSection === 'general' && (
            <SettingsContent title="General" description="Your account identity and the active workspace context.">
              <div className="space-y-5">
                <SettingsField label="Name" value={user.name} />
                <SettingsField label="Email" value={user.email} />
              </div>
            </SettingsContent>
          )}

          {settingsSection === 'organization' && (
            <SettingsContent title="Organization" description="The organization controls shared workspaces, access, and governance.">
              <SettingsField label="Organization" value={organization.name} />
            </SettingsContent>
          )}

          {settingsSection === 'providers' && (
            <SettingsContent title="Model providers" description="Connect the models Nebula can use. Credentials stay inside the runtime and are never shown to Cloud.">
              <ProviderSettings
                transport={transport}
                onProviderConnected={onProviderConnected}
              />
            </SettingsContent>
          )}

          {settingsSection === 'operator' && (
            <SettingsContent title="Operator" description="Manage the current workspace runtime without deleting its persistent files.">
              <Surface variant="panel" density="compact" radius="surface" className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Restart operator</p>
                    <p className="mt-1 text-[11px] leading-5 text-[var(--color-text-muted)]">
                      Recreates Nebula from the current image without deleting your files.
                    </p>
                  </div>
                  {restartState === 'confirming' ? null : (
                    <Button
                      disabled={restartState === 'restarting'}
                      onClick={() => setRestartState('confirming')}
                      variant="recessed"
                      size="compact"
                      radius="compact"
                    >
                      <RotateCw size={13} className={restartState === 'restarting' ? 'animate-spin' : ''} />
                      {restartState === 'restarting' ? 'Restarting…' : restartState === 'restarted' ? 'Restarted' : 'Restart'}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <OperatorFact icon={<Cpu size={14} />} label="Runtime" value="Nebula Agent" />
                  <OperatorFact icon={<MemoryStick size={14} />} label="Reserved RAM" value={formatBytes(operatorRuntime?.resources.memoryRequestBytes)} />
                  <OperatorFact icon={<HardDrive size={14} />} label="Disk quota" value={formatBytes(operatorRuntime?.resources.diskLimitBytes)} />
                  <OperatorFact label="Workspace image" value={operatorRuntime?.image ?? 'Loading…'} />
                  <OperatorFact label="CPU limit" value={formatCpu(operatorRuntime?.resources.cpuLimit)} />
                  <OperatorFact label="Process limit" value={formatPids(operatorRuntime?.resources.pidsLimit)} />
                </div>
                {restartState === 'confirming' && (
                  <div className="mt-4 flex items-center justify-between gap-3 bg-[var(--color-surface-overlay)] p-3">
                    <p className="text-[11px] leading-5 text-[var(--color-text-muted)]">
                      Active commands and terminal connections will stop. Persistent files stay mounted.
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button type="button" onClick={() => setRestartState('idle')} variant="ghost" size="compact" radius="compact">Cancel</Button>
                      <Button type="button" onClick={() => { void restartOperator() }} variant="primary" size="compact" radius="compact">Restart</Button>
                    </div>
                  </div>
                )}
                {restartState === 'error' && restartError && <p className="mt-3 text-[11px] leading-5 text-[var(--color-status-danger-strong)]">{restartError}</p>}
              </Surface>
            </SettingsContent>
          )}

          {settingsSection === 'appearance' && <AppearanceSettings />}
        </SettingsShell>
      </motion.div>
    </motion.div>
  )
}

function SettingsField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">{label}</p>
      <div className="flex h-[var(--control-height-field)] items-center rounded-[var(--radius-control)] bg-[var(--color-surface-input)] px-3 text-[12px] text-[var(--color-text-secondary)]">{value}</div>
    </div>
  )
}

function OperatorFact({
  icon,
  label,
  value,
}: {
  icon?: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-control)] bg-[var(--color-surface-recessed)] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p title={value} className="mt-1 truncate text-[12px] text-[var(--color-text-secondary)]">{value}</p>
    </div>
  )
}

function formatBytes(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value <= 0) return 'Loading…'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = value
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit += 1
  }
  return `${amount >= 10 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`
}

function formatCpu(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? `${value} vCPU` : 'Loading…'
}

function formatPids(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value.toLocaleString() : 'Loading…'
}

function SettingsContent({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
      <div className="mt-8">{children}</div>
    </div>
  )
}
