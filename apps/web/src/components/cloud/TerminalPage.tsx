import { useEffect, useRef, useState } from 'react'
import { RefreshCw, TerminalSquare } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

type TerminalStatus = 'connecting' | 'connected' | 'closed' | 'error'

function consoleURL(workspaceId: string, rows: number, columns: number): string {
  const developmentControlPlane = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:7790`
    : window.location.href
  const url = new URL(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/console`,
    import.meta.env.VITE_NEBULA_CLOUD_CONTROL_PLANE_URL?.trim()
      || developmentControlPlane,
  )
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('rows', String(rows))
  url.searchParams.set('columns', String(columns))
  return url.toString()
}

export function TerminalPage({ workspaceId }: { workspaceId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<TerminalStatus>('connecting')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setStatus('connecting')
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      fontWeight: '400',
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: '#080808',
        foreground: '#d4d4d4',
        cursor: '#f4f4f5',
        cursorAccent: '#080808',
        selectionBackground: '#3f3f46',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e4e4e7',
        brightBlack: '#71717a',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#fafafa',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)

    let socket: WebSocket | null = null
    let disposed = false
    const fitTerminal = () => {
      if (disposed) return
      try { fit.fit() } catch { /* hidden or unmounted */ }
    }
    fitTerminal()

    socket = new WebSocket(consoleURL(
      workspaceId,
      Math.max(1, terminal.rows),
      Math.max(1, terminal.cols),
    ))
    socket.binaryType = 'arraybuffer'

    const sendResize = () => {
      if (socket?.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({
        type: 'resize',
        rows: terminal.rows,
        columns: terminal.cols,
      }))
    }
    socket.addEventListener('open', () => {
      if (disposed) return
      setStatus('connected')
      sendResize()
      terminal.focus()
    })
    socket.addEventListener('message', event => {
      if (disposed) return
      if (typeof event.data === 'string') {
        terminal.write(event.data)
      } else if (event.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(event.data))
      } else if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then(data => {
          if (!disposed) terminal.write(new Uint8Array(data))
        })
      }
    })
    socket.addEventListener('close', event => {
      if (disposed) return
      setStatus(event.code === 1000 ? 'closed' : 'error')
    })
    socket.addEventListener('error', () => {
      if (!disposed) setStatus('error')
    })

    const input = terminal.onData(data => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(new TextEncoder().encode(data))
      }
    })
    const resize = terminal.onResize(sendResize)
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(fitTerminal)
    })
    observer.observe(container)

    return () => {
      disposed = true
      observer.disconnect()
      input.dispose()
      resize.dispose()
      socket?.close(1000, 'Terminal view closed')
      terminal.dispose()
    }
  }, [attempt, workspaceId])

  const connected = status === 'connected'

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#080808] text-white">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <TerminalSquare size={15} className="text-white/55" />
          <div className="min-w-0">
            <h1 className="text-[13px] font-medium leading-4 text-white/85">Terminal</h1>
            <p className="mt-0.5 text-[10px] leading-3 text-white/30">
              /home/nebula/workspace
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              connected
                ? 'bg-emerald-400/70'
                : status === 'connecting'
                  ? 'animate-pulse bg-amber-300/65'
                  : 'bg-red-400/65'
            }`}
          />
          <span className="text-[10px] text-white/35">
            {connected
              ? 'Connected'
              : status === 'connecting'
                ? 'Connecting'
                : 'Disconnected'}
          </span>
          {(status === 'closed' || status === 'error') && (
            <button
              type="button"
              onClick={() => setAttempt(current => current + 1)}
              className="ml-1 flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.035] px-2.5 text-[11px] text-white/65 transition-colors hover:bg-white/[0.07] hover:text-white/90"
            >
              <RefreshCw size={12} />
              Reconnect
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 p-3">
        <div
          ref={containerRef}
          className="h-full w-full overflow-hidden bg-[#080808] p-3"
        />
      </div>
    </section>
  )
}
