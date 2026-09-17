import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { gsap } from 'gsap'
import { Sidebar } from '../../../nebula-frontend/src/components/layout/Sidebar'

// Separate, movable scene. All navigation markup comes from the real Sidebar.
export const SIDEBAR_START = 15.44
export const SIDEBAR_END = 17.11
const noop = () => {}
const asyncNoop = async () => {}
const terminalIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
const dashboardIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
let rows: HTMLButtonElement[] = []
const motion = { row: 0, press: 1 }

export function mountSidebarScene() {
  // This isolated preview origin stores no real user workspace state.
  localStorage.setItem('nebula.sidebar.width', '240')
  flushSync(() => createRoot(document.getElementById('sidebar-ui')!).render(
    <Sidebar chats={[{ name: 'release-summary', display_name: 'Review the latest changes', cwd: '/home/nebula/workspace/x-algorithm', workspace_root: '/home/nebula/workspace' }]}
      activeChat={null} activeView={null} brandLabel="Nubols" identityLabel="Alex · Personal" identityInitial="A"
      onSelect={noop} onNew={noop} onNewInProject={noop} onDelete={asyncNoop} onDeleteProject={asyncNoop}
      onToggleHooks={asyncNoop} onAgents={noop} onConnections={noop} onSearch={noop} onSettings={noop}
      overShader={false} externalNavigation={[
        { id: 'terminal', label: 'Terminal', icon: terminalIcon, onSelect: noop },
        { id: 'dashboard', label: 'Dashboard', icon: dashboardIcon, onSelect: noop },
      ]} />,
  ))
  const names = ['New Session', 'Agents', 'Capabilities', 'Search', 'Terminal']
  rows = names.map(name => [...document.querySelectorAll<HTMLButtonElement>('#sidebar-ui button')].find(button => button.textContent?.trim() === name)!)
  if (rows.some(row => !row)) throw new Error('Sidebar navigation changed; update the trailer bindings.')
  rows.forEach((row, index) => { row.dataset.trailerRow = String(index) })
}

export function updateSidebarScene(seconds: number, shader: HTMLCanvasElement) {
  // Prime the canvas before the clip's first captured frame (frame rounding
  // can reveal it just before the exact floating-point boundary).
  if (seconds < SIDEBAR_START - .5) return
  const localTime = seconds - SIDEBAR_START
  const index = Math.min(4, Math.round(motion.row))
  rows.forEach((row, i) => {
    row.dataset.trailerHover = String(i === index)
    row.style.transform = i === 4 ? `scale(${motion.press}, ${1 - (1 - motion.press) * 0.65})` : 'none'
  })
  const pane = document.getElementById('sidebar-pane')!
  pane.dataset.terminal = String(localTime >= 1.21)
  const canvas = document.getElementById('sidebar-shader') as HTMLCanvasElement
  if (localTime < 1.21) canvas.getContext('2d')!.drawImage(shader, 0, 0, canvas.width, canvas.height)
}

export function addSidebarTimeline(timeline: gsap.core.Timeline) {
  // The incoming camera cut is the ONLY vertical motion. Its cubic settling
  // phase and hover share an identical clock, followed by a 0.73s still beat.
  timeline.fromTo(motion, { row: 0 }, { row: 4, duration: .36, ease: 'power2.out' }, SIDEBAR_START)
  timeline.to(motion, { press: 0.965, duration: 0.12, ease: 'power2.out' }, SIDEBAR_START + 1.09)
  timeline.to(motion, { press: 1, duration: 0.14, ease: 'power2.out' }, SIDEBAR_START + 1.23)
}
