import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, CreditCard, Gauge, LayoutDashboard, ShieldCheck, UsersRound } from 'lucide-react'
import { NebulaBackground, RuntimeWorkspace, type RuntimeNavigationItem } from '@nebula/runtime-ui'
import { LandingPage } from './components/landing/LandingPage'
import { CloudShell } from './components/cloud/CloudShell'
import { Dashboard } from './components/cloud/Dashboard'
import { Operators } from './components/cloud/Operators'
import { PlaceholderPage } from './components/cloud/PlaceholderPage'
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
  const inCloudApp = pathname.startsWith('/app')
  const inWorkspace = pathname.startsWith('/app/operators/demo/workspace')
  const runtimeTransport = useMemo(() => createCloudRuntimeTransport({
    workspaceId: demoWorkspaceId,
    gatewayBase: runtimeGatewayBase,
  }), [])

  const runtimeNavigation = useMemo<RuntimeNavigationItem[]>(() => [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} />, onSelect: () => navigate('/app') },
    { id: 'operators', label: 'Operators', icon: <UsersRound size={15} />, active: true, onSelect: () => navigate('/app/operators') },
    { id: 'usage', label: 'Usage', icon: <Gauge size={15} />, onSelect: () => navigate('/app/usage') },
    { id: 'billing', label: 'Billing', icon: <CreditCard size={15} />, onSelect: () => navigate('/app/billing') },
  ], [navigate])

  if (inWorkspace) {
    return (
      <>
        <NebulaBackground fade={0} variant="classic" palette="graphite" resolutionScale={0.5} />
        <RuntimeWorkspace
          transport={runtimeTransport}
          brandLabel="Nebula"
          identityLabel="George · Nebula"
          identityInitial="G"
          onBrandSelect={() => navigate('/app')}
          externalNavigation={runtimeNavigation}
        />
      </>
    )
  }

  if (!inCloudApp) {
    return (
      <>
        <NebulaBackground fade={0} variant="classic" palette="graphite" resolutionScale={0.5} />
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(circle_at_66%_40%,transparent_0%,rgba(5,6,7,0.08)_28%,rgba(5,6,7,0.76)_78%)]" />
        <LandingPage onLaunch={() => navigate('/app')} />
      </>
    )
  }

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/app' },
    { id: 'operators', label: 'Operators', icon: UsersRound, path: '/app/operators' },
    { id: 'organization', label: 'Organization', icon: Building2, path: '/app/organization' },
    { id: 'governance', label: 'Governance', icon: ShieldCheck, path: '/app/governance' },
    { id: 'usage', label: 'Usage', icon: Gauge, path: '/app/usage' },
    { id: 'billing', label: 'Billing', icon: CreditCard, path: '/app/billing' },
  ]

  return (
    <CloudShell pathname={pathname} navigation={navigation} onNavigate={navigate}>
      {pathname === '/app' && <Dashboard onOpenOperators={() => navigate('/app/operators')} />}
      {pathname === '/app/operators' && <Operators onOpenWorkspace={() => navigate('/app/operators/demo/workspace')} />}
      {pathname === '/app/organization' && <PlaceholderPage eyebrow="Organization" title="Members and access" description="Identity, membership, roles, and invitations will live in the control-plane backend." />}
      {pathname === '/app/governance' && <PlaceholderPage eyebrow="Governance" title="Policies and audit" description="Organization policy, approvals, budgets, secrets, and audit history belong here—not in Nebula Core." />}
      {pathname === '/app/usage' && <PlaceholderPage eyebrow="Usage" title="Runtime activity" description="The control plane will aggregate operator usage without taking ownership of runtime execution." />}
      {pathname === '/app/billing' && <PlaceholderPage eyebrow="Billing" title="Plans and invoices" description="Subscriptions, seats, operator charges, and invoices remain isolated from the runtime API." />}
    </CloudShell>
  )
}
