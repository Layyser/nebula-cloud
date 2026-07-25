import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LayoutDashboard } from 'lucide-react'
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

const demoWorkspaceId = 'demo'
const runtimeGatewayBase = import.meta.env.VITE_NEBULA_RUNTIME_GATEWAY_BASE || '/api/workspaces'

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
  const runtimeTransport = useMemo(() => createCloudRuntimeTransport({
    workspaceId: demoWorkspaceId,
    gatewayBase: runtimeGatewayBase,
  }), [])

  const runtimeNavigation = useMemo<RuntimeNavigationItem[]>(() => [
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
  ], [user.name])

  return (
    <RuntimeWorkspace
      transport={runtimeTransport}
      brandLabel="Nebula"
      identityLabel={`${user.name} · ${activeOrganization.name}`}
      identityInitial={user.name.slice(0, 1).toUpperCase() || 'N'}
      onBrandSelect={() => navigate('/')}
      externalNavigation={runtimeNavigation}
    />
  )
}
