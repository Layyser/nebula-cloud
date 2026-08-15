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
  CheckCircle2,
  Copy,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  RotateCw,
  Settings,
  Terminal,
  X,
} from 'lucide-react'
import { NebulaBackground, RuntimeWorkspace, type RuntimeNavigationItem } from '@nebula/runtime-ui'
import type { RuntimeTransport } from '@nebula/runtime-ui/transport'
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
import { Dashboard } from './components/cloud/Dashboard'
import { WorkspaceStartup } from './components/cloud/WorkspaceStartup'
import { LandingPage } from './components/landing/LandingPage'
import { PricingPage } from './components/pricing/PricingPage'
import {
  OrganizationGate,
  type CloudOrganization,
} from './components/organization/OrganizationGate'
import { createCloudRuntimeTransport } from './runtime/cloudRuntimeTransport'
import {
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
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
  const cloudRoute = pathname === '/login'
    || pathname.startsWith('/app')
    || isAuthenticationCallback(pathname)
  const pricingRoute = pathname === '/pricing'

  return (
    <PageBackground scrollReactive={!cloudRoute && !pricingRoute}>
      {cloudRoute ? (
        <CloudSessionRoute pathname={pathname} navigate={navigate} />
      ) : pricingRoute ? (
        <PricingPage onLaunch={() => navigate('/login')} />
      ) : (
        <LandingPage onLaunch={() => navigate('/login')} />
      )}
    </PageBackground>
  )
}

export function PageBackground({ children, scrollReactive }: { children: ReactNode; scrollReactive: boolean }) {
  return (
    <>
      <NebulaBackground fade={0} variant="classic" palette="graphite" resolutionScale={0.5} scrollReactive={scrollReactive} />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(circle_at_66%_40%,transparent_0%,rgba(5,6,7,0.08)_28%,rgba(5,6,7,0.76)_78%)]" />
      <div aria-hidden="true" className="shader-bottom-fade pointer-events-none fixed inset-x-0 bottom-0 z-[1]" />
      {children}
    </>
  )
}

function CloudSessionRoute({
  pathname,
  navigate,
}: {
  pathname: string
  navigate: (path: string) => void
}) {
  const sessionQuery = authClient.useSession()
  const hadSession = useRef(false)
  const [sessionExpired, setSessionExpired] = useState(
    () => consumeSessionExpired(),
  )

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
    return (
      <AuthPage
        onBack={() => navigate('/')}
        onAuthenticated={() => {
          clearSessionExpired()
          setSessionExpired(false)
          void sessionQuery.refetch().then(() => navigate('/app'))
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

  return (
    <OrganizationGate onBack={() => navigate('/')}>
      {activeOrganization => (
        <AuthenticatedCloudApp
          navigate={navigate}
          user={session.user}
          activeOrganization={activeOrganization}
        />
      )}
    </OrganizationGate>
  )
}

function AuthenticatedCloudApp({
  navigate,
  user,
  activeOrganization,
}: {
  navigate: (path: string) => void
  user: { name: string; email: string }
  activeOrganization: CloudOrganization
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
      keepMounted: true,
      onSelect: () => {},
      content: (
        <Suspense fallback={<div className="min-w-0 flex-1 bg-[#080808]" />}>
          <TerminalPage key={workspaceId} workspaceId={workspaceId} />
        </Suspense>
      ),
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={15} />,
      onSelect: () => {},
      content: (
        <div className="min-w-0 flex-1 overflow-y-auto bg-[#080808]">
          <Dashboard
            userName={user.name}
            userKey={user.email}
            organizationId={activeOrganization.id}
            organizationName={activeOrganization.name}
          />
        </div>
      ),
    },
  ], [activeOrganization.id, activeOrganization.name, user.name, workspaceId])

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
  const [codexState, setCodexState] = useState<
    'checking' | 'disconnected' | 'starting' | 'pending' | 'connected' | 'error'
  >('checking')
  const [codexError, setCodexError] = useState('')
  const [copied, setCopied] = useState(false)
  const [restartState, setRestartState] = useState<
    'idle' | 'confirming' | 'restarting' | 'restarted' | 'error'
  >('idle')
  const [restartError, setRestartError] = useState('')
  const [deviceFlow, setDeviceFlow] = useState<{
    flowId: string
    verificationUrl: string
    userCode: string
    intervalSeconds: number
  } | null>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    const controller = new AbortController()
    void transport.request('/auth/codex', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Could not read Codex connection status')
        const payload = await response.json() as { authenticated?: boolean }
        setCodexState(payload.authenticated ? 'connected' : 'disconnected')
      })
      .catch(error => {
        if (controller.signal.aborted) return
        setCodexError(error instanceof Error ? error.message : 'Codex status failed')
        setCodexState('error')
      })
    return () => controller.abort()
  }, [transport])

  useEffect(() => {
    if (!deviceFlow || codexState !== 'pending') return
    let cancelled = false
    let timeout = 0
    const poll = async () => {
      try {
        const response = await transport.request(
          `/auth/codex/device/${encodeURIComponent(deviceFlow.flowId)}`,
        )
        const payload = await response.json() as {
          status?: string
          message?: string | null
        }
        if (cancelled) return
        if (payload.status === 'complete') {
          setCodexState('connected')
          setDeviceFlow(null)
          onProviderConnected()
          return
        }
        if (payload.status !== 'pending') {
          setCodexError(payload.message || 'Codex sign-in failed')
          setCodexState('error')
          setDeviceFlow(null)
          return
        }
      } catch {
        if (cancelled) return
        setCodexError('Could not check Codex sign-in')
        setCodexState('error')
        setDeviceFlow(null)
        return
      }
      timeout = window.setTimeout(
        () => { void poll() },
        Math.max(1000, deviceFlow.intervalSeconds * 1000),
      )
    }
    timeout = window.setTimeout(
      () => { void poll() },
      Math.max(1000, deviceFlow.intervalSeconds * 1000),
    )
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [codexState, deviceFlow, onProviderConnected, transport])

  const startCodexLogin = async () => {
    setCodexError('')
    setCopied(false)
    setCodexState('starting')
    try {
      const response = await transport.request('/auth/codex/device', {
        method: 'POST',
      })
      const payload = await response.json() as {
        flow_id?: string
        verification_url?: string
        user_code?: string
        interval_seconds?: number
        error?: string
      }
      if (
        !response.ok
        || !payload.flow_id
        || !payload.verification_url
        || !payload.user_code
      ) {
        throw new Error(payload.error || 'Could not start Codex sign-in')
      }
      setDeviceFlow({
        flowId: payload.flow_id,
        verificationUrl: payload.verification_url,
        userCode: payload.user_code,
        intervalSeconds: payload.interval_seconds || 5,
      })
      setCodexState('pending')
    } catch (error) {
      setCodexError(error instanceof Error ? error.message : 'Codex sign-in failed')
      setCodexState('error')
    }
  }

  const copyDeviceCode = async () => {
    if (!deviceFlow) return
    try {
      await navigator.clipboard.writeText(deviceFlow.userCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCodexError('Could not copy the one-time code')
    }
  }

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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-settings-title"
        initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.985 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.10] bg-[#111] shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
      >
        <header className="flex h-14 items-center justify-between border-b border-white/[0.07] px-5">
          <div>
            <h2 id="cloud-settings-title" className="text-[14px] font-semibold text-white/90">Settings</h2>
            <p className="text-[11px] text-white/35">Account, providers, and organization</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/80">
            <X size={15} />
          </button>
        </header>
        <div className="space-y-5 p-5">
          <SettingsField label="Name" value={user.name} />
          <SettingsField label="Email" value={user.email} />
          <SettingsField label="Organization" value={organization.name} />
          <div className="border-t border-white/[0.07] pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
              Model providers
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[12px] font-medium text-white/75">Codex</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-white/35">
                    Use your ChatGPT subscription inside this operator.
                  </p>
                </div>
                {codexState === 'connected' ? (
                  <span className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-400/[0.08] px-2.5 text-[11px] text-emerald-300/80">
                    <CheckCircle2 size={13} />
                    Connected
                  </span>
                ) : codexState !== 'pending' ? (
                  <button
                    type="button"
                    disabled={codexState === 'checking' || codexState === 'starting'}
                    onClick={() => { void startCodexLogin() }}
                    className="flex h-8 items-center rounded-lg bg-white px-3 text-[11px] font-medium text-black transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-55"
                  >
                    {codexState === 'starting' ? 'Starting…' : 'Connect'}
                  </button>
                ) : null}
              </div>
              {codexState === 'pending' && deviceFlow && (
                <div className="mt-3 border-t border-white/[0.07] pt-3">
                  <p className="text-[11px] leading-5 text-white/45">
                    Open OpenAI and enter this one-time code:
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void copyDeviceCode() }}
                      className="flex h-9 flex-1 items-center justify-between rounded-lg border border-white/[0.09] bg-white/[0.035] px-3 font-mono text-[12px] tracking-[0.12em] text-white/75 transition hover:bg-white/[0.06]"
                    >
                      {deviceFlow.userCode}
                      <span className="flex items-center gap-1 font-sans text-[10px] tracking-normal text-white/30">
                        <Copy size={12} />
                        {copied ? 'Copied' : 'Copy'}
                      </span>
                    </button>
                    <a
                      href={deviceFlow.verificationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[11px] font-medium text-black transition hover:bg-white/90"
                    >
                      Open OpenAI
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <p className="mt-2 text-[10px] text-white/25">
                    Waiting for authorization. This code expires in 15 minutes.
                  </p>
                </div>
              )}
              {codexState === 'error' && codexError && (
                <p className="mt-2 text-[10px] leading-4 text-red-300/65">{codexError}</p>
              )}
            </div>
          </div>
          <div className="border-t border-white/[0.07] pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
              Operator
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[12px] font-medium text-white/75">Restart operator</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-white/35">
                    Recreates Nebula from the current image without deleting your files.
                  </p>
                </div>
                {restartState === 'confirming' ? null : (
                  <button
                    type="button"
                    disabled={restartState === 'restarting'}
                    onClick={() => setRestartState('confirming')}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.035] px-3 text-[11px] font-medium text-white/65 transition hover:bg-white/[0.07] hover:text-white/85 disabled:cursor-wait disabled:opacity-55"
                  >
                    <RotateCw
                      size={12}
                      className={restartState === 'restarting' ? 'animate-spin' : ''}
                    />
                    {restartState === 'restarting'
                      ? 'Restarting…'
                      : restartState === 'restarted'
                        ? 'Restarted'
                        : 'Restart'}
                  </button>
                )}
              </div>
              {restartState === 'confirming' && (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
                  <p className="text-[10px] leading-4 text-white/40">
                    Active commands and terminal connections will stop. Persistent files stay mounted.
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRestartState('idle')}
                      className="flex h-8 items-center rounded-lg px-3 text-[11px] font-medium text-white/45 transition hover:bg-white/[0.05] hover:text-white/70"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => { void restartOperator() }}
                      className="flex h-8 items-center rounded-lg bg-white px-3 text-[11px] font-medium text-black transition hover:bg-white/90"
                    >
                      Restart
                    </button>
                  </div>
                </div>
              )}
              {restartState === 'error' && restartError && (
                <p className="mt-2 text-[10px] leading-4 text-red-300/65">{restartError}</p>
              )}
            </div>
          </div>
          <p className="border-t border-white/[0.07] pt-4 text-[11px] leading-5 text-white/35">
            More account, organization, and operator preferences will appear here as the Cloud control plane grows.
          </p>
        </div>
      </motion.section>
    </motion.div>
  )
}

function SettingsField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">{label}</p>
      <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2.5 text-[12px] text-white/70">{value}</div>
    </div>
  )
}
