import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  ContentContainer,
  PageHeader,
  StatusDot,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useThemePreference,
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

function terminalTheme(theme: 'dark' | 'light') {
  return theme === 'light'
    ? {
        background: '#f5f5f5', foreground: '#2f3438', cursor: '#181818', cursorAccent: '#f5f5f5',
        selectionBackground: '#cbd5e1', black: '#202124', red: '#b91c1c', green: '#047857',
        yellow: '#a16207', blue: '#0369a1', magenta: '#7e22ce', cyan: '#0e7490', white: '#e5e7eb',
        brightBlack: '#6b7280', brightRed: '#dc2626', brightGreen: '#059669', brightYellow: '#ca8a04',
        brightBlue: '#0284c7', brightMagenta: '#9333ea', brightCyan: '#0891b2', brightWhite: '#ffffff',
      }
    : {
        background: '#080808', foreground: '#d4d4d4', cursor: '#f4f4f5', cursorAccent: '#080808',
        selectionBackground: '#3f3f46', black: '#18181b', red: '#ef4444', green: '#22c55e',
        yellow: '#eab308', blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e4e4e7',
        brightBlack: '#71717a', brightRed: '#f87171', brightGreen: '#4ade80', brightYellow: '#facc15',
        brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#fafafa',
      }
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
  const { resolvedTheme } = useThemePreference()
  const initialThemeRef = useRef(resolvedTheme)

  useEffect(() => onStatus(status), [onStatus, status])

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = terminalTheme(resolvedTheme)
  }, [resolvedTheme])

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
      theme: terminalTheme(initialThemeRef.current),
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
    <div className={`terminal-session absolute inset-0 bg-[var(--color-surface-page)] ${active ? 'visible z-10' : 'invisible z-0'}`}>
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
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-surface-page)] text-[var(--color-text-primary)]">
      <ContentContainer gutter="workspace" spacing="none" width="workspace" className="shrink-0 pt-8">
        <PageHeader
          title="Terminal"
          description="Direct shell access to your persistent environment."
          action={(
            <div className="flex min-h-9 items-center gap-2.5">
              <StatusDot
                tone={activeStatus === 'connected' ? 'success' : activeStatus === 'connecting' ? 'warning' : 'danger'}
                className={activeStatus === 'connecting' ? 'animate-pulse' : undefined}
              />
              <span className="text-xs text-white/40">
                {activeStatus === 'connected' ? 'Connected'
                  : activeStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
              </span>
              {(activeStatus === 'closed' || activeStatus === 'error') && (
                <Button variant="primary" onClick={reconnectActiveTerminal}>
                  <RefreshCw size={13} />
                  Reconnect
                </Button>
              )}
            </div>
          )}
        />
        <Tabs value={activeId} onValueChange={setActiveId}>
          <TabsList
            aria-label="Terminals"
            variant="panel"
            size="default"
            className="terminal-tabs mb-5"
          >
            {tabs.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={tabs.length > 1 ? 'gap-1 pl-3 pr-1.5' : 'px-3'}
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
                    className="grid size-5 cursor-pointer place-items-center rounded-full text-[var(--color-text-disabled)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                  >
                    <X size={12} />
                  </span>
                )}
              </TabsTrigger>
            ))}
            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="New terminal"
                    disabled={tabs.length >= 8}
                    onClick={addTerminal}
                    className="grid h-full w-9 shrink-0 cursor-pointer place-items-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-25"
                  >
                    <Plus size={15} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">New terminal</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TabsList>
        </Tabs>
      </ContentContainer>
      <ContentContainer gutter="workspace" spacing="none" width="workspace" className="min-h-0 flex-1 pb-8">
        <div className="relative h-full w-full overflow-hidden bg-[var(--color-surface-page)]">
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
