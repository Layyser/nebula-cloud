import { toolEntranceFrame } from '../../../nebula-frontend/src/lib/toolMotion'

export function updateToolEntrances(container: Element, seconds: number, starts: number[]) {
  container.querySelectorAll<HTMLElement>('[data-tool-entry]').forEach((element, i) => {
    const frame = toolEntranceFrame(seconds - (starts[i] ?? 0))
    element.style.setProperty('--tool-entry-opacity', String(frame.opacity))
    element.style.setProperty('--tool-entry-filter', `blur(${frame.blur}px)`)
  })
}
