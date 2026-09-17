import type { gsap } from 'gsap'
import { addCameraCut } from './camera-cut'

export function updateControlTitle(seconds: number, shader: HTMLCanvasElement) {
  if (seconds < 13.2 || seconds > 15.44) return
  const canvas = document.getElementById('control-shader') as HTMLCanvasElement
  canvas.getContext('2d')!.drawImage(shader, 0, 0, canvas.width, canvas.height)
}

export function addControlTitle(timeline: gsap.core.Timeline) {
  timeline.set('#chat-scene', { visibility: 'hidden' }, 13.2)
  timeline.set('#control-scene', { autoAlpha: 1 }, 13.2)
  // Same per-word lift/fade as the opening title, with a sentence-length hold.
  document.querySelectorAll('#control-title span').forEach((word, index) => {
    timeline.fromTo(word, { opacity: 0, y: 7 },
      { opacity: 1, y: 0, duration: .13, ease: 'power2.out' }, [13.4, 13.76, 14.54][index])
  })
  addCameraCut(timeline, {
    fromScene: '#control-scene', fromCamera: '#control-camera',
    toScene: '#sidebar-scene', toCamera: '#sidebar-camera',
    at: 15.2, direction: 'down', distance: 300, halfDuration: .24,
  })
}
