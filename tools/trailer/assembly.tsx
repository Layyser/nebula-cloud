import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { gsap } from 'gsap'
import { MessageBubble } from '../../../nebula-frontend/src/components/chat/MessageBubble'
import { NebulaMark } from '../../../nebula-frontend/src/components/ui/NebulaMark'
import { DemoComposer, mountAppSidebar } from './app-shell'
import { addCameraCut, addZoomCut } from './camera-cut'
import postgres from '../../apps/web/src/assets/postgresql-svgrepo-com.svg'
import redis from '../../apps/web/src/assets/redis.svg'
import bun from '../../apps/web/src/assets/bun.svg'
import python from '../../apps/web/src/assets/python-svgrepo-com.svg'
import node from '../../apps/web/src/assets/nodejs-icon-svgrepo-com.svg'
import java from '../../apps/web/src/assets/java-svgrepo-com.svg'
import { mountScriptedChat, addScriptedChat, updateScriptedChat } from './scripted-chat'
import { mountHookDemo, updateHookDemo } from './hook-demo'
import { mountGameplayCursor, updateGameplayCursor } from './gameplay-cursor'

export const EDIT = { hooks: 6.8, hookdemo: 10.2, deploy: 20.2, redis: 24, control: 39.25, sidebar: 41.49, terminal: 43.16, install: 46.66, fun: 50.46, minecraft: 54.26, gameplay: 64.26, end: 70.26, duration: 73.26 }
function wrap(id: string, cameraId: string) {
  const scene = document.getElementById(id)!
  const camera = document.createElement('div')
  camera.id = cameraId
  camera.className = 'assembly-camera'
  camera.append(...Array.from(scene.childNodes))
  scene.append(camera)
}
function section(id: string, start: number, duration: number, content: string) {
  const element = document.createElement('section')
  element.id = `${id}-scene`
  element.className = 'clip assembly-scene'
  const proofOffset = Number(document.getElementById('opening')!.dataset.proofStart ?? 0)
  Object.assign(element.dataset, { start: String(start - proofOffset), duration: String(duration), trackIndex: '10' })
  element.innerHTML = `<div id="${id}-camera" class="assembly-camera">${content}</div>`
  document.getElementById('opening')!.append(element)
}
const shader = (id: string) => `<canvas id="${id}-shader" class="title-shader" width="1280" height="720"></canvas>`
function carousel(id: string, words: string[], items: [string, string][], names: boolean) {
  return `<h1 class="assembly-title"><span class="assembly-prefix">${words.map(word => `<span>${word}</span>`).join(' ')}</span><span class="assembly-slot ${names ? '' : 'icons-only'}">${items.map(([name, url], i) => `<span class="assembly-item" id="${id}-item-${i}">${names ? `<span>${name}</span>` : ''}<img src="${url}" alt="${name}" /></span>`).join('')}</span></h1>`
}
export function mountAssembly() {
  wrap('hooks-scene', 'hooks-camera')
  wrap('working-scene', 'working-camera')
  for (const id of ['yours-scene', 'chat-scene', 'working-scene']) document.getElementById(id)!.style.display = 'none'
  section('hookdemo', EDIT.hookdemo, 10, '<div id="hookdemo-window"><div id="hookdemo-messages" class="scripted-messages"></div><div id="hookdemo-input"></div></div>')
  mountHookDemo()
  section('deploy', EDIT.deploy, 3.8, shader('deploy') + carousel('deploy', ['Deploy', 'anything.'], [['PostgreSQL', postgres], ['Redis', redis], ['Bun', bun]], false))
  section('redis', EDIT.redis, EDIT.control - EDIT.redis, '<div id="redis-window"></div>')
  mountScriptedChat('redis')
  section('install', EDIT.install, 3.8, shader('install') + carousel('install', ['Install', 'anything.'], [['Python', python], ['Node.js', node], ['Java', java]], true))
  section('fun', EDIT.fun, 3.8, '<h1 class="assembly-title fun-title"><span>And</span> <span>also,</span> <span>have</span> <span>fun.</span></h1>')
  section('minecraft', EDIT.minecraft, EDIT.gameplay - EDIT.minecraft, '<div id="minecraft-window"></div>')
  mountScriptedChat('minecraft')
  // A DOM image sequence stays inside the rounded frame and scene visibility.
  // The exporter must not promote the recording to an independent video layer.
  section('gameplay', EDIT.gameplay, 6, '<div class="gameplay-window"><img id="minecraft-footage" src="./assets/minecraft-frames/0000.jpg" alt="" /></div>')
  section('finish', EDIT.end, 3, shader('finish') + '<div id="finish-brand"></div>')
  mountGameplayCursor()
  flushSync(() => createRoot(document.getElementById('finish-brand')!).render(<><NebulaMark size={100} /><span className="nebula-wordmark">Nubols</span></>))
}
function addCarousel(timeline: gsap.core.Timeline, id: string, start: number) {
  document.querySelectorAll(`#${id}-scene .assembly-prefix > span`).forEach((word, i) => timeline.fromTo(word, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: .13, ease: 'power2.out' }, start + .4 + i * .4))
  // Sentence-ending punctuation gets a beat before even a logo-only response.
  timeline.fromTo(`#${id}-item-0`, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .24 }, start + 1.8)
  for (let i = 0; i < 2; i++) {
    const at = start + 2.3 + i * .65
    timeline.to(`#${id}-item-${i}`, { opacity: 0, y: -90, duration: .48, ease: 'power2.inOut' }, at)
    timeline.fromTo(`#${id}-item-${i + 1}`, { opacity: 0, y: 90 }, { opacity: 1, y: 0, duration: .48, ease: 'power2.inOut' }, at)
  }
}
export function addAssemblyTimeline(timeline: gsap.core.Timeline) {
  const pan = (from: string, to: string, at: number, direction: 'right' | 'down') => addCameraCut(timeline, { fromScene: `#${from}-scene`, fromCamera: `#${from}-camera`, toScene: `#${to}-scene`, toCamera: `#${to}-camera`, at: at - .24, direction })
  const zoom = (from: string, to: string, at: number, direction: 'in' | 'out') => addZoomCut(timeline, { fromScene: `#${from}-scene`, fromCamera: `#${from}-camera`, toScene: `#${to}-scene`, toCamera: `#${to}-camera`, at: at - .24, direction })
  timeline.set('#reveal', { autoAlpha: 0 }, EDIT.hooks)
  timeline.set('#redis-scene', { autoAlpha: 0 }, EDIT.control)
  pan('terminal', 'install', EDIT.install, 'down')
  timeline.set('#hookdemo-window', { transformOrigin: '0 0', x: -420, y: -60, scale: 1.4 }, 0)
  zoom('hooks', 'hookdemo', EDIT.hookdemo, 'out')
  pan('hookdemo', 'deploy', EDIT.deploy, 'right')
  addCarousel(timeline, 'deploy', EDIT.deploy)
  zoom('deploy', 'redis', EDIT.redis, 'in')
  addScriptedChat(timeline, 'redis', EDIT.redis)
  addCarousel(timeline, 'install', EDIT.install)
  pan('install', 'fun', EDIT.fun, 'right')
  document.querySelectorAll('.fun-title > span').forEach((word, i) => timeline.fromTo(word, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: .13, ease: 'power2.out' }, EDIT.fun + [.4, .78, 1.8, 2.18][i]))
  zoom('fun', 'minecraft', EDIT.minecraft, 'in')
  addScriptedChat(timeline, 'minecraft', EDIT.minecraft)
  addZoomCut(timeline, { fromScene: '#minecraft-scene', fromCamera: '#minecraft-camera', toScene: '#gameplay-scene', toCamera: '#gameplay-camera', at: EDIT.gameplay - .24, direction: 'in', amount: .55 })
  timeline.set('.gameplay-window', { scale: 1.045 }, EDIT.gameplay)
  zoom('gameplay', 'finish', EDIT.end, 'out')
  timeline.to({}, { duration: 3 }, EDIT.end)
}
export function updateAssembly(seconds: number, source: HTMLCanvasElement) {
  updateGameplayCursor(seconds - EDIT.gameplay)
  if (seconds >= EDIT.gameplay && seconds < EDIT.end) {
    const frame = Math.min(359, Math.max(0, Math.floor((seconds - EDIT.gameplay) * 60 + 1e-6)))
    const footage = document.getElementById('minecraft-footage') as HTMLImageElement
    const src = `./assets/minecraft-frames/${String(frame).padStart(4, '0')}.jpg`
    if (footage.getAttribute('src') !== src) footage.setAttribute('src', src)
  }
  if (seconds >= EDIT.hookdemo && seconds <= EDIT.deploy) updateHookDemo(seconds - EDIT.hookdemo)
  for (const [id, start, end] of [['deploy', EDIT.deploy, EDIT.redis], ['install', EDIT.install, EDIT.fun], ['finish', EDIT.end, EDIT.duration]] as const) {
    if (seconds < start || seconds > end) continue
    const target = document.getElementById(`${id}-shader`) as HTMLCanvasElement
    target.getContext('2d')!.drawImage(source, 0, 0, target.width, target.height)
  }
  if (seconds >= EDIT.redis && seconds <= EDIT.control) updateScriptedChat('redis', seconds - EDIT.redis, source)
  if (seconds >= EDIT.minecraft && seconds <= EDIT.gameplay) updateScriptedChat('minecraft', seconds - EDIT.minecraft, source)
}
