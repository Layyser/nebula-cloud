import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { gsap } from 'gsap'
import { MessageBubble } from '../../../nebula-frontend/src/components/chat/MessageBubble'
import { DemoComposer, mountAppSidebar } from './app-shell'
import { updateToolEntrances } from './tool-entrances'
import type { ChatMessage, ContentBlock, ToolCallBlock } from '../../../nebula-frontend/src/hooks/useChat'

export const WORKING_START = 12.58
export const WORKING_DURATION = 9.5
let root: Root
let lastPhase = ''
let composer: Root
const intro = 'I’ll review the changes, check the tests, and write a concise summary.'
const summary = '**Release summary ready.**\n\n- Improved feed ranking and added regression coverage.\n- **3 tests passed.**\n- Saved to `RELEASE_NOTES.md`.'
const streamed = (text: string, t: number, start: number, duration: number) => text.slice(0, Math.floor(Math.min(1, Math.max(0, (t - start) / duration)) * text.length))
const request: ChatMessage = { id: 'demo-user', role: 'user', blocks: [{ type: 'text', content: 'Review the latest changes and write a release summary.' }] }
function tool(id: string, name: string, args: Record<string, unknown>, complete: boolean, result: Record<string, unknown>): ToolCallBlock {
  return { type: 'tool_call', id, name, args, ...(complete ? { result } : {}) }
}
export function mountWorkingScene() {
  root = createRoot(document.getElementById('working-messages')!)
  mountAppSidebar('working-window')
  const input = document.createElement('div')
  input.id = 'working-input'
  document.getElementById('working-window')!.append(input)
  composer = createRoot(input)
  lastPhase = ''
  updateWorkingScene(0)
}
export function updateWorkingScene(t: number) {
  if (!root) return
  const introText = streamed(intro, t, .2, .7)
  const summaryText = streamed(summary, t, 7.45, 1.25)
  const phase = `${[0, .9, 2.6, 3.15, 4.6, 5.6, 5.9, 7.2, 8.7].filter(at => t >= at).length}:${introText.length}:${summaryText.length}`
  if (phase !== lastPhase) {
    lastPhase = phase
    const blocks: ContentBlock[] = []
    if (introText) blocks.push({ type: 'text', content: introText })
    if (t >= .9) blocks.push(tool('demo-diff', 'bash', { cmd: 'git diff --stat' }, t >= 2.6, { exit_code: 0, output: 'src/ranking.ts        | 12 ++++++++----\ntests/ranking.test.ts |  6 ++++++\n2 files changed, 14 insertions(+), 4 deletions(-)' }))
    if (t >= 3.15) {
      blocks.push(tool('demo-read', 'read_file', { path: 'src/ranking.ts' }, t >= 4.6, { content: 'export function rankFeed(items) { return items.toSorted(byRelevance) }' }))
      blocks.push(tool('demo-tests', 'bash', { cmd: 'bun test' }, t >= 5.6, { exit_code: 0, output: '3 pass\n0 fail\nRan 3 tests in 18ms.' }))
    }
    if (t >= 5.9) blocks.push(tool('demo-write', 'write_file', { path: 'RELEASE_NOTES.md', content: '# Release summary\n\n- Improved feed ranking.\n- Added regression tests.\n- All 3 tests pass.\n' }, t >= 7.2, { success: true, path: 'RELEASE_NOTES.md' }))
    if (summaryText) blocks.push({ type: 'text', content: summaryText })
    flushSync(() => {
      root.render(<><MessageBubble message={request} /><MessageBubble message={{ id: 'demo-agent', role: 'assistant', streaming: t < 8.7, blocks }} isLatestAssistant /></>)
      composer.render(<DemoComposer streaming={t < 8.7} />)
    })
  }
  // Original CSS sheen, driven by composition time rather than wall-clock CSS.
  const pending = document.querySelectorAll('#working-messages .tool-activity-running')
  updateToolEntrances(document.getElementById('working-messages')!, t, [.9, 3.15, 3.15, 5.9])
  if (pending.length) gsap.set(pending, { backgroundPosition: `${100 - ((Math.max(0, t - .9) % 1.65) / 1.65) * 200}% 50%` })
}
export function addWorkingTimeline(timeline: gsap.core.Timeline, start = WORKING_START) {
  timeline.set('#working-scene', { autoAlpha: 1 }, start)
  timeline.to({}, { duration: WORKING_DURATION }, start)
}
