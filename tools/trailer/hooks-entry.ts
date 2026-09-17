import { gsap } from 'gsap'
import { createShaderRenderer } from './shader-renderer'
import { mountHooksScene, addHooksTimeline } from './hooks-scene'
mountHooksScene()
const draw = createShaderRenderer(document.getElementById('hooks-shader') as HTMLCanvasElement)
const timeline = gsap.timeline({ paused: true, onUpdate() { draw(timeline.time() + 25.47) } })
addHooksTimeline(timeline, 0)
draw(25.47)
window.trailerTimeline = timeline
window.__timelines = { hooks: timeline }
