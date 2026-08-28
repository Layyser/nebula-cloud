import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LayoutDashboard, Terminal } from 'lucide-react'
import {
  RuntimeWorkspace,
  setThemePreference,
  type RuntimeNavigationItem,
} from '@nebula/runtime-ui'
import { PageBackground, SettingsWindow } from '../App'
import { AuthPage } from '../components/auth/AuthPage'
import { OrganizationDashboard } from '../components/cloud/OrganizationDashboard'
import { TerminalPage } from '../components/cloud/TerminalPage'
import { WorkspaceStartup } from '../components/cloud/WorkspaceStartup'
import { OrganizationSetup } from '../components/organization/OrganizationGate'
import {
  cloudPreviewOrganization,
  cloudPreviewDashboard,
  cloudPreviewMembers,
  cloudPreviewUser,
  createCloudPreviewTransport,
  type CloudPreviewMode,
} from './cloudPreviewFixtures'

const previewWorkspaceId = 'workspace-preview'
const terminalOutput = [
  'Nebula Cloud console',
  '',
  'operator@nebula:~/workspace$ git status --short',
  ' M apps/web/src/App.tsx',
  'operator@nebula:~/workspace$ _',
]

function WorkspacePreview({
  view,
  onBackgroundChange,
}: {
  view: 'dashboard' | 'terminal'
  onBackgroundChange: (visible: boolean) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [dashboardOverShader, setDashboardOverShader] = useState(true)
  const transport = useMemo(() => createCloudPreviewTransport(), [])
  const handleDashboardBackgroundChange = useCallback((overShader: boolean) => {
    setDashboardOverShader(overShader)
    onBackgroundChange(overShader)
  }, [onBackgroundChange])
  const navigation = useMemo<RuntimeNavigationItem[]>(() => [
    {
      id: 'terminal',
      label: 'Terminal',
      icon: <Terminal size={15} />,
      background: 'plain',
      keepMounted: true,
      onSelect: () => {},
      content: (
        <TerminalPage
          workspaceId={previewWorkspaceId}
          previewOutput={terminalOutput}
        />
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
            userName={cloudPreviewUser.name}
            userKey={cloudPreviewUser.email}
            organizationId={cloudPreviewOrganization.id}
            organizationName={cloudPreviewOrganization.name}
            previewOverview={cloudPreviewDashboard}
            previewMembers={cloudPreviewMembers}
            onBackgroundChange={handleDashboardBackgroundChange}
          />
        </div>
      ),
    },
  ], [dashboardOverShader, handleDashboardBackgroundChange])

  useEffect(() => {
    let attempts = 0
    let timeout = 0
    const selectView = () => {
      const button = [...(rootRef.current?.querySelectorAll('button') ?? [])]
        .find(candidate => candidate.textContent?.trim() === (view === 'dashboard' ? 'Dashboard' : 'Terminal'))
      if (button) {
        button.click()
        return
      }
      attempts += 1
      if (attempts < 40) timeout = window.setTimeout(selectView, 25)
    }
    selectView()
    return () => window.clearTimeout(timeout)
  }, [view])

  return (
    <div ref={rootRef} className="contents">
      <RuntimeWorkspace
        transport={transport}
        brandLabel="Nebula"
        identityLabel={`${cloudPreviewUser.name} · ${cloudPreviewOrganization.name}`}
        identityInitial="J"
        externalNavigation={navigation}
      />
    </div>
  )
}

function RuntimePreview() {
  const transport = useMemo(() => createCloudPreviewTransport(), [])

  useEffect(() => {
    document.documentElement.classList.add('runtime-embed-document')
    return () => document.documentElement.classList.remove('runtime-embed-document')
  }, [])

  return (
    <RuntimeWorkspace
      transport={transport}
      brandLabel="Nebula"
      identityLabel={`${cloudPreviewUser.name} · ${cloudPreviewOrganization.name}`}
      identityInitial={cloudPreviewUser.name.slice(0, 1).toUpperCase() || 'N'}
    />
  )
}

function SettingsPreview() {
  const transport = useMemo(() => createCloudPreviewTransport(), [])
  return (
    <>
      <RuntimeWorkspace
        transport={transport}
        brandLabel="Nebula"
        identityLabel={`${cloudPreviewUser.name} · ${cloudPreviewOrganization.name}`}
        identityInitial="J"
      />
      <SettingsWindow
        user={cloudPreviewUser}
        organization={cloudPreviewOrganization}
        workspaceId={previewWorkspaceId}
        transport={transport}
        onProviderConnected={() => {}}
        onOperatorRestarted={() => {}}
        onClose={() => {}}
      />
    </>
  )
}

export function CloudPreview({ mode }: { mode: CloudPreviewMode }) {
  const [backgroundVisible, setBackgroundVisible] = useState(true)

  useEffect(() => {
    setBackgroundVisible(true)
  }, [mode])

  useEffect(() => {
    const handleThemeMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'nebula-preview-theme') return
      if (event.data.theme !== 'dark' && event.data.theme !== 'light') return
      setThemePreference(event.data.theme)
    }

    window.addEventListener('message', handleThemeMessage)
    return () => window.removeEventListener('message', handleThemeMessage)
  }, [])

  let content
  if (mode === 'runtime') {
    content = <RuntimePreview />
  } else if (mode === 'login') {
    content = <AuthPage onAuthenticated={() => {}} onBack={() => {}} />
  } else if (mode === 'organization') {
    content = (
      <OrganizationSetup
        organizations={[cloudPreviewOrganization]}
        onBack={() => {}}
        onChanged={async () => {}}
      />
    )
  } else if (mode === 'startup') {
    content = <WorkspaceStartup progress={{ stage: 'starting', workspaceId: previewWorkspaceId }} />
  } else if (mode === 'settings') {
    content = <SettingsPreview />
  } else {
    content = <WorkspacePreview view={mode} onBackgroundChange={setBackgroundVisible} />
  }

  if (mode === 'runtime') return content
  return <PageBackground scrollReactive={false} visible={backgroundVisible}>{content}</PageBackground>
}
