import { gsap } from 'gsap'
import recorded from './renders/minecraft-cursor-track.json'

const track = [{ ...recorded[0], t: 0 }, ...recorded, { ...recorded[recorded.length - 1], t: 3 }]
let cursor: HTMLElement
export function mountGameplayCursor() {
  cursor = document.createElement('div')
  cursor.className = 'scripted-cursor gameplay-cursor'
  for (const source of document.querySelectorAll('#demo-cursor svg')) {
    const icon = source.cloneNode(true) as SVGElement
    icon.removeAttribute('id')
    cursor.append(icon)
  }
  document.querySelector('.gameplay-window')!.append(cursor)
}
export function updateGameplayCursor(t: number) {
  if (!cursor) return
  if (t < 0 || t >= 3) { gsap.set(cursor, { opacity: 0 }); return }
  const index = Math.max(0, track.findIndex(point => point.t > t) - 1)
  const a = track[index], b = track[index + 1] ?? a
  const p = Math.max(0, Math.min(1, (t - a.t) / Math.max(.001, b.t - a.t)))
  const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p
  const frame = cursor.parentElement!
  // Same object-fit:cover geometry as the video, including its vertical crop.
  const scale = Math.max(frame.clientWidth / 1920, frame.clientHeight / 1080)
  const hand = a.kind === 'hand'
  const press = Math.max(0, 1 - Math.abs(t - 1.85) / .08)
  gsap.set(cursor, {
    x: x * scale + (frame.clientWidth - 1920 * scale) / 2 - (hand ? 16 : 3),
    y: y * scale + (frame.clientHeight - 1080 * scale) / 2 - (hand ? 4 : 2),
    opacity: 1, scale: 1 - .06 * press,
  })
  gsap.set(cursor.children[0], { visibility: hand ? 'hidden' : 'visible' })
  gsap.set(cursor.children[1], { visibility: hand ? 'visible' : 'hidden' })
}
