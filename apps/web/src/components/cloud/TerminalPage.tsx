import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  ContentContainer,
  PageHeader,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@nebula/runtime-ui'
import { Plus, RefreshCw, X } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

type TerminalStatus = 'connecting' | 'connected' | 'closed' | 'error'

interface TerminalTab {
  id: string
  label: string
}

function consoleURL(workspaceId: string, terminalId: string, rows: number, columns: number): string {
  const developmentControlPlane = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:7790`
    : window.location.href
  const url = new URL(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/console/${encodeURIComponent(terminalId)}`,
    import.meta.env.VITE_NEBULA_CLOUD_CONTROL_PLANE_URL?.trim() || developmentControlPlane,
  )
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('rows', String(rows))
  url.searchParams.set('columns', String(columns))
  return url.toString()
}

function storedTabs(workspaceId: string): TerminalTab[] {
  try {
    const stored = JSON.parse(localStorage.getItem(`nebula:terminals:${workspaceId}`) || '[]')
    if (Array.isArray(stored)) {
      const valid = stored.filter((tab): tab is TerminalTab => (
        typeof tab?.id === 'string'
        && /^[a-z0-9-]{1,48}$/.test(tab.id)
        && typeof tab?.label === 'string'
      ))
      if (valid.length) return valid.slice(0, 8)
    }
  } catch { /* use the default terminal */ }
  return [{ id: 'terminal-1', label: 'Terminal 1' }]
}

function TerminalSession({
  active,
  onStatus,
  previewOutput,
  retryToken,
  terminalId,
  workspaceId,
}: {
  active: boolean
  onStatus: (status: TerminalStatus) => void
  previewOutput?: string[]
  retryToken: number
  terminalId: string
  workspaceId: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<(() => void) | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const activeRef = useRef(active)
  const [status, setStatus] = useState<TerminalStatus>('connecting')

  useEffect(() => onStatus(status), [onStatus, status])

  useEffect(() => {
    activeRef.current = active
    if (!active) return
    window.requestAnimationFrame(() => {
      fitRef.current?.()
      terminalRef.current?.focus()
    })
  }, [active])

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
        background: '#080808', foreground: '#d4d4d4', cursor: '#f4f4f5', cursorAccent: '#080808',
        selectionBackground: '#3f3f46', black: '#18181b', red: '#ef4444', green: '#22c55e',
        yellow: '#eab308', blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e4e4e7',
        brightBlack: '#71717a', brightRed: '#f87171', brightGreen: '#4ade80', brightYellow: '#facc15',
        brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#fafafa',
      },
    })
    terminalRef.current = terminal
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)

    let socket: WebSocket | null = null
    let disposed = false
    const fitTerminal = () => {
      if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return
      try { fit.fit() } catch { /* hidden or unmounted */ }
    }
    fitRef.current = fitTerminal
    fitTerminal()

    const observer = new ResizeObserver(() => window.requestAnimationFrame(fitTerminal))
    observer.observe(container)

    if (previewOutput) {
      setStatus('connected')
      terminal.write(previewOutput.join('\r\n'))
      return () => {
        disposed = true
        observer.disconnect()
        terminal.dispose()
        terminalRef.current = null
        fitRef.current = null
      }
    }

    socket = new WebSocket(consoleURL(
      workspaceId,
      terminalId,
      Math.max(1, terminal.rows),
      Math.max(1, terminal.cols),
    ))
    socket.binaryType = 'arraybuffer'

    const sendResize = () => {
      if (socket?.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ type: 'resize', rows: terminal.rows, columns: terminal.cols }))
    }
    socket.addEventListener('open', () => {
      if (disposed) return
      setStatus('connected')
      sendResize()
      if (activeRef.current) terminal.focus()
    })
    socket.addEventListener('message', event => {
      if (disposed) return
      if (typeof event.data === 'string') terminal.write(event.data)
      else if (event.data instanceof ArrayBuffer) terminal.write(new Uint8Array(event.data))
      else if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then(data => {
          if (!disposed) terminal.write(new Uint8Array(data))
        })
      }
    })
    socket.addEventListener('close', event => {
      if (!disposed) setStatus(event.code === 1000 ? 'closed' : 'error')
    })
    socket.addEventListener('error', () => {
      if (!disposed) setStatus('error')
    })

    const input = terminal.onData(data => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(new TextEncoder().encode(data))
    })
    const resize = terminal.onResize(sendResize)
    return () => {
      disposed = true
      observer.disconnect()
      input.dispose()
      resize.dispose()
      socket?.close(1000, 'Terminal view closed')
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [previewOutput, retryToken, terminalId, workspaceId])

  return (
    <div className={`terminal-session absolute inset-0 bg-[#080808] ${active ? 'visible z-10' : 'invisible z-0'}`}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}

export function TerminalPage({
  workspaceId,
  previewOutput,
}: {
  workspaceId: string
  previewOutput?: string[]
}) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => storedTabs(workspaceId))
  const [activeId, setActiveId] = useState(() => tabs[0]?.id || 'terminal-1')
  const [statuses, setStatuses] = useState<Record<string, TerminalStatus>>({})
  const [retryTokens, setRetryTokens] = useState<Record<string, number>>({})

  useEffect(() => {
    localStorage.setItem(`nebula:terminals:${workspaceId}`, JSON.stringify(tabs))
  }, [tabs, workspaceId])

  const activeStatus = statuses[activeId] || 'connecting'
  const reconnectActiveTerminal = () => {
    setStatuses(current => ({ ...current, [activeId]: 'connecting' }))
    setRetryTokens(current => ({ ...current, [activeId]: (current[activeId] || 0) + 1 }))
  }
  const addTerminal = () => {
    if (tabs.length >= 8) return
    const usedNumbers = new Set(tabs.map(tab => Number(tab.label.match(/\d+$/)?.[0])).filter(Number.isFinite))
    let number = 1
    while (usedNumbers.has(number)) number += 1
    const id = `terminal-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    setTabs(current => [...current, { id, label: `Terminal ${number}` }])
    setActiveId(id)
  }
  const closeTerminal = (id: string) => {
    if (tabs.length === 1) return
    const index = tabs.findIndex(tab => tab.id === id)
    const next = tabs.filter(tab => tab.id !== id)
    setTabs(next)
    setStatuses(current => {
      const updated = { ...current }
      delete updated[id]
      return updated
    })
    if (activeId === id) setActiveId(next[Math.max(0, index - 1)]?.id || next[0].id)
  }
  const statusHandlers = useMemo(() => Object.fromEntries(tabs.map(tab => [
    tab.id,
    (status: TerminalStatus) => setStatuses(current => current[tab.id] === status
      ? current
      : { ...current, [tab.id]: status }),
  ])), [tabs])

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#080808] text-white">
      <ContentContainer gutter="workspace" spacing="none" width="workspace" className="shrink-0 pt-8">
        <PageHeader
          title="Terminal"
          description="Direct shell access to /home/nebula/workspace."
          spacing="compact"
          action={(
            <div className="flex min-h-9 items-center gap-2.5">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${
                activeStatus === 'connected' ? 'bg-emerald-400/70'
                  : activeStatus === 'connecting' ? 'animate-pulse bg-amber-300/65' : 'bg-red-400/65'
              }`} />
              <span className="text-xs text-white/40">
                {activeStatus === 'connected' ? 'Connected'
                  : activeStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
              </span>
              {(activeStatus === 'closed' || activeStatus === 'error') && (
                <Button variant="primary" size="compact" radius="marketing-pill" onClick={reconnectActiveTerminal}>
                  <RefreshCw size={13} />
                  Reconnect
                </Button>
              )}
            </div>
          )}
        />
        <div className="terminal-tabs mt-5 flex min-w-0 items-end gap-1 overflow-x-auto" role="tablist" aria-label="Terminals">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeId === tab.id}
              onClick={() => setActiveId(tab.id)}
              className={`group flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-t-lg py-0 text-xs transition-colors ${
                tabs.length > 1 ? 'pl-3 pr-2' : 'px-3'
              } ${
                activeId === tab.id ? 'bg-white/[0.09] text-white' : 'text-white/45 hover:bg-white/[0.045] hover:text-white/75'
              }`}
            >
              <span>{tab.label}</span>
              {tabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${tab.label}`}
                  onClick={event => { event.stopPropagation(); closeTerminal(tab.id) }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      closeTerminal(tab.id)
                    }
                  }}
                  className="grid size-5 cursor-pointer place-items-center rounded-full text-white/30 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  <X size={12} />
                </span>
              )}
            </button>
          ))}
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="New terminal"
                  disabled={tabs.length >= 8}
                  onClick={addTerminal}
                  className="mb-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <Plus size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">New terminal</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </ContentContainer>
      <ContentContainer gutter="workspace" spacing="none" width="workspace" className="min-h-0 flex-1 pb-8 pt-2">
        <div className="relative h-full w-full overflow-hidden bg-[#080808]">
          {tabs.map(tab => (
            <TerminalSession
              key={tab.id}
              active={activeId === tab.id}
              onStatus={statusHandlers[tab.id]}
              previewOutput={previewOutput}
              retryToken={retryTokens[tab.id] || 0}
              terminalId={tab.id}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      </ContentContainer>
    </section>
  )
}
