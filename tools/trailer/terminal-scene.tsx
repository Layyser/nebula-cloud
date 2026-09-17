import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { TerminalPage } from '../../apps/web/src/components/cloud/TerminalPage'
import { addCameraCut } from './camera-cut'
import { writeTerminalFixture } from './terminal-preview-driver'
import type { gsap } from 'gsap'

export const TERMINAL_CUT = 17.11
export const TRAILER_END = 20.61
const prompt = '\x1b[1;32mnebula@nubols\x1b[0m:\x1b[1;34m~/workspace/x-algorithm\x1b[0m$ '
// ANSI is parsed by the production xterm renderer. No socket or shell is used.
const output = [
  prompt + 'git status --short',
  ' \x1b[33mM\x1b[0m src/ranking.ts',
  ' \x1b[33mM\x1b[0m tests/ranking.test.ts',
  '',
  prompt + 'bun test',
  '\x1b[90mbun test v1.3.0\x1b[0m',
  '',
  '\x1b[32m✓\x1b[0m ranks relevant results first',
  '\x1b[32m✓\x1b[0m keeps the timeline stable',
  '\x1b[32m✓\x1b[0m handles an empty feed',
  '',
  '\x1b[1;32m3 pass\x1b[0m  \x1b[90m0 fail · 18ms\x1b[0m',
  '',
  prompt + 'git diff --stat',
  ' src/ranking.ts        | 12 \x1b[32m++++++++\x1b[31m----\x1b[0m',
  ' tests/ranking.test.ts |  6 \x1b[32m++++++\x1b[0m',
  ' 2 files changed, 14 insertions(+), 4 deletions(-)',
  '',
  prompt,
]

export function mountTerminalScene() {
  localStorage.setItem('nebula:terminals:trailer-preview', JSON.stringify([
    { id: 'terminal-1', label: 'Terminal 1' }, { id: 'terminal-2', label: 'Terminal 2' },
  ]))
  flushSync(() => createRoot(document.getElementById('terminal-ui')!).render(
    <TerminalPage workspaceId="trailer-preview" previewOutput={[]} />,
  ))
  // Keep the app tabs and xterm, but crop out its page heading for this close-up.
  const heading = document.querySelector('#terminal-ui h1, #terminal-ui h2')
  if (heading) {
    let parent = heading.parentElement
    const container = document.querySelector('#terminal-ui section > div')
    while (parent?.parentElement && parent.parentElement !== container) parent = parent.parentElement
    if (parent && parent !== container) parent.setAttribute('data-trailer-heading', '')
  }
}

export function updateTerminalScene(seconds: number) {
  const t = seconds - TERMINAL_CUT
  let text = ''
  const commands = [
    { command: 'git status --short', start: .3, duration: .65, resultAt: 1.06, result: output.slice(1, 4) },
    { command: 'bun test', start: 1.3, duration: .45, resultAt: 1.92, result: output.slice(5, 13) },
  ]
  for (const item of commands) {
    const count = Math.floor(Math.max(0, Math.min(1, (t - item.start) / item.duration)) * item.command.length)
    text += prompt + item.command.slice(0, count)
    if (t < item.resultAt) break
    text += '\r\n' + item.result.join('\r\n') + '\r\n'
    if (item === commands.at(-1)) text += prompt
  }
  writeTerminalFixture(text)
}

export function addTerminalTimeline(timeline: gsap.core.Timeline) {
  addCameraCut(timeline, {
    fromScene: '#sidebar-scene', fromCamera: '#sidebar-camera',
    toScene: '#terminal-scene', toCamera: '#terminal-camera',
    at: TERMINAL_CUT - .24, direction: 'right', distance: 300, halfDuration: .24,
  })
  timeline.to({}, { duration: .5 }, TRAILER_END - .5)
}
