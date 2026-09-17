import type { gsap } from 'gsap'

export type CameraDirection = 'right' | 'left' | 'up' | 'down'
export function zoomGeometry(direction: 'in' | 'out', amount = .18) {
  if (amount <= 0 || amount >= 1) throw new Error('Zoom amount must be between zero and one')
  const delta = direction === 'in' ? amount : -amount
  return { exit: 1 + delta, enter: 1 - delta }
}

/** Same quadratic/cubic velocity handoff as a directional cut, on scale. */
export function addZoomCut(timeline: gsap.core.Timeline, options: {
  fromScene: string; fromCamera: string; toScene: string; toCamera: string;
  at: number; direction: 'in' | 'out'; amount?: number; halfDuration?: number;
}) {
  const { fromScene, fromCamera, toScene, toCamera, at, direction, amount = .18, halfDuration = .24 } = options
  const { exit, enter } = zoomGeometry(direction, amount)
  timeline.fromTo(fromCamera, { scale: 1 }, { scale: exit, duration: halfDuration, ease: 'power1.in' }, at)
  timeline.set(fromScene, { autoAlpha: 0 }, at + halfDuration)
  timeline.set(toScene, { autoAlpha: 1 }, at + halfDuration)
  timeline.fromTo(toCamera, { scale: enter }, { scale: 1, duration: halfDuration * 1.5, ease: 'power2.out' }, at + halfDuration)
}
export function cutGeometry(direction: CameraDirection, distance: number, halfDuration: number) {
  if (distance <= 0 || halfDuration <= 0) throw new Error('Camera cut requires positive distance and duration')
  const vectors = { right: [-1, 0], left: [1, 0], up: [0, 1], down: [0, -1] }
  const [x, y] = vectors[direction]
  return { x: x * distance, y: y * distance, peakSpeed: 2 * distance / halfDuration }
}

/** Animate unscaled camera wrappers. Camera right means the world travels left.
 * Quadratic acceleration hands off to a cubic deceleration lasting 1.5× longer.
 * Both start/end cut velocities equal 2d/duration; the cubic tail lets both
 * velocity and acceleration settle to zero at the destination.
 * There is no crossfade, pause, zoom, or direction reversal at the handoff.
 */
export function addCameraCut(timeline: gsap.core.Timeline, options: {
  fromScene: string; fromCamera: string; toScene: string; toCamera: string
  at: number; direction: CameraDirection; distance?: number; halfDuration?: number
}) {
  const { fromScene, fromCamera, toScene, toCamera, at, direction, distance = 300, halfDuration = 0.24 } = options
  const delta = cutGeometry(direction, distance, halfDuration)
  const cut = at + halfDuration
  const settleDuration = halfDuration * 1.5
  timeline.fromTo(fromCamera, { x: 0, y: 0 }, { x: delta.x, y: delta.y, duration: halfDuration, ease: 'power1.in' }, at)
  // Opacity also gates descendants such as xterm's explicit visibility:visible.
  timeline.set(fromScene, { autoAlpha: 0 }, cut)
  timeline.set(toScene, { autoAlpha: 1 }, cut)
  timeline.fromTo(toCamera, { x: -delta.x, y: -delta.y }, { x: 0, y: 0, duration: settleDuration, ease: 'power2.out' }, cut)
  return { cut, end: cut + settleDuration, peakSpeed: delta.peakSpeed }
}
