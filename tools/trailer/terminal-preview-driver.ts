import { Terminal as RealTerminal } from '../../apps/web/node_modules/@xterm/xterm'

const instances = new Map<RealTerminal, string>()
// Build-only substitution: retain the real renderer, expose a seekable fixture
// writer, and disable wall-clock blinking. The product component is unchanged.
export class Terminal extends RealTerminal {
  constructor(options: ConstructorParameters<typeof RealTerminal>[0]) {
    super({ ...options, cursorBlink: false })
    instances.set(this, '')
  }
  dispose() { instances.delete(this); super.dispose() }
  write(data: string | Uint8Array, callback?: () => void) {
    // This build-only adapter targets the pinned xterm package. Parsing and
    // painting must finish in the same seek, never on a later timer/rAF.
    const core = (this as unknown as { _core: {
      writeSync(data: string | Uint8Array): void;
      _renderService?: { _renderRows(start: number, end: number): void };
    } })._core
    if (typeof core.writeSync !== 'function') throw new Error('Update the trailer xterm adapter for this xterm version')
    core.writeSync(data)
    core._renderService?._renderRows(0, this.rows - 1)
    callback?.()
  }
}
export function writeTerminalFixture(text: string) {
  for (const [terminal, previous] of instances) {
    if (previous === text) continue
    instances.set(terminal, text)
    // Reset and replay supports arbitrary timeline seeks, including backwards.
    // Reset restores cursor visibility; hide it again on every replay.
    terminal.write('\x1bc\x1b[?25l' + text)
  }
}
