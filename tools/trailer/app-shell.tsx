import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Sidebar } from '../../../nebula-frontend/src/components/layout/Sidebar'
import { ChatInput } from '../../../nebula-frontend/src/components/chat/ChatInput'
import { Terminal, LayoutDashboard } from '../../../nebula-frontend/node_modules/lucide-react'
import { NebulaMark } from '../../../nebula-frontend/src/components/ui/NebulaMark'

const noop = () => {}
const asyncNoop = async () => {}
export function DemoComposer({ streaming = false, project = 'x-algorithm', agent = null, security = 'sandbox', model = 'opencode/deepseek-v4-flash', effort = 'high' }: { streaming?: boolean; project?: string; agent?: string | null; security?: 'sandbox' | 'full'; model?: string; effort?: 'low' | 'medium' | 'high' }) {
  return <ChatInput session={null} agents={[]} pendingAgent={agent}
    onSend={noop} onAbort={noop} onSwitchAgent={noop} streaming={streaming}
    securityMode={security} securityModeOverride={security} onSwitchSecurityMode={noop}
    model={model} reasoningEffort={effort} reasoningEffortOverride={effort} onSwitchModel={noop}
    onSwitchReasoningEffort={noop} onSwitchCwd={asyncNoop}
    models={[{ slug: model, provider: model.split('/')[0], reasoning_efforts: ['low', 'medium', 'high'] }]}
    cwd={`/home/nebula/workspace/${project}`} workspaceRoot="/home/nebula/workspace"
    placeholder="Send a message..." />
}

export function mountAppSidebar(windowId: string) {
  const host = document.createElement('div')
  host.className = 'demo-app-sidebar'
  document.getElementById(windowId)!.append(host)
  flushSync(() => createRoot(host).render(<Sidebar chats={[]} activeChat={null} activeView={null}
    brandLabel="Nubols" identityLabel="Alex · Personal" identityInitial="A"
    onSelect={noop} onNew={noop} onNewInProject={noop} onDelete={asyncNoop}
    onDeleteProject={asyncNoop} onToggleHooks={asyncNoop} onAgents={noop}
    onConnections={noop} onSearch={noop} onSettings={noop} overShader={false}
    externalNavigation={[
      { id: 'terminal', label: 'Terminal', icon: <Terminal size={15} />, onSelect: noop },
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} />, onSelect: noop },
    ]} />))
  flushSync(() => host.querySelector<HTMLButtonElement>('button[aria-label="Collapse sidebar"]')?.click())
  // The production collapsed sidebar temporarily shows an expand hint after a
  // click. Freeze its resting brand instead of that wall-clock hint in a film.
  const brand = document.createElement('div')
  brand.className = 'demo-sidebar-brand'
  host.append(brand)
  flushSync(() => createRoot(brand).render(<NebulaMark size={24} />))
}
