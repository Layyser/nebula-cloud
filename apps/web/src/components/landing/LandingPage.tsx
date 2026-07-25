import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  AtSign,
  Bot,
  Boxes,
  Building2,
  Check,
  LayoutDashboard,
  Library,
  PanelLeftClose,
  Plus,
  Search,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import { NebulaMark } from '@nebula/runtime-ui'

const NEBULA_ASCII = String.raw`
    ██████   █████          █████                ████
   ░░██████ ░░███          ░░███                ░░███
    ░███░███ ░███   ██████  ░███████  █████ ████ ░███   ██████
    ░███░░███░███  ███░░███ ░███░░███░░███ ░███  ░███  ░░░░░███
    ░███ ░░██████ ░███████  ░███ ░███ ░███ ░███  ░███   ███████
    ░███  ░░█████ ░███░░░   ░███ ░███ ░███ ░███  ░███  ███░░███
    █████  ░░█████░░██████  ████████  ░░████████ █████░░████████
   ░░░░░    ░░░░░  ░░░░░░  ░░░░░░░░    ░░░░░░░░ ░░░░░  ░░░░░░░░`

const ASCII_BLOCK_PAIRS = NEBULA_ASCII.split('\n').flatMap((line, row) => {
  const characters = [...line]
  return characters.flatMap((character, column) => (
    character === '█' && characters[column + 1] === '█'
      ? [{ row, column }]
      : []
  ))
})

const DEMO_TASKS = [
  'Review the failed deployment',
  'Watch GitHub and fix broken builds',
  'Summarize today\'s support tickets',
  'Prepare tomorrow\'s release notes',
]

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface LandingPageProps {
  onLaunch: () => void
}

export function LandingPage({ onLaunch }: LandingPageProps) {
  const handleLaunch = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return

    event.preventDefault()
    onLaunch()
  }

  return (
    <div className="relative z-[2] min-h-screen overflow-x-hidden bg-transparent text-[var(--color-text-primary)]">
      <Header onLaunch={handleLaunch} />

      <section className="relative isolate min-h-[100svh] overflow-hidden">
        <div
          aria-hidden="true"
          className="landing-shader-fade pointer-events-none absolute inset-0 z-0"
        />
        <div className="relative z-10 mx-auto grid min-h-[100svh] max-w-[1480px] grid-cols-1 items-center gap-20 px-6 pb-14 pt-28 lg:grid-cols-[0.92fr_1.08fr] lg:gap-24 lg:px-10 lg:pb-8 lg:pt-24">
          <div className="hero-copy-blob max-w-3xl">
            <h1 className="max-w-[790px] text-[clamp(3.25rem,6.3vw,5.85rem)] font-medium leading-[0.9] tracking-[-0.06em] text-[var(--color-text-primary)]">
              AI operators, each with their own computer.
            </h1>
            <p className="mt-6 max-w-xl text-[clamp(1rem,1.35vw,1.12rem)] leading-7 text-[var(--color-text-secondary)]">
              Deploy persistent AI teammates with a private Linux workspace, tools, memory, and controlled access. Delegate in Chat, take over in Console, and govern the whole operation from one place.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="/app" onClick={handleLaunch} className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/88">
                Deploy an operator
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <a href="#runtime" className="inline-flex h-12 items-center rounded-full border border-white/[0.13] bg-black/20 px-6 text-sm font-medium text-[var(--color-text-secondary)] backdrop-blur-md transition hover:bg-white/[0.08] hover:text-white">
                See how it works
              </a>
            </div>
            <Metrics />
          </div>

          <RuntimeCard />
        </div>
      </section>

      <main className="relative z-10 -mt-px bg-[var(--color-surface-page)]">
        <PlatformSection />
        <RuntimeSection onLaunch={handleLaunch} />
        <PricingSection onLaunch={handleLaunch} />
        <FinalCta onLaunch={handleLaunch} />
      </main>

    </div>
  )
}

function Header({ onLaunch }: { onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 16)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <header className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-500 ease-out ${scrolled ? 'border-white/[0.08] bg-[#080909]/72 shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl' : 'border-transparent bg-transparent'}`}>
      <nav className={`mx-auto flex max-w-[1240px] items-center justify-between px-6 transition-[height] duration-500 ease-out lg:px-10 ${scrolled ? 'h-16' : 'h-24'}`} aria-label="Main navigation">
        <a className="flex items-center gap-2.5 text-sm font-semibold tracking-[-0.01em] text-white">
          <NebulaMark size={24} />
          <span className="nebula-wordmark">Nebula</span>
        </a>
        <div className="hidden items-center gap-8 text-xs font-medium text-[var(--color-text-secondary)] md:flex">
          <a href="#platform" className="transition hover:text-white">Platform</a>
          <a href="#runtime" className="transition hover:text-white">Runtime</a>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
          <a href="#workspace" className="transition hover:text-white">Workspace</a>
        </div>
        <a href="/app" onClick={onLaunch} className="inline-flex h-9 items-center rounded-xl border border-white/[0.13] bg-black/20 px-3 text-xs font-medium text-[var(--color-text-secondary)] backdrop-blur-md transition hover:bg-white/[0.08] hover:text-white">
          Launch app
        </a>
      </nav>
    </header>
  )
}

function RuntimeCard() {
  const [preview, setPreview] = useState<'web' | 'tui'>('web')

  return (
    <div className="relative mx-auto w-full max-w-[880px] lg:ml-auto">
      <div className="absolute -inset-10 rounded-full bg-sky-300/[0.035] blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-[#090a0b]/90 shadow-[0_32px_100px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="relative flex h-9 items-center justify-between border-b border-white/[0.08] px-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
            <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
            <span className="h-2 w-2 rounded-full bg-[#28c840]" />
          </div>
          <div className="absolute left-1/2 flex -translate-x-1/2 rounded-lg bg-white/[0.045] p-0.5 text-[10px] font-medium text-white/40">
            <span
              aria-hidden="true"
              className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md border border-white/[0.08] bg-white/[0.09] shadow-sm transition-transform duration-300 ease-out ${preview === 'tui' ? 'translate-x-full' : 'translate-x-0'}`}
            />
            <button type="button" aria-pressed={preview === 'web'} onClick={() => setPreview('web')} className={`relative z-10 w-14 rounded-md py-1 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/15 ${preview === 'web' ? 'text-white/85' : 'hover:text-white/65'}`}>Web</button>
            <button type="button" aria-pressed={preview === 'tui'} onClick={() => setPreview('tui')} className={`relative z-10 w-14 rounded-md py-1 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/15 ${preview === 'tui' ? 'text-white/85' : 'hover:text-white/65'}`}>TUI</button>
          </div>
          <span className="w-10" />
        </div>
        <div className="relative min-h-[420px]">
          <div aria-hidden={preview !== 'web'} className={`absolute inset-0 transition-all duration-500 ease-out ${preview === 'web' ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'}`}>
            <WebControlPlanePreview />
          </div>
          <div aria-hidden={preview !== 'tui'} className={`absolute inset-0 transition-all duration-500 ease-out ${preview === 'tui' ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}`}>
            <TuiPreview />
          </div>
        </div>
      </div>
    </div>
  )
}

function TuiPreview() {
  return (
    <div className="flex h-[420px] flex-col px-5 py-3 font-mono text-[12px] leading-6 sm:text-[13px]">
      <p><span className="text-[var(--color-text-subtle)]">$</span> <span className="text-[var(--color-text-secondary)]">./nebula</span></p>
      <div
        className="relative my-3 overflow-hidden text-[5px] leading-[5px] tracking-normal min-[420px]:text-[7px] min-[420px]:leading-[7px] sm:text-[8px] sm:leading-[8px]"
        style={{
          fontFamily: "'Lucida Console', monospace",
          fontKerning: 'none',
          fontVariantLigatures: 'none',
        }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-[#5fafff]">
          {ASCII_BLOCK_PAIRS.map(({ row, column }) => (
            <span
              key={`${row}-${column}`}
              className="absolute block bg-[#5fafff]"
              style={{ left: `${column}ch`, top: `${row}em`, width: '2ch', height: '1em' }}
            />
          ))}
        </div>
        <pre
          aria-label="Nebula ASCII wordmark"
          className="relative z-10 m-0 text-[#5fafff]"
          style={{ fontFamily: "'Lucida Console', monospace", fontKerning: 'none', fontVariantLigatures: 'none' }}
        >{NEBULA_ASCII}</pre>
      </div>
      <p className="mb-2 pl-[9px] text-[11px] text-[var(--color-text-secondary)] sm:pl-[14px]"><span className="font-semibold text-[var(--color-text-primary)]">gpt-5.6-sol</span><span className="mx-2 text-[var(--color-text-subtle)]">·</span>low<span className="mx-2 text-[var(--color-text-subtle)]">·</span>coder</p>
      <LogLine time="08:42:01" label="hooks" text="4 event sources ready" />

      <div className="mt-3 border-t border-white/[0.055] pt-3 leading-5">
        <p><span className="mr-2 text-[#808080]">&gt;</span><span className="text-[#afd7ff]">Review the failed deployment</span></p>
        <p className="mt-2 text-white/32">Preparing the workspace and inspecting the rollout</p>
        <p className="text-white/55"><span className="text-[#5fafff]">[tool]</span> Bash(pip install kubernetes &amp;&amp; python check_rollout.py)</p>
        <p className="pl-5 text-white/28">deployment healthy across all replicas</p>
        <p className="mt-2 max-w-lg text-white/55">I installed the missing client, found a stale secret, refreshed it, and verified the deployment from this workspace.</p>
      </div>

      <div className="mt-auto border-t border-white/[0.07] pt-2">
        <TypingTask />
      </div>
    </div>
  )
}

function WebControlPlanePreview() {
  const operators = [
    { name: 'Release guardian', team: 'Engineering', state: 'Working', color: 'bg-sky-300/10' },
    { name: 'Support specialist', team: 'Customer success', state: 'Ready', color: 'bg-emerald-300/10' },
    { name: 'Invoice auditor', team: 'Finance', state: 'Working', color: 'bg-violet-300/10' },
  ]

  return (
    <div className="flex h-[420px] bg-[#080909] text-white/70">
      <aside className="hidden w-36 shrink-0 flex-col border-r border-white/[0.07] bg-[#111111] shadow-[4px_0_28px_rgba(0,0,0,0.55)] sm:flex">
        <div className="flex h-10 shrink-0 items-center justify-between pl-3 pr-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-white/90"><NebulaMark size={16} /> <span className="nebula-wordmark">Nebula</span></div>
          <PanelLeftClose size={11} className="text-white/25" />
        </div>
        <div className="flex flex-col gap-0.5 px-2 pb-2 text-[9px]">
          <PreviewNav icon={<Plus size={11} />} label="New Session" />
          <PreviewNav icon={<Bot size={11} />} label="Operators" />
          <PreviewNav icon={<AtSign size={11} />} label="Connections" />
          <PreviewNav icon={<Search size={11} />} label="Search" />
          <PreviewNav active icon={<LayoutDashboard size={11} />} label="Dashboard" />
        </div>
        <div className="mx-3 border-t border-white/[0.06]" />
        <div className="flex-1 px-2 pt-2">
          <p className="px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.15em] text-white/25">Sessions</p>
          <PreviewSession title="Release monitoring" agent="Coder" />
          <PreviewSession title="Support triage" agent="Default" />
          <PreviewSession title="Invoice review" agent="Finance" />
        </div>
        <div className="border-t border-white/[0.06] px-2 py-2.5">
          <div className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[9px] text-white/45"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-violet-500/70 to-indigo-600/70 text-[8px] font-semibold text-white">G</span>George</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-white/25">Organization overview</p>
            <h3 className="mt-1 text-base font-medium tracking-tight text-white/90">Good morning, George</h3>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[9px] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> All systems healthy</div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <PreviewStat label="Operators" value="24" detail="6 working now" />
          <PreviewStat label="July spend" value="$418" detail="12% below budget" accent />
          <PreviewStat label="Tasks completed" value="8,492" detail="+18% this month" />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-3">
            <div className="flex items-center justify-between"><span className="text-[10px] font-medium text-white/70">Fleet activity</span><span className="text-[8px] text-white/25">Last 7 days</span></div>
            <div className="mt-3 flex h-16 items-end gap-1.5">
              {[42, 58, 48, 74, 64, 88, 78, 92, 70, 84, 98, 86].map((height, index) => (
                <span key={index} className="flex-1 rounded-sm bg-gradient-to-t from-sky-400/15 to-sky-300/65" style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[7px] uppercase tracking-wider text-white/20"><span>Mon</span><span>Today</span></div>
          </div>
          <div className="hidden rounded-xl border border-white/[0.07] bg-white/[0.018] p-3 lg:block">
            <span className="text-[10px] font-medium text-white/70">Usage by team</span>
            <div className="mt-4 space-y-3">
              <UsageBar label="Engineering" value="46%" width="46%" />
              <UsageBar label="Support" value="31%" width="31%" />
              <UsageBar label="Finance" value="15%" width="15%" />
            </div>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.018]">
          <div className="flex items-center justify-between border-b border-white/[0.055] px-3.5 py-2.5"><span className="text-[10px] font-medium text-white/70">Operators</span><span className="text-[8px] text-sky-300/55">View workforce →</span></div>
          {operators.map(operator => (
            <div key={operator.name} className="grid grid-cols-[1fr_auto] items-center border-b border-white/[0.045] px-3.5 py-1.5 last:border-0 sm:grid-cols-[1fr_0.75fr_auto]">
              <div className="flex items-center gap-2"><span className={`h-5 w-5 rounded-md ${operator.color} ring-1 ring-inset ring-white/[0.06]`} /><span className="text-[9px] text-white/70">{operator.name}</span></div>
              <span className="hidden text-[8px] text-white/25 sm:block">{operator.team}</span>
              <span className="flex items-center gap-1.5 text-[8px] text-white/35"><span className={`h-1 w-1 rounded-full ${operator.state === 'Working' ? 'bg-sky-300' : 'bg-emerald-300'}`} />{operator.state}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PreviewNav({ icon, label, active = false }: { icon: ReactNode; label: string; active?: boolean }) {
  return <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${active ? 'bg-white/[0.07] text-white/80' : 'text-white/38'}`}>{icon}{label}</div>
}

function PreviewSession({ title, agent }: { title: string; agent: string }) {
  return (
    <div className="mb-0.5 rounded-lg px-2 py-1.5">
      <p className="truncate text-[9px] text-white/42">{title}</p>
      <p className="mt-0.5 text-[7px] text-white/20">{agent}</p>
    </div>
  )
}

function PreviewStat({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-2.5">
      <p className="text-[8px] text-white/30">{label}</p>
      <p className={`mt-1 text-base font-medium tracking-tight ${accent ? 'text-sky-200/90' : 'text-white/90'}`}>{value}</p>
      <p className="mt-0.5 truncate text-[7px] text-white/25">{detail}</p>
    </div>
  )
}

function UsageBar({ label, value, width }: { label: string; value: string; width: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[8px] text-white/35"><span>{label}</span><span>{value}</span></div>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-sky-300/55" style={{ width }} /></div>
    </div>
  )
}

function LogLine({ time, label, text }: { time: string; label: string; text: string }) {
  const labelColor = label === 'hooks'
    ? 'text-[#87d7d7]'
    : label === 'github'
      ? 'text-[#5f87af]'
      : 'text-[var(--color-text-muted)]'

  return (
    <p className="grid grid-cols-[72px_66px_1fr] text-[var(--color-text-secondary)] sm:grid-cols-[88px_78px_1fr]">
      <span className="text-[var(--color-text-subtle)]">{time}</span>
      <span className={labelColor}>[{label}]</span>
      <span>{text}</span>
    </p>
  )
}

function TypingTask() {
  const [taskIndex, setTaskIndex] = useState(0)
  const [visibleLength, setVisibleLength] = useState(REDUCED_MOTION ? DEMO_TASKS[0].length : 0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (REDUCED_MOTION) return

    const task = DEMO_TASKS[taskIndex]
    const atEnd = visibleLength === task.length
    const atStart = visibleLength === 0
    const delay = atEnd && !deleting ? 1500 : deleting ? 28 : 58

    const timer = window.setTimeout(() => {
      if (atEnd && !deleting) {
        setDeleting(true)
      } else if (atStart && deleting) {
        setDeleting(false)
        setTaskIndex(index => (index + 1) % DEMO_TASKS.length)
      } else {
        setVisibleLength(length => length + (deleting ? -1 : 1))
      }
    }, delay)

    return () => window.clearTimeout(timer)
  }, [deleting, taskIndex, visibleLength])

  const task = DEMO_TASKS[taskIndex].slice(0, visibleLength)
  return (
    <p className="mt-1 flex min-h-7 items-center" aria-label={`Example task: ${DEMO_TASKS[taskIndex]}`}>
      <span className="mr-2 text-[#808080]">&gt;</span>
      <span className="text-[#afd7ff]">{task}</span>
      <span aria-hidden="true" className="ml-0.5 inline-block h-[1.15em] w-[7px] animate-[blink_1s_step-end_infinite] bg-white/55" />
    </p>
  )
}

function Metrics() {
  return (
    <div className="mt-7 grid w-full max-w-xl grid-cols-3 divide-x divide-white/[0.08]">
      <Metric value="Linux" label="a persistent home for every operator" />
      <Metric value="Chat + Console" label="delegate work or take over directly" />
      <Metric value="<30 MB" label="standalone Nebula core" />
    </div>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 px-3 py-3 first:pl-0 last:pr-0 sm:px-5">
      <div className="text-lg font-medium tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-xl">{value}</div>
      <div className="mt-1.5 text-[10px] leading-4 text-[var(--color-text-muted)] sm:text-[11px]">{label}</div>
    </div>
  )
}

function PlatformSection() {
  return (
    <section id="platform" className="mx-auto max-w-[1240px] px-6 py-28 lg:px-10 lg:py-40">
      <div className="max-w-2xl">
        <p className="text-xs font-medium tracking-[0.17em] text-[var(--color-text-muted)] uppercase">One computer, two collaborators</p>
        <h2 className="mt-5 text-4xl font-medium tracking-[-0.045em] text-[var(--color-text-primary)] sm:text-6xl">Delegate in Chat.<br></br>Take over in Console.</h2>
        <p className="mt-6 max-w-xl text-base leading-7 text-[var(--color-text-secondary)]">Every operator works from a persistent Linux home. It can install what the task needs, keep projects and memory between sessions, and hand the exact same environment back to a human.</p>
      </div>
      <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08] md:grid-cols-3">
        <Feature icon={<Terminal size={19} />} index="01" title="A real Linux home">Install packages, clone repositories, run services, and keep the environment ready for the next task.</Feature>
        <Feature icon={<Library size={19} />} index="02" title="Equip every role">Deploy shared agent templates with the right skills, MCPs, hooks, rules, and organization knowledge.</Feature>
        <Feature icon={<ShieldCheck size={19} />} index="03" title="Keep humans in control">Set access and budgets centrally, inspect every run, or open Console and continue the work directly.</Feature>
      </div>
    </section>
  )
}

function Feature({ icon, index, title, children }: { icon: ReactNode; index: string; title: string; children: ReactNode }) {
  return (
    <article className="min-h-[210px] bg-[#0a0b0b] p-8 sm:p-8">
      <div className="flex items-center justify-between text-[var(--color-text-muted)]">
        {icon}
        <span className="font-mono text-[16px]">{index}</span>
      </div>
      <h3 className="mt-6 text-xl font-medium tracking-[-0.025em] text-[var(--color-text-primary)]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{children}</p>
    </article>
  )
}

function RuntimeSection({ onLaunch }: { onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <section id="runtime" className="border-y border-white/[0.07] bg-[#090a0a]">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-16 px-6 py-28 lg:grid-cols-2 lg:items-center lg:px-10 lg:py-36">
        <div className="max-w-lg">
          <p className="mt-7 text-xs font-medium uppercase tracking-[0.17em] text-[var(--color-text-muted)]">One core, two products</p>
          <h2 className="mt-4 text-4xl font-medium tracking-[-0.045em] text-[var(--color-text-primary)] sm:text-5xl">Standalone by default.<br></br>Managed when you need it.</h2>
          <p className="mt-5 text-base leading-7 text-[var(--color-text-secondary)]">Nebula Core stays a complete, tiny Linux binary. Run its built-in TUI locally, connect a standalone web client, or let Nebula Cloud place the same runtime inside a managed operator workspace.</p>
          <div className="mt-8 space-y-4">
            <InfrastructurePoint icon={<Terminal size={15} />} title="Run nebula" text="The binary opens its own lightweight TUI and works directly in your current project." />
            <InfrastructurePoint icon={<Boxes size={15} />} title="Run nebula --serve" text="The same engine exposes an organization-neutral API for standalone Web or a managed workspace." />
            <InfrastructurePoint icon={<Building2 size={15} />} title="Keep the cloud outside Core" text="Organizations, billing, containers, storage, and orchestration stay in the platform layer." />
          </div>
          <a href="/app" onClick={onLaunch} className="group mt-8 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:text-white">
            Deploy an operator <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
        <div className="relative rounded-2xl border border-white/[0.08] bg-[#0b0c0c] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.35)] sm:p-4">
          <div className="flex items-center justify-between border-b border-white/[0.065] pb-4">
            <div className="flex items-center gap-2 text-xs font-medium text-white/70"><NebulaMark size={15} /> Runtime architecture</div>
            <span className="rounded-md bg-sky-300/[0.08] px-2 py-1 font-mono text-[9px] text-sky-200/55">one binary</span>
          </div>
          <div className="mt-5 rounded-xl border border-sky-300/[0.1] bg-sky-300/[0.025] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-white/70"><Bot size={13} /> Nebula Core</div>
              <span className="font-mono text-[9px] text-sky-200/45">&lt;30 MB</span>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-white/35">Agent engine · sessions · tools · permissions · capabilities</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RuntimePath
              icon={<Terminal size={13} />}
              label="Standalone"
              command="nebula"
              text="Built-in TUI calls Core directly. Standalone Web uses --serve."
            />
            <RuntimePath
              icon={<Building2 size={13} />}
              label="Nebula Cloud"
              command="nebula --serve"
              text="Org Web and TUI connect through the control plane to a managed workspace."
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.055] bg-white/[0.055] text-[9px] text-white/35">
            <span className="bg-[#0d0e0e] px-3 py-2.5">Chat → runtime API</span>
            <span className="bg-[#0d0e0e] px-3 py-2.5 text-right">Console → isolated PTY</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function InfrastructurePoint({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-white/40">{icon}</span>
      <div><p className="text-sm font-medium text-white/75">{title}</p><p className="mt-0.5 text-xs leading-5 text-white/35">{text}</p></div>
    </div>
  )
}

function RuntimePath({ icon, label, command, text }: { icon: ReactNode; label: string; command: string; text: string }) {
  return (
    <div className="min-h-36 rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
      <div className="flex items-center gap-2 text-[10px] font-medium text-white/65">{icon}{label}</div>
      <code className="mt-4 block font-mono text-[11px] text-sky-200/65">$ {command}</code>
      <p className="mt-2 text-[9px] leading-4 text-white/28">{text}</p>
    </div>
  )
}

const PRICING_PLANS = [
  {
    name: 'Individual',
    price: '9',
    priceDetail: null,
    featured: false,
    audience: 'For one person',
    inherits: null,
    description: 'Your first persistent AI operator, with a private managed Linux workspace.',
    features: [
      '1 deployed operator',
      'Persistent Linux home and Console',
      'Skills, MCPs, hooks, and web fetch',
    ],
  },
  {
    name: 'Team',
    price: '10',
    priceDetail: '+ $5 per operator',
    featured: false,
    audience: 'For small teams',
    inherits: 'Everything in Individual, plus',
    description: 'Deploy up to 15 operators and equip them from one shared organization library.',
    features: [
      '$5 per deployed operator',
      'Shared agent templates and capabilities',
      'Usage and cost dashboard',
    ],
  },
  {
    name: 'Business',
    price: '99',
    priceDetail: '+ $10 per operator after 15',
    featured: true,
    audience: 'For organizations',
    inherits: 'Everything in Team, plus',
    description: 'Governed operator access and visibility as Nebula expands across departments.',
    features: [
      '15 deployed operators included',
      '$10 per additional operator',
      'Roles and artifact permissions',
      'Audit history and budget controls',
      'SSO and priority support',
    ],
  },
  {
    name: 'Enterprise',
    price: '999',
    priceDetail: '+ $15 per operator after 100',
    featured: false,
    audience: 'For enterprises',
    inherits: 'Everything in Business, plus',
    description: 'Dedicated capacity and hands-on operations for business-critical AI workforces.',
    features: [
      '100 deployed operators included',
      '$15 per additional operator',
      'Dedicated worker capacity',
      'Advanced security policies',
      'Provisioning and migration support',
    ],
  },
] as const

function PricingSection({ onLaunch }: { onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <section id="pricing" className="mx-auto max-w-[1240px] px-6 py-28 lg:px-10 lg:py-36">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.17em] text-[var(--color-text-muted)]">Straightforward pricing</p>
          <h2 className="mt-5 mb-4 text-4xl font-medium tracking-[-0.045em] text-[var(--color-text-primary)] sm:text-6xl">Pay for each operator.<br></br>Bring your own intelligence.</h2>
        </div>
        <p className="max-w-sm text-sm leading-6 text-[var(--color-text-secondary)] text-right">Every operator includes a managed Linux workspace, persistent home, Console access, automatic runtime updates, and encrypted storage.</p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {PRICING_PLANS.map(plan => <PricingCard key={plan.name} plan={plan} onLaunch={onLaunch} />)}
      </div>

      <div className="mt-4 flex flex-col gap-5 rounded-xl border border-white/[0.07] bg-white/[0.018] px-5 py-4 text-xs text-white/38 sm:flex-row sm:items-center sm:justify-between">
        <span><strong className="font-medium text-white/65">Use subscriptions you already have—even on Individual.</strong> Connect Codex, OpenCode Go, and other supported plans through OAuth—or bring provider API keys. Model and API charges are not included, and Nebula adds no token markup.</span>
        <span className="shrink-0 text-white/28">Prices in USD exclude taxes · Dedicated capacity available</span>
      </div>
    </section>
  )
}

function PricingCard({ plan, onLaunch }: {
  plan: typeof PRICING_PLANS[number]
  onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <article className={`relative flex min-h-[490px] flex-col overflow-hidden rounded-2xl border p-6 ${plan.featured ? 'border-sky-300/20 bg-sky-300/[0.035] shadow-[0_24px_80px_rgba(56,189,248,0.055)]' : 'border-white/[0.08] bg-[#0a0b0b]'}`}>
      {plan.featured && <span className="absolute right-5 top-5 rounded-full border border-sky-300/15 bg-sky-300/[0.07] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-sky-200/65">Most popular</span>}
      <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-white/25">{plan.audience}</p>
      <p className="text-sm font-medium text-white/75">{plan.name}</p>
      <div className="mt-5 flex items-end gap-1.5">
        <span className="pb-1 text-lg text-white/45">$</span>
        <span className="text-5xl font-medium tracking-[-0.055em] text-white/95">{plan.price}</span>
        <span className="pb-1.5 text-xs text-white/30">/ month</span>
      </div>
      <p className={`mt-2 min-h-4 text-[11px] font-medium ${plan.priceDetail ? 'text-white/42' : 'invisible'}`}>
        {plan.priceDetail ?? 'Operator pricing'}
      </p>
      <p className="mt-5 min-h-[72px] text-sm leading-6 text-white/40">{plan.description}</p>
      <div className="mb-5 mt-6 border-t border-white/[0.07]" />
      <p className={`mb-3 text-[9px] font-medium uppercase tracking-[0.12em] ${plan.featured ? 'text-sky-200/48' : 'text-white/28'}`}>
        {plan.inherits ?? 'Included'}
      </p>
      <ul className="space-y-3">
        {plan.features.map(feature => (
          <li key={feature} className="flex items-start gap-2.5 text-xs leading-5 text-white/52">
            <Check size={13} strokeWidth={2} className={`mt-1 shrink-0 ${plan.featured ? 'text-sky-300/65' : 'text-white/30'}`} />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-8">
        <a href="/app" onClick={onLaunch} className={`flex h-10 items-center justify-center rounded-full text-xs font-medium transition ${plan.featured ? 'bg-white text-black hover:bg-white/90' : 'border border-white/[0.1] bg-white/[0.035] text-white/65 hover:bg-white/[0.07] hover:text-white/85'}`}>
          Choose {plan.name}
        </a>
      </div>
    </article>
  )
}

function FinalCta({ onLaunch }: { onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <footer className="mx-auto max-w-[1240px] px-6 py-28 lg:px-10 lg:py-36">
      <div className="flex flex-col items-start justify-between gap-10 border-b border-white/[0.08] pb-24 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">From first operator to AI workforce</p>
          <h2 id="workspace" className="mt-5 max-w-3xl text-4xl font-medium tracking-[-0.05em] text-[var(--color-text-primary)] sm:text-6xl">Hire AI operators.<br></br>Keep humans in control.</h2>
        </div>
        <a href="/app" onClick={onLaunch} className="group inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/88">
          Deploy an operator <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
      <div className="flex items-center justify-between pt-7 text-[11px] text-[var(--color-text-muted)]">
        <span className="flex items-center gap-2"><NebulaMark size={24} /> <span className="nebula-wordmark">Nebula</span></span>
        <span>Persistent AI operators for organizations</span>
      </div>
    </footer>
  )
}
