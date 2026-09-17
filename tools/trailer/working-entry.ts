import { gsap } from 'gsap'
import { mountWorkingScene, updateWorkingScene, addWorkingTimeline } from './working-scene'
mountWorkingScene()
const timeline = gsap.timeline({ paused: true, onUpdate() { updateWorkingScene(timeline.time()) } })
addWorkingTimeline(timeline, 0)
window.trailerTimeline = timeline
window.__timelines = { working: timeline }
