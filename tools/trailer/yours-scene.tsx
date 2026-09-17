import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { gsap } from 'gsap'
import { capabilityMetadata } from '../../../nebula-frontend/src/components/ui/capability-metadata'
import { Bot } from '../../../nebula-frontend/node_modules/lucide-react'

export const YOURS_START = 28.25
export const YOURS_DURATION = 8.1
const items = [
  { name: 'Skills', Icon: capabilityMetadata.skills.icon },
  { name: 'Agents', Icon: Bot },
  { name: 'Commands', Icon: capabilityMetadata.commands.icon },
  { name: 'Rules', Icon: capabilityMetadata.rules.icon },
]
export function mountYoursScene() {
  flushSync(() => createRoot(document.getElementById('yours-copy')!).render(
    <h1 id="yours-title"><span className="yours-prefix"><span>Make</span><span>it</span><span>yours.</span></span>
      <span id="yours-slot">{items.map(({ name, Icon }, i) =>
        <span className="yours-item" id={`yours-item-${i}`} key={name}><span>{name}</span><Icon size={84} strokeWidth={1.65} aria-hidden="true" /></span>,
      )}</span>
    </h1>,
  ))
}
export function addYoursTimeline(timeline: gsap.core.Timeline, start = YOURS_START) {
  timeline.set('#yours-scene', { autoAlpha: 1 }, start)
  if (start > 0) timeline.set('#hooks-scene', { autoAlpha: 0 }, start)
  document.querySelectorAll('.yours-prefix > span').forEach((word, i) => {
    timeline.fromTo(word, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: .13, ease: 'power2.out' }, start + [.2, .56, .9][i])
  })
  timeline.fromTo('#yours-item-0', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .24, ease: 'power2.out' }, start + 1.8)
  for (let i = 0; i < items.length - 1; i++) {
    const at = start + 3.05 + i * 1.7
    timeline.to(`#yours-item-${i}`, { opacity: 0, y: -72, duration: .48, ease: 'power2.inOut' }, at)
    timeline.fromTo(`#yours-item-${i + 1}`, { opacity: 0, y: 72 }, { opacity: 1, y: 0, duration: .48, ease: 'power2.inOut' }, at)
  }
  timeline.to({}, { duration: .5 }, start + YOURS_DURATION - .5)
}
export function updateYoursScene(seconds: number, shader: HTMLCanvasElement) {
  if (seconds < YOURS_START) return
  const canvas = document.getElementById('yours-shader') as HTMLCanvasElement
  canvas.getContext('2d')!.drawImage(shader, 0, 0, canvas.width, canvas.height)
}
