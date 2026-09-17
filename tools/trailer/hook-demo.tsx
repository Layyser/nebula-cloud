import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { gsap } from 'gsap'
import { MessageBubble } from '../../../nebula-frontend/src/components/chat/MessageBubble'
import type { ChatMessage, ContentBlock } from '../../../nebula-frontend/src/hooks/useChat'
import { DemoComposer, mountAppSidebar } from './app-shell'
import { updateToolEntrances } from './tool-entrances'
import { scrollAt, type ScrollBeat } from './scroll-track'

let root: ReturnType<typeof createRoot>
let key = ''
let scrollBeats: ScrollBeat[] = []
const history: ChatMessage[] = [
  { id: 'hr-instruction', role: 'user', blocks: [{ type: 'text', content: 'Check new CVs against our open roles. Flag relevant experience for a human review.' }] },
  { id: 'prior-hook', role: 'event', hook: 'Gmail', trigger: 'Earlier · New application', blocks: [{ type: 'text', content: 'Previous CV reviewed. Notes saved for the hiring team.' }] },
  { id: 'prior-followup', role: 'event', hook: 'Gmail', trigger: 'Earlier · Candidate follow-up', blocks: [{ type: 'text', content: 'Portfolio attached to the existing review.' }] },
]
const introduction = 'New email from Alex Morgan. I’ll compare the attached CV with our open roles.'
const result = '**Potential match: Backend Engineer.**\n\nPython, PostgreSQL and API experience align with the role. Flagged for **human review** to confirm experience and scope.'
function type(text: string, t: number, start: number, duration: number) { return text.slice(0, Math.floor(Math.max(0, Math.min(1, (t - start) / duration)) * text.length)) }
export function mountHookDemo() {
  mountAppSidebar('hookdemo-window')
  root = createRoot(document.getElementById('hookdemo-messages')!)
  flushSync(() => createRoot(document.getElementById('hookdemo-input')!).render(<DemoComposer project="cv-reviews" agent="HR" model="google/Gemini-2.5-Pro" effort="medium" />))
  // Measure the authored layout on a fixed clock, then restore the opening.
  // This avoids snapping when a tool mounts or streamed Markdown wraps.
  const host = document.getElementById('hookdemo-messages')!
  let previous = 0
  scrollBeats = []
  for (let frame = 0; frame <= 300; frame++) {
    const time = frame / 30
    renderHookContent(time)
    const target = Math.max(0, host.scrollHeight - host.clientHeight)
    if (target !== previous) scrollBeats.push({ time, delta: target - previous })
    previous = target
  }
  updateHookDemo(0)
}
function renderHookContent(t: number) {
  const intro = type(introduction, t, 1.25, 1)
  const reply = type(result, t, 6.6, 1.6)
  const next = `${t >= 1}:${t >= 2.6}:${t >= 4.2}:${t >= 4.6}:${t >= 6.3}:${intro}:${reply}`
  if (next !== key) {
    key = next
    const blocks: ContentBlock[] = []
    if (intro) blocks.push({ type: 'text', content: intro })
    if (t >= 2.6) blocks.push({ type: 'tool_call', id: 'cv-read', name: 'read_file', args: { path: 'applications/alex-morgan-cv.pdf' }, ...(t >= 4.2 ? { result: { content: 'Backend engineering: Python, PostgreSQL, REST APIs.' } } : {}) })
    if (t >= 4.6) blocks.push({ type: 'tool_call', id: 'roles-read', name: 'read_file', args: { path: 'hiring/open-roles.md' }, ...(t >= 6.3 ? { result: { content: 'Backend Engineer: Python, PostgreSQL, API design.' } } : {}) })
    if (reply) blocks.push({ type: 'text', content: reply })
    flushSync(() => root.render(<>{history.map(message => <MessageBubble key={message.id} message={message} />)}{t >= 1 && <div className="new-hook"><MessageBubble message={{ id: 'new-mail', role: 'event', hook: 'Gmail', trigger: 'Just now · CV received', blocks, streaming: t < 8.2 }} /></div>}</>))
  }
}
export function updateHookDemo(t: number) {
  renderHookContent(t)
  const host = document.getElementById('hookdemo-messages')!
  host.scrollTop = scrollAt(scrollBeats, t)
  updateToolEntrances(host, t, [2.6, 4.6])
  // CSS animation clocks are frozen for export; rotate the real hook loader
  // from composition time so playback and backwards seeking stay consistent.
  const spinner = host.querySelector('.new-hook .animate-spin')
  if (spinner) gsap.set(spinner, { rotation: Math.max(0, t - 1) * 360, transformOrigin: '50% 50%' })
  const incoming = host.querySelector('.new-hook')
  if (incoming) {
    const p = gsap.parseEase('power2.out')(Math.max(0, Math.min(1, (t - 1) / .4)))
    gsap.set(incoming, { '--hook-opacity': p, '--hook-blur': `${(1 - p) * 3}px` })
  }
  const running = host.querySelectorAll('.tool-activity-running')
  if (running.length) gsap.set(running, { backgroundPosition: `${100 - (t % 1.65) / 1.65 * 200}% 50%` })
}
