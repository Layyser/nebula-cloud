import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { LayoutDashboard, LogOut, Settings, Terminal, X } from 'lucide-react'
import { NebulaBackground, RuntimeWorkspace, type RuntimeNavigationItem } from '@nebula/runtime-ui'
import { authClient } from './auth/authClient'
import { AuthLoading } from './components/auth/AuthLoading'
import { AuthPage } from './components/auth/AuthPage'
import { Dashboard } from './components/cloud/Dashboard'
import { LandingPage } from './components/landing/LandingPage'
import {
  OrganizationGate,
  type CloudOrganization,
} from './components/organization/OrganizationGate'
import { createCloudRuntimeTransport } from './runtime/cloudRuntimeTransport'
import { ensurePersonalWorkspace } from './runtime/personalWorkspace'

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
  const cloudRoute = pathname === '/login' || pathname.startsWith('/app')

  if (!cloudRoute) {
    return (
      <PageBackground>
        <LandingPage onLaunch={() => navigate('/app')} />
      </PageBackground>
    )
  }

  return (
    <PageBackground>
      <CloudSessionRoute pathname={pathname} navigate={navigate} />
    </PageBackground>
  )
}

function PageBackground({ children }: { children: ReactNode }) {
  return (
    <>
      <NebulaBackground fade={0} variant="classic" palette="graphite" resolutionScale={0.5} />
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

  useEffect(() => {
    if (sessionQuery.isPending) return
    if (!sessionQuery.data && pathname !== '/login') navigate('/login')
    if (sessionQuery.data && pathname === '/login') navigate('/app')
  }, [navigate, pathname, sessionQuery.data, sessionQuery.isPending])

  if (sessionQuery.isPending) {
    return <AuthLoading />
  }
  if (!sessionQuery.data) {
    return (
      <AuthPage
        onBack={() => navigate('/')}
        onAuthenticated={() => {
          void sessionQuery.refetch().then(() => navigate('/app'))
        }}
      />
    )
  }
  if (pathname === '/login') {
    return <AuthLoading />
  }
  const session = sessionQuery.data

  return (
    <OrganizationGate>
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
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceError, setWorkspaceError] = useState('')
  const [workspaceAttempt, setWorkspaceAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 4000)
    setWorkspaceId('')
    setWorkspaceError('')
    void ensurePersonalWorkspace(activeOrganization.id)
      .then(async workspace => {
        const candidateTransport = createCloudRuntimeTransport({
          workspaceId: workspace.id,
          gatewayBase: runtimeGatewayBase,
        })
        const response = await candidateTransport.request('/health/ready', {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('Your personal workspace exists, but its Nebula runtime is not ready.')
        }
        if (!cancelled) setWorkspaceId(workspace.id)
      })
      .catch(error => {
        if (!cancelled) {
          const message = error instanceof DOMException && error.name === 'AbortError'
            ? 'Your personal workspace exists, but its Nebula runtime did not respond.'
            : error instanceof Error
              ? error.message
              : 'Personal workspace could not be resolved'
          setWorkspaceError(message)
        }
      })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
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
      onSelect: () => {},
      content: (
        <Suspense fallback={<div className="min-w-0 flex-1 bg-[#080808]" />}>
          <TerminalPage workspaceId={workspaceId} />
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
          <Dashboard userName={user.name} />
        </div>
      ),
    },
  ], [user.name, workspaceId])

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
        message={workspaceError}
        onRetry={() => setWorkspaceAttempt(current => current + 1)}
      />
    )
  }
  if (!workspaceId) {
    return <AuthLoading label="Resolving your workspace" />
  }

  return (
    <>
      <RuntimeWorkspace
        transport={runtimeTransport}
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
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function WorkspaceResolutionError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 text-white">
      <div className="w-full max-w-sm rounded-xl border border-white/[0.10] bg-[#111]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        <p className="text-[14px] font-semibold text-white/90">Operator unavailable</p>
        <p className="mt-2 text-[12px] leading-5 text-white/45">{message}</p>
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

function SettingsWindow({
  user,
  organization,
  onClose,
}: {
  user: { name: string; email: string }
  organization: CloudOrganization
  onClose: () => void
}) {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

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
            <p className="text-[11px] text-white/35">Account and organization preferences</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/80">
            <X size={15} />
          </button>
        </header>
        <div className="space-y-5 p-5">
          <SettingsField label="Name" value={user.name} />
          <SettingsField label="Email" value={user.email} />
          <SettingsField label="Organization" value={organization.name} />
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
