import type { gsap } from 'gsap'
import github from '../../apps/web/src/assets/github-142-svgrepo-com.svg'
import telegram from '../../apps/web/src/assets/telegram-svgrepo-com.svg'
import gmail from '../../apps/web/src/assets/gmail-svgrepo-com.svg'

export const HOOKS_START = 21.85
export const HOOKS_DURATION = 3.4
export function mountHooksScene() {
  document.getElementById('hooks-copy')!.innerHTML = `<h1 id="hooks-title"><span class="hooks-prefix"><span>Connect</span> <span>hooks</span> <span>from</span></span><span id="hooks-slot">${[
    ['GitHub', github], ['Telegram', telegram], ['Gmail', gmail],
  ].map(([name, url], i) => `<span class="hooks-company" id="hooks-company-${i}"><span>${name}</span><img class="${i === 0 ? 'hooks-github' : ''}" src="${url}" alt="" /></span>`).join('')}</span></h1>`
}
export function addHooksTimeline(timeline: gsap.core.Timeline, start = HOOKS_START) {
  timeline.set('#hooks-scene', { autoAlpha: 1 }, start)
  if (start > 0) timeline.set('#terminal-scene', { autoAlpha: 0 }, start)
  document.querySelectorAll('.hooks-prefix > span').forEach((word, i) => {
    timeline.fromTo(word, { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: .13, ease: 'power2.out' }, start + [.2, .56, .9][i])
  })
  // Each name/logo pair is one animated element, including its first appearance.
  timeline.fromTo('#hooks-company-0', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .24, ease: 'power2.out' }, start + 1.24)
  for (let i = 0; i < 2; i++) {
    const at = start + [1.85, 2.5][i]
    timeline.to(`#hooks-company-${i}`, { opacity: 0, y: -72, duration: .48, ease: 'power2.inOut' }, at)
    timeline.fromTo(`#hooks-company-${i + 1}`, { opacity: 0, y: 72 },
      { opacity: 1, y: 0, duration: .48, ease: 'power2.inOut' }, at)
  }
  timeline.to({}, { duration: .5 }, start + HOOKS_DURATION - .5)
}
export function updateHooksScene(seconds: number, shader: HTMLCanvasElement) {
  if (seconds < HOOKS_START) return
  const target = document.getElementById('hooks-shader') as HTMLCanvasElement
  target.getContext('2d')!.drawImage(shader, 0, 0, target.width, target.height)
}
