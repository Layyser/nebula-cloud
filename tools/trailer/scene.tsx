import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { gsap } from 'gsap'
import { addCameraCut } from './camera-cut'
import { mountSidebarScene, updateSidebarScene, addSidebarTimeline } from './sidebar-scene'
import { mountTerminalScene, addTerminalTimeline, updateTerminalScene } from './terminal-scene'
import { updateControlTitle, addControlTitle } from './control-title'
import { NebulaMark } from '../../../nebula-frontend/src/components/ui/NebulaMark'
import { ChatInput } from '../../../nebula-frontend/src/components/chat/ChatInput'
import { mountAppSidebar } from './app-shell'
import { createShaderRenderer } from './shader-renderer'
import { mountHooksScene, addHooksTimeline, updateHooksScene } from './hooks-scene'
import { mountYoursScene, addYoursTimeline, updateYoursScene } from './yours-scene'
import { mountWorkingScene, addWorkingTimeline, updateWorkingScene, WORKING_START } from './working-scene'
import { mountAssembly, addAssemblyTimeline, updateAssembly, EDIT } from './assembly'
import './assembly.css'

flushSync(() => createRoot(document.getElementById('logo')!).render(<NebulaMark size={100} />))
const noop = () => {}
mountSidebarScene()
mountTerminalScene()
mountHooksScene()
mountYoursScene()
mountWorkingScene()
mountAppSidebar('chat-window')
mountAssembly()
flushSync(() => createRoot(document.getElementById('chat-input')!).render(
  <ChatInput
    session={null} agents={[]} pendingAgent={null}
    onSend={noop} onAbort={noop} onSwitchAgent={noop} streaming={false}
    securityMode="sandbox" securityModeOverride={null} onSwitchSecurityMode={noop}
    model="opencode/deepseek-v4-flash" reasoningEffort="high" reasoningEffortOverride="high" onSwitchModel={noop}
    onSwitchReasoningEffort={noop} onSwitchCwd={async () => {}}
    models={[{ slug: 'opencode/deepseek-v4-flash', provider: 'opencode', reasoning_efforts: ['low', 'medium', 'high'] }]}
    cwd="/home/nebula/workspace/x-algorithm" workspaceRoot="/home/nebula/workspace"
    placeholder="Send a message..."
  />,
))
const prompt = 'Review the latest changes and write a release summary.'
let previousText = ''
function updateChat(seconds: number) {
  const text = seconds >= 12.1 ? '' : prompt.slice(0, Math.floor(Math.max(0, Math.min(1, (seconds - 8.95) / 1.8)) * prompt.length))
  if (text === previousText) return
  previousText = text
  const input = document.querySelector<HTMLTextAreaElement>('#chat-input textarea')!
  // Use the real input handler so send-button state and sizing remain genuine.
  flushSync(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const canvas = document.getElementById('shader') as HTMLCanvasElement
const draw = createShaderRenderer(canvas)
function updateChatWindow(seconds: number) {
  if (seconds < 8.4 || seconds > 13.2) return
  const target = document.getElementById('chat-window-shader') as HTMLCanvasElement
  target.getContext('2d')!.drawImage(canvas, 0, 0, target.width, target.height)
}

const cursorMotion = { progress: 0, opacity: 0, press: 1 }
function updateCursor() {
  const button = document.querySelector<HTMLButtonElement>('#chat-input button[aria-label="Send message"]')!
  const root = document.getElementById('opening')!.getBoundingClientRect()
  // Measure the unpressed hit area so seeking or pressing never shifts the path.
  button.style.transform = 'none'
  const target = button.getBoundingClientRect()
  const ratio = 1920 / root.width
  const left = (target.left - root.left) * ratio
  const top = (target.top - root.top) * ratio
  const width = target.width * ratio
  const height = target.height * ratio
  const x = left + width * 0.74 - 330 * (1 - cursorMotion.progress)
  const y = top + height * 0.74 + 180 * (1 - cursorMotion.progress)
  // Hit-test the pointer tip against the rounded button, not its arrival time.
  const radius = 8 * 1.8
  const nearestX = Math.max(left + radius, Math.min(left + width - radius, x))
  const nearestY = Math.max(top + radius, Math.min(top + height - radius, y))
  const hovering = cursorMotion.opacity > 0 && Math.hypot(x - nearestX, y - nearestY) <= radius
  button.dataset.demoHover = String(hovering)
  button.style.transform = `scale(${cursorMotion.press})`
  gsap.set('#demo-cursor', {
    x: x - (hovering ? 16 : 3),
    y: y - (hovering ? 4 : 2),
    opacity: cursorMotion.opacity,
    scale: cursorMotion.press,
    transformOrigin: '16px 4px',
  })
  gsap.set('#cursor-arrow', { visibility: hovering ? 'hidden' : 'visible' })
  gsap.set('#cursor-hand', { visibility: hovering ? 'visible' : 'hidden' })
}
const timeline = gsap.timeline({ paused: true, onUpdate() {
  const t = timeline.time()
  draw(t)
  updateControlTitle(t - (EDIT.control - 13.2), canvas)
  updateSidebarScene(t - (EDIT.control - 13.2), canvas)
  updateTerminalScene(t - (EDIT.control - 13.2))
  updateHooksScene(t - EDIT.hooks + 21.85, canvas)
  updateAssembly(t, canvas)
} })
const beats = [0.2, 0.62, 0.88, 1.32, 1.55, 1.78, 2.04]
document.querySelectorAll('#title span').forEach((word, index) => {
  timeline.fromTo(word, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: 0.13, ease: 'power2.out' }, beats[index])
})
addCameraCut(timeline, {
  fromScene: '#intro', fromCamera: '#camera',
  toScene: '#reveal', toCamera: '#reveal-camera',
  at: 3.38, direction: 'down', distance: 300, halfDuration: .24,
})
timeline.fromTo('#meet', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 3.95)
timeline.fromTo('#identity', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 4.85)
const controlSequence = gsap.timeline()
addControlTitle(controlSequence)
addSidebarTimeline(controlSequence)
addTerminalTimeline(controlSequence)
timeline.add(controlSequence, EDIT.control - 13.2)
addHooksTimeline(timeline, EDIT.hooks)
addAssemblyTimeline(timeline)
draw(0)
// Optional generated proof composition exercises the identical timeline and
// export pipeline over a short interval; the normal preview is unchanged.
const proofStart = document.getElementById('opening')!.dataset.proofStart
const playback = proofStart === undefined ? timeline : gsap.timeline({ paused: true, onUpdate() { timeline.totalTime(Number(proofStart) + playback.time()) } })
if (proofStart !== undefined) playback.to({}, { duration: Number(document.getElementById('opening')!.dataset.proofDuration ?? 8) })
window.__timelines = { opening: playback }
window.trailerTimeline = playback
