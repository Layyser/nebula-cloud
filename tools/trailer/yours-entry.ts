import { gsap } from 'gsap'
import { createShaderRenderer } from './shader-renderer'
import { mountYoursScene, addYoursTimeline } from './yours-scene'
mountYoursScene()
const draw = createShaderRenderer(document.getElementById('yours-shader') as HTMLCanvasElement)
const timeline = gsap.timeline({ paused: true, onUpdate() { draw(timeline.time() + 28.25) } })
addYoursTimeline(timeline, 0)
draw(28.25)
window.trailerTimeline = timeline
window.__timelines = { yours: timeline }
