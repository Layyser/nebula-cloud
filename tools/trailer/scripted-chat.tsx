import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { gsap } from 'gsap'
import { DemoComposer, mountAppSidebar } from './app-shell'
import { MessageBubble } from '../../../nebula-frontend/src/components/chat/MessageBubble'
import { updateToolEntrances } from './tool-entrances'
import type { ContentBlock } from '../../../nebula-frontend/src/hooks/useChat'

const SEND = 3.1
const SETTLED = SEND + .48
// Illustrative continuation only: no external site or repository is modified.
const redisFollowup = {
  at: 8.5,
  workAt: 10,
  prompt: 'Yes, please wire it to my deployed page at https://launchboard.nubols.com — repo: launchboard.',
  reply: '**Connected.** Launchboard now uses Redis for caching. Checked the connection and redeployed the app.',
  tools: [
    ['read_file', { path: 'launchboard/src/server.ts' }, 'Located the server-side cache integration.'],
    ['edit_file', { path: 'launchboard/src/server.ts' }, 'Wired the server-side cache to redis://127.0.0.1:6379.'],
    ['bash', { cmd: 'cd launchboard && bun test && bun run deploy' }, 'Cache integration passed. Page redeployed successfully.'],
  ],
}
const configurations = {
  redis: { project: 'redis-cache', prompt: 'Start a Redis server locally on this machine.', reply: '**Redis running at localhost:6379.**\n\nDo you want to expose it to the internet, or just wire it to another service running on this machine?', tools: [
    ['redis-server --bind 127.0.0.1 --port 6379 --daemonize yes', 'Redis started on localhost:6379.'],
    ['redis-cli -h 127.0.0.1 -p 6379 ping', 'PONG'],
  ] },
  minecraft: { project: 'weekend-world', prompt: 'Install Minecraft 26.2 and start a server for me and my friends.', reply: '**Minecraft 26.2 server is running!**\n\nConnect at **tcp.nubols.com:20000** and tell your friends to join.', tools: [
    ['micromamba install -y -n tools -c conda-forge openjdk', 'Java installed.'],
    ['curl -L "$MINECRAFT_SERVER_URL" -o minecraft_server.jar', 'Minecraft server downloaded.'],
    ['java -jar minecraft_server.jar nogui', 'Server ready on port 25565.'],
    ['nubols expose --tcp minecraft 25565', 'tcp.nubols.com:20000'],
  ] },
}
type Kind = keyof typeof configurations
const states = new Map<Kind, { messages: ReturnType<typeof createRoot>; input: ReturnType<typeof createRoot>; key: string; text: string }>()
export function mountScriptedChat(id: Kind) {
  const host = document.getElementById(`${id}-window`)!
  host.innerHTML = `<canvas class="scripted-shader" width="1280" height="720"></canvas><h1 class="scripted-heading">What should we build?</h1><div id="${id}-messages" class="scripted-messages"></div><div id="${id}-input" class="scripted-input"></div><div class="scripted-cursor"></div>`
  mountAppSidebar(`${id}-window`)
  const state = { messages: createRoot(document.getElementById(`${id}-messages`)!), input: createRoot(document.getElementById(`${id}-input`)!), key: '', text: '' }
  states.set(id, state)
  flushSync(() => state.input.render(<DemoComposer project={configurations[id].project} agent="Coder" security="full" model={id === 'redis' ? 'openai/GPT-6-Astra' : 'opencode/deepseek-v4-flash'} effort={id === 'redis' ? 'low' : 'medium'} />))
  // Reuse the original trailer's arrow and pointer assets.
  const cursor = host.querySelector('.scripted-cursor')!
  for (const source of document.querySelectorAll('#demo-cursor svg')) {
    const icon = source.cloneNode(true) as SVGElement
    icon.removeAttribute('id')
    cursor.append(icon)
  }
}
export function addScriptedChat(timeline: gsap.core.Timeline, id: Kind, start: number) {
  timeline.fromTo(`#${id}-window .scripted-input`, { y: 0 }, { y: () => 960 - document.querySelector<HTMLElement>(`#${id}-input`)!.offsetHeight * 1.7 - 445, duration: .48, ease: 'power2.inOut' }, start + SEND)
  timeline.to(`#${id}-window .scripted-heading`, { opacity: 0, y: -12, duration: .3, ease: 'power2.out' }, start + SEND)
  timeline.to(`#${id}-window .scripted-shader`, { opacity: 0, duration: .48 }, start + SEND)
  if (id === 'minecraft') {
    const window = '#minecraft-window'
    // The inner window handles close-ups; the outer camera retains the
    // existing continuous zoom cut into the framed gameplay placeholder.
    timeline.set(window, { transformOrigin: '0 0', x: 0, y: 0, scale: 1 }, start)
    timeline.to(window, { x: -310, y: -570, scale: 1.85, duration: .65, ease: 'power2.inOut' }, start + .55)
    timeline.to(window, { x: -1480, duration: .65, ease: 'power2.inOut' }, start + 2.05)
    timeline.to(window, { x: -39.6, y: -21.6, scale: 1.045, duration: .65, ease: 'power2.inOut' }, start + SEND)
    timeline.to(window, { x: -470, y: -80, scale: 1.55, duration: .7, ease: 'power2.inOut' }, start + 6.2)
  }
  if (id === 'redis') {
    // Keep editorial framing separate from the outer scene-cut camera.
    // Establish → read the prompt → follow Send → restore context → read result.
    const window = '#redis-window'
    timeline.set(window, { transformOrigin: '0 0', x: 0, y: 0, scale: 1 }, start)
    timeline.to(window, { x: -310, y: -570, scale: 1.85, duration: .65, ease: 'power2.inOut' }, start + .55)
    timeline.to(window, { x: -1480, duration: .65, ease: 'power2.inOut' }, start + 2.05)
    timeline.to(window, { x: 0, y: 0, scale: 1, duration: .65, ease: 'power2.inOut' }, start + SEND)
    timeline.to(window, { x: -420, y: 50, scale: 1.4, duration: .7, ease: 'power2.inOut' }, start + 5.3)
    timeline.fromTo('#redis-input', { autoAlpha: 1 }, { autoAlpha: 0, duration: .4, ease: 'power2.inOut' }, start + 6.7)
    timeline.fromTo(window, { borderColor: '#ffffff24', borderRadius: 26 }, { borderColor: 'transparent', borderRadius: 0, duration: .7 }, start + 5.3)
    timeline.to(window, { y: -320, duration: .8, ease: 'power2.inOut' }, start + 10)
    timeline.fromTo('#redis-messages', { y: 0 }, { y: -35, duration: .8, ease: 'power2.inOut' }, start + 10)
  }
}
export function updateScriptedChat(id: Kind, t: number, shader: HTMLCanvasElement) {
  const state = states.get(id)!
  const config = configurations[id]
  const host = document.getElementById(`${id}-window`)!
  const canvas = host.querySelector('canvas')!
  if (t < SETTLED) canvas.getContext('2d')!.drawImage(shader, 0, 0, canvas.width, canvas.height)
  const typingStart = .85
  const typingDuration = .95
  const text = t >= SEND ? '' : config.prompt.slice(0, Math.floor(Math.max(0, Math.min(1, (t - typingStart) / typingDuration)) * config.prompt.length))
  if (text !== state.text) {
    state.text = text
    const textarea = host.querySelector('textarea')!
    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, text)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const local = t - SETTLED
  const step = .65
  const replyAt = config.tools.length * step + .3
  const partial = config.reply.slice(0, Math.floor(Math.max(0, Math.min(1, (local - replyAt) / 1.1)) * config.reply.length))
  const followVisible = id === 'redis' && t >= redisFollowup.at
  const followTime = t - redisFollowup.workAt
  const followReply = redisFollowup.reply.slice(0, Math.floor(Math.max(0, Math.min(1, (followTime - 2.15) / 1.1)) * redisFollowup.reply.length))
  const followBlocks: ContentBlock[] = followVisible ? redisFollowup.tools.flatMap(([name, args, output], i) => followTime >= i * .65 ? [{ type: 'tool_call' as const, id: `redis-wire-${i}`, name: name as string, args: args as Record<string, string>, ...(followTime >= (i + 1) * .65 ? { result: { output } } : {}) }] : []) : []
  if (followVisible && followReply) followBlocks.push({ type: 'text', content: followReply })
  const key = `${t >= SEND}:${local >= 0}:${Math.floor(Math.max(0, local) / step)}:${partial}:${followVisible}:${followBlocks.length}:${Math.floor(followTime / .65)}:${followReply}`
  if (key !== state.key) {
    state.key = key
    const blocks: ContentBlock[] = config.tools.flatMap(([cmd, output], i) => local >= i * step ? [{ type: 'tool_call' as const, id: `${id}-${i}`, name: 'bash', args: { cmd }, ...(local >= (i + 1) * step ? { result: { exit_code: 0, output } } : {}) }] : [])
    if (partial) blocks.push({ type: 'text', content: partial })
    flushSync(() => {
      state.messages.render(t < SEND ? null : <><MessageBubble message={{ id: `${id}-user`, role: 'user', blocks: [{ type: 'text', content: config.prompt }] }} /><MessageBubble message={{ id: `${id}-agent`, role: 'assistant', blocks, streaming: partial.length < config.reply.length }} isLatestAssistant={!followVisible} />{followVisible && <><section className="redis-followup-entrance"><MessageBubble message={{ id: 'redis-followup-user', role: 'user', blocks: [{ type: 'text', content: redisFollowup.prompt }] }} /></section><MessageBubble message={{ id: 'redis-followup-agent', role: 'assistant', blocks: followBlocks, streaming: followReply.length < redisFollowup.reply.length }} isLatestAssistant /></>}</>)
      state.input.render(<DemoComposer project={config.project} agent="Coder" security="full" model={id === 'redis' ? 'openai/GPT-6-Astra' : 'opencode/deepseek-v4-flash'} effort={id === 'redis' ? 'low' : 'medium'} streaming={(t >= SEND && partial.length < config.reply.length) || (followVisible && followReply.length < redisFollowup.reply.length)} />)
    })
  }
  const followup = host.querySelector('.redis-followup-entrance')
  if (followup) {
    // Derive motion from scene time, so seeks and exports match playback.
    const reveal = gsap.parseEase('power2.out')(Math.max(0, Math.min(1, (t - redisFollowup.at) / .42)))
    gsap.set(followup, { opacity: reveal, y: 6 * (1 - reveal), filter: `blur(${2 * (1 - reveal)}px)` })
  }
  // Anchor the outgoing gameplay zoom on the rendered address, not screen center.
  if (id === 'minecraft' && t > 8) {
    const address = Array.from(host.querySelectorAll('strong')).find(node => node.textContent === 'tcp.nubols.com:20000')
    if (address) {
      const camera = document.getElementById('minecraft-camera')!
      const bounds = host.getBoundingClientRect()
      const target = address.getBoundingClientRect()
      const localX = (target.left + target.width / 2 - bounds.left) * 1760 / bounds.width
      const localY = (target.top + target.height / 2 - bounds.top) * 960 / bounds.height
      gsap.set(camera, { transformOrigin: `${80 - 470 + localX * 1.55}px ${60 - 80 + localY * 1.55}px` })
    }
  } else if (id === 'minecraft') gsap.set('#minecraft-camera', { transformOrigin: '50% 50%' })
  const running = host.querySelectorAll('.tool-activity-running')
  updateToolEntrances(host, local, [...config.tools.map((_, i) => i * step), ...(id === 'redis' ? redisFollowup.tools.map((_, i) => redisFollowup.workAt - SETTLED + i * .65) : [])])
  if (running.length) gsap.set(running, { backgroundPosition: `${100 - ((Math.max(0, local) % 1.65) / 1.65) * 200}% 50%` })
  const cursor = host.querySelector<HTMLElement>('.scripted-cursor')!
  if (t >= SEND) {
    gsap.set(cursor, { opacity: 0 })
    const send = host.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')
    if (send) { send.dataset.demoHover = 'false'; send.style.transform = 'none' }
    return
  }
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!
  button.style.transform = 'none'
  const bounds = host.getBoundingClientRect(), target = button.getBoundingClientRect()
  const ratio = 1760 / bounds.width
  const progress = gsap.parseEase('power2.inOut')(Math.max(0, Math.min(1, (t - 2.1) / .6)))
  const x = (target.left - bounds.left + target.width * .74) * ratio - 280 * (1 - progress)
  const y = (target.top - bounds.top + target.height * .74) * ratio + 110 * (1 - progress)
  const hover = x >= (target.left - bounds.left) * ratio && y <= (target.bottom - bounds.top) * ratio
  const press = t < 2.82 ? 1 : t < 2.94
    ? 1 - .06 * gsap.parseEase('power2.out')((t - 2.82) / .12)
    : .94 + .06 * gsap.parseEase('power2.out')(Math.min(1, (t - 2.94) / .16))
  button.style.transform = `scale(${press})`
  button.dataset.demoHover = String(hover && t < SEND)
  gsap.set(cursor, { x: x - (hover ? 16 : 3), y: y - (hover ? 4 : 2), scale: press, opacity: t >= 2.1 && t < SEND ? 1 : 0 })
  gsap.set(cursor.children[0], { visibility: hover ? 'hidden' : 'visible' })
  gsap.set(cursor.children[1], { visibility: hover ? 'visible' : 'hidden' })
}
