import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  AtSign,
  Bot,
  Braces,
  ChevronDown,
  Clock,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Moon,
  Monitor,
  PanelLeftClose,
  Play,
  Plus,
  Search,
  Sun,
  Terminal,
  Users,
} from 'lucide-react'
import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { FaGithub, FaLinkedinIn, FaXTwitter, FaYoutube } from 'react-icons/fa6'
import {
  NebulaBackground,
  NebulaMark,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useThemePreference,
} from '@nebula/runtime-ui'
import excelIcon from '../../assets/excel-svgrepo-com.svg'
import githubIcon from '../../assets/github-142-svgrepo-com.svg'
import gmailIcon from '../../assets/gmail-svgrepo-com.svg'
import javascriptIcon from '../../assets/javascript-logo.svg'
import npmIcon from '../../assets/npm-svgrepo-com.svg'
import pythonIcon from '../../assets/python-svgrepo-com.svg'
import telegramIcon from '../../assets/telegram-svgrepo-com.svg'
import gitlabIcon from '../../assets/gitlab-logo-500-rgb.svg'
import CIcon from '../../assets/C.svg'
import { SectionEyebrow } from '../public/SectionEyebrow'
import { SegmentedControl } from '../ui/SegmentedControl'

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

function ScrollReveal({ children, className = '', delay = 0, variant = 'text' }: { children: ReactNode; className?: string; delay?: number; variant?: 'text' | 'visual' }) {
  const reducedMotion = useReducedMotion()
  const initial = variant === 'visual'
    ? { opacity: 0, y: 18, scale: 0.99 }
    : { opacity: 0, y: 14 }

  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : initial}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.82, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
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
    <div className="landing-page relative z-[2] min-h-screen overflow-x-hidden bg-transparent text-[var(--color-text-primary)]">
      <Header onLaunch={handleLaunch} />

      <section className="relative isolate min-h-[100svh] overflow-hidden">
        <div
          aria-hidden="true"
          className="landing-shader-fade pointer-events-none absolute inset-0 z-0"
        />
        <div className="relative z-10 mx-auto grid min-h-[100svh] max-w-[1480px] grid-cols-1 items-center gap-20 px-6 pb-14 pt-28 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-12 lg:px-10 lg:pb-8 lg:pt-24">
          <div className="hero-copy-blob mx-auto max-w-3xl text-center lg:mx-0 lg:text-left">
            <h1 className="mx-auto max-w-[790px] text-balance text-[clamp(3.25rem,6.3vw,5.85rem)] font-medium leading-[0.9] tracking-[-0.06em] text-[var(--color-text-primary)] lg:mx-0">
              AI operators, each with <span className="hero-title-accent">their own computer.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[clamp(1rem,1.35vw,1.12rem)] leading-7 text-[var(--color-text-secondary)] lg:mx-0">
              Deploy persistent AI teammates with a private Linux workspace, tools, memory, and controlled access. Delegate in Chat, take over in Console, and govern the whole operation from one place.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <a href="/app" onClick={handleLaunch} className="group inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-control-primary)] px-6 text-sm font-semibold text-[var(--color-control-on-primary)] transition hover:bg-[var(--color-control-primary-hover)]">
                Deploy an operator
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <a href="#runtime" className="inline-flex h-12 items-center rounded-full bg-[var(--color-surface-diagram-node)] px-6 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-diagram-node-hover)] hover:text-[var(--color-text-primary)]">
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
        <VideoShowcase />
        <RuntimeSection onLaunch={handleLaunch} />
        <FinalCta onLaunch={handleLaunch} />
      </main>

    </div>
  )
}

export type HeaderNavigationLink = {
  label: string
  href: string
  active?: boolean
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

export function Header({
  onLaunch,
  navigationLinks,
}: {
  onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void
  navigationLinks?: readonly HeaderNavigationLink[]
}) {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 16)
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  useEffect(() => {
    const update = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const closeOnOutsidePress = (event: globalThis.PointerEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) setMobileMenuOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }

    window.addEventListener('pointerdown', closeOnOutsidePress)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePress)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileMenuOpen])

  return (
    <header className={`landing-header fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-500 ease-out ${scrolled ? 'border-[var(--color-border-default)] bg-[var(--color-surface-header-scrolled)] backdrop-blur-xl' : 'border-transparent bg-transparent'}`}>
      <nav className="relative z-10 mx-auto flex h-16 max-w-[1480px] items-center justify-between px-6 lg:px-10" aria-label="Main navigation">
        <a href="/" className="flex items-center gap-3 text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
          <NebulaMark size={32} />
          <span className="nebula-wordmark">Nubols</span>
        </a>
        <div className="flex items-center gap-3">
          <NavigationMenu.Root className="relative hidden md:block">
            <NavigationMenu.List className="flex items-center gap-1 text-sm font-medium text-[var(--color-text-secondary)]">
              {navigationLinks ? navigationLinks.map(link => (
                <NavigationMenu.Item key={link.href}>
                  <NavigationMenu.Link asChild active={link.active}>
                    <a
                      href={link.href}
                      onClick={link.onClick}
                      aria-current={link.active ? 'page' : undefined}
                      className={`inline-flex h-10 items-center rounded-[var(--radius-control)] px-3 transition-colors ${link.active ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : 'hover:bg-[var(--color-surface-selected)] hover:text-[var(--color-text-primary)]'}`}
                    >
                      {link.label}
                    </a>
                  </NavigationMenu.Link>
                </NavigationMenu.Item>
              )) : (
                <>
                  <HeaderMenu label="Product" active={pathname === '/'}>
                    <HeaderMenuLink href="/#platform" title="Nubols Cloud" description="Persistent operators coordinated through one control plane." />
                    <HeaderMenuLink href="/#runtime" title="Nebula Runtime" description="Choose the standalone runtime or managed Cloud deployment." />
                  </HeaderMenu>
                  <NavigationMenu.Item>
                    <NavigationMenu.Link asChild>
                      <a href="/docs" className={`inline-flex h-10 items-center rounded-lg px-3 transition-colors ${pathname.startsWith('/docs') ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : 'hover:bg-[var(--color-surface-selected)] hover:text-[var(--color-text-primary)]'}`}>Docs</a>
                    </NavigationMenu.Link>
                  </NavigationMenu.Item>
                  <NavigationMenu.Item>
                    <NavigationMenu.Link asChild>
                      <a href="/plans" className={`inline-flex h-10 items-center rounded-lg px-3 transition-colors ${pathname === '/plans' || pathname === '/pricing' ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : 'hover:bg-[var(--color-surface-selected)] hover:text-[var(--color-text-primary)]'}`}>Plans</a>
                    </NavigationMenu.Link>
                  </NavigationMenu.Item>
                  <HeaderMenu label="Privacy" active={pathname.startsWith('/legal')}>
                    <HeaderMenuLink href="/legal?document=privacy" title="Privacy policy" description="How data is collected, processed, and protected." />
                    <HeaderMenuLink href="/legal?document=terms" title="Terms of service" description="The agreement governing access to Nubols products." />
                    <HeaderMenuLink href="/legal?document=acceptable-use" title="Acceptable use" description="Rules for responsible use of operators and workspaces." />
                    <HeaderMenuLink href="/legal?document=cookies" title="Cookies" description="Browser storage and public-site preferences." />
                    <HeaderMenuLink href="/legal?document=security" title="Security" description="Security practices and responsible disclosure." />
                  </HeaderMenu>
                </>
              )}
            </NavigationMenu.List>
            <NavigationMenu.Viewport className="ui-border-floating absolute left-1/2 top-[calc(100%+0.75rem)] z-50 w-[360px] -translate-x-1/2 overflow-hidden rounded-2xl bg-[var(--color-surface-diagram-node)] p-2 shadow-[var(--shadow-surface)]" />
          </NavigationMenu.Root>
          <a href="/app" onClick={onLaunch} className="hidden h-10 items-center rounded-full bg-[var(--color-control-primary)] px-4 text-sm font-semibold text-[var(--color-control-on-primary)] transition hover:bg-[var(--color-control-primary-hover)] md:inline-flex">
            Launch app
          </a>

          <div ref={mobileMenuRef} className="relative md:hidden">
            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-public-navigation"
              onClick={() => setMobileMenuOpen(open => !open)}
              className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-selected)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)]"
            >
              <Menu size={20} />
            </button>

            <AnimatePresence>
              {mobileMenuOpen && (
                <motion.nav
                  id="mobile-public-navigation"
                  aria-label="Mobile navigation"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="ui-border-floating absolute right-0 top-[calc(100%+0.5rem)] w-52 overflow-hidden rounded-[var(--radius-surface)] bg-[var(--color-surface-diagram-node)] p-1.5 shadow-[var(--shadow-surface)]"
                >
                  <MobileHeaderLink href="/" label="Product" active={pathname === '/'} onSelect={() => setMobileMenuOpen(false)} />
                  <MobileHeaderLink href="/docs" label="Docs" active={pathname.startsWith('/docs')} onSelect={() => setMobileMenuOpen(false)} />
                  <MobileHeaderLink href="/plans" label="Plans" active={pathname === '/plans' || pathname === '/pricing'} onSelect={() => setMobileMenuOpen(false)} />
                  <MobileHeaderLink href="/legal" label="Privacy" active={pathname.startsWith('/legal')} onSelect={() => setMobileMenuOpen(false)} />
                  <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
                  <a
                    href="/app"
                    onClick={event => {
                      setMobileMenuOpen(false)
                      onLaunch(event)
                    }}
                    className="flex h-10 items-center rounded-[var(--radius-control)] bg-[var(--color-control-primary)] px-3 text-sm font-semibold text-[var(--color-control-on-primary)] transition-colors hover:bg-[var(--color-control-primary-hover)]"
                  >
                    Launch app
                  </a>
                </motion.nav>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>
    </header>
  )
}

function MobileHeaderLink({ href, label, active, onSelect }: {
  href: string
  label: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onSelect}
      className={`flex h-10 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium transition-colors ${active ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-selected)] hover:text-[var(--color-text-primary)]'}`}
    >
      {label}
    </a>
  )
}

function HeaderMenu({ label, children, active = false }: { label: string; children: ReactNode; active?: boolean }) {
  return (
    <NavigationMenu.Item>
      <NavigationMenu.Trigger className={`group inline-flex h-10 items-center gap-1 rounded-[var(--radius-control)] px-3 transition-colors hover:bg-[var(--color-surface-selected)] hover:text-[var(--color-text-primary)] data-[state=open]:bg-[var(--color-surface-selected)] data-[state=open]:text-[var(--color-text-primary)] ${active ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : ''}`}>
        {label}
        <ChevronDown size={14} className="text-[var(--color-text-disabled)] transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-[var(--color-text-secondary)]" />
      </NavigationMenu.Trigger>
      <NavigationMenu.Content className="w-[344px] p-1">
        <div className="px-3 pb-2 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">{label}</div>
        <div className="grid gap-0.5">{children}</div>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  )
}

function HeaderMenuLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <NavigationMenu.Link asChild>
      <a href={href} className="group rounded-[var(--radius-control)] px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-selected)]">
        <span className="block text-sm font-medium text-[var(--color-text-primary)]">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]">{description}</span>
      </a>
    </NavigationMenu.Link>
  )
}

function RuntimeCard() {
  const [preview, setPreview] = useState<'web' | 'tui'>('web')
  const [webPreviewReady, setWebPreviewReady] = useState(false)
  const boundsRef = useRef<HTMLDivElement>(null)
  const previewWindowRef = useRef<HTMLDivElement>(null)
  const hasAdjustedFrameRef = useRef(false)
  const [frame, setFrame] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const { resolvedTheme } = useThemePreference()

  useEffect(() => {
    const bounds = boundsRef.current
    if (!bounds) return

    const fitFrame = () => {
      const desktopLayout = window.matchMedia('(min-width: 1024px)').matches
      const boundsRect = bounds.getBoundingClientRect()
      const width = desktopLayout
        ? Math.min(bounds.clientWidth, Math.max(0, window.innerWidth - boundsRect.left - 16))
        : bounds.clientWidth
      const height = bounds.clientHeight
      if (!width || !height) return

      setFrame(current => {
        // Mobile is a static preview: its bounds and window are intentionally identical.
        if (!desktopLayout) {
          return { x: 0, y: 0, width, height }
        }

        if (!current || !hasAdjustedFrameRef.current) {
          const compactRightGutter = window.innerWidth < 1480 ? 40 : 0
          const initialX = Math.min(10 * 16, Math.max(0, width))
          const initialWidth = Math.min(880, Math.max(0, width - initialX - compactRightGutter))
          const initialHeight = Math.min(558, Math.max(460, initialWidth * (558 / 880)), height)
          // The bounds extend 10rem into the copy column. Keep the frame fixed
          // to that grid seam and take all responsive shrinking from its right.
          return {
            x: initialX,
            y: (height - initialHeight) / 2,
            width: initialWidth,
            height: initialHeight,
          }
        }

        const nextWidth = Math.min(current.width, width)
        const nextHeight = Math.min(current.height, height)
        return {
          x: Math.min(Math.max(0, current.x), width - nextWidth),
          y: Math.min(Math.max(0, current.y), height - nextHeight),
          width: nextWidth,
          height: nextHeight,
        }
      })
    }

    fitFrame()
    const observer = new ResizeObserver(fitFrame)
    observer.observe(bounds)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    // Never leave the hero empty if the embedded preview cannot report its load event.
    const fallback = window.setTimeout(() => setWebPreviewReady(true), 4000)
    return () => window.clearTimeout(fallback)
  }, [])

  const runPointerGesture = (
    event: ReactPointerEvent<HTMLElement>,
    cursor: string,
    update: (deltaX: number, deltaY: number, start: NonNullable<typeof frame>, bounds: { width: number; height: number }) => typeof frame,
  ) => {
    if (!frame || !boundsRef.current) return
    event.preventDefault()
    hasAdjustedFrameRef.current = true

    const gestureTarget = event.currentTarget
    const previewWindow = previewWindowRef.current
    const embeddedPreview = boundsRef.current.querySelector('iframe')
    const startX = event.clientX
    const startY = event.clientY
    const startFrame = frame
    const boundsRect = boundsRef.current.getBoundingClientRect()
    const bounds = {
      width: Math.min(boundsRect.width, Math.max(0, window.innerWidth - boundsRect.left - 16)),
      height: boundsRect.height,
    }
    const previousCursor = document.body.style.cursor
    const previousSelection = document.body.style.userSelect
    document.body.style.cursor = cursor
    document.body.style.userSelect = 'none'
    gestureTarget.setPointerCapture(event.pointerId)
    if (embeddedPreview) embeddedPreview.style.pointerEvents = 'none'

    let pendingFrame = startFrame

    const handleMove = (pointerEvent: PointerEvent) => {
      pendingFrame = update(pointerEvent.clientX - startX, pointerEvent.clientY - startY, startFrame, bounds)!
      if (previewWindow && pendingFrame) {
        previewWindow.style.left = `${pendingFrame.x}px`
        previewWindow.style.top = `${pendingFrame.y}px`
        previewWindow.style.width = `${pendingFrame.width}px`
        previewWindow.style.height = `${pendingFrame.height}px`
      }
    }

    const finish = () => {
      setFrame(pendingFrame)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelection
      if (embeddedPreview) embeddedPreview.style.pointerEvents = ''
      if (gestureTarget.hasPointerCapture(event.pointerId)) {
        gestureTarget.releasePointerCapture(event.pointerId)
      }
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const startDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return
    if ((event.target as HTMLElement).closest('button')) return
    runPointerGesture(event, 'grabbing', (deltaX, deltaY, start, bounds) => ({
      ...start,
      x: Math.min(Math.max(0, start.x + deltaX), bounds.width - start.width),
      y: Math.min(Math.max(0, start.y + deltaY), bounds.height - start.height),
    }))
  }

  const startResizing = (event: ReactPointerEvent<HTMLDivElement>, direction: string) => {
    event.stopPropagation()
    const cursor = `${direction}-resize`
    runPointerGesture(event, cursor, (deltaX, deltaY, start, bounds) => {
      const minimumWidth = Math.min(560, bounds.width)
      const minimumHeight = Math.min(460, bounds.height)
      const right = start.x + start.width
      const bottom = start.y + start.height
      let x = start.x
      let y = start.y
      let width = start.width
      let height = start.height

      if (direction.includes('e')) width = Math.min(Math.max(minimumWidth, start.width + deltaX), bounds.width - start.x)
      if (direction.includes('s')) height = Math.min(Math.max(minimumHeight, start.height + deltaY), bounds.height - start.y)
      if (direction.includes('w')) {
        x = Math.min(Math.max(0, start.x + deltaX), right - minimumWidth)
        width = right - x
      }
      if (direction.includes('n')) {
        y = Math.min(Math.max(0, start.y + deltaY), bottom - minimumHeight)
        height = bottom - y
      }

      return { x, y, width, height }
    })
  }

  return (
    <div ref={boundsRef} className="relative mx-auto flex h-[558px] w-full max-w-[880px] items-center justify-center lg:-ml-40 lg:h-[700px] lg:w-[calc(100%_+_32rem)] lg:max-w-none">
      <div className="absolute -inset-10 rounded-full bg-sky-300/[0.035] blur-3xl" />
      <div
        ref={previewWindowRef}
        className={`absolute overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-page)] shadow-[var(--shadow-surface)] transition-[opacity,filter,transform] duration-700 ease-out ${webPreviewReady ? 'scale-100 opacity-100 blur-0' : 'pointer-events-none scale-[0.985] opacity-0 blur-sm'}`}
        style={frame
          ? { left: frame.x, top: frame.y, width: frame.width, height: frame.height }
          : { inset: '31px 16px', maxWidth: 880, margin: 'auto' }}
      >
        <div
          className="relative flex h-9 touch-auto select-none items-center justify-between border-b border-[var(--color-border-default)] bg-[var(--color-surface-diagram-node)] px-3 cursor-default lg:touch-none lg:cursor-pointer"
          onPointerDown={startDragging}
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
            <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
            <span className="h-2 w-2 rounded-full bg-[#28c840]" />
          </div>
          <div className="absolute left-1/2 flex -translate-x-1/2 rounded-lg bg-[var(--color-surface-segment)] p-0.5 text-[10px] font-medium text-[var(--color-text-subtle)]">
            <span
              aria-hidden="true"
              className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-[var(--color-surface-segment-selected)] shadow-sm transition-transform duration-300 ease-out ${preview === 'tui' ? 'translate-x-full' : 'translate-x-0'}`}
            />
            <button type="button" aria-pressed={preview === 'web'} onClick={() => setPreview('web')} className={`relative z-10 w-14 rounded-md py-1 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)] ${preview === 'web' ? 'text-[var(--color-text-primary)]' : 'hover:text-[var(--color-text-secondary)]'}`}>Web</button>
            <button type="button" aria-pressed={preview === 'tui'} onClick={() => setPreview('tui')} className={`relative z-10 w-14 rounded-md py-1 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring-color)] ${preview === 'tui' ? 'text-[var(--color-text-primary)]' : 'hover:text-[var(--color-text-secondary)]'}`}>TUI</button>
          </div>
          <span className="w-10" />
        </div>
        <div className="relative h-[calc(100%_-_2.25rem)] min-h-0">
          <div aria-hidden={preview !== 'web'} className={`absolute inset-0 transition-all duration-500 ease-out ${preview === 'web' ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'}`}>
            <WebControlPlanePreview theme={resolvedTheme} onReady={() => {
              // Give the iframe one completed paint after loading before revealing it.
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => setWebPreviewReady(true))
              })
            }} />
          </div>
          <div aria-hidden={preview !== 'tui'} className={`absolute inset-0 transition-all duration-500 ease-out ${preview === 'tui' ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}`}>
            <TuiPreview />
          </div>
        </div>
        <div aria-hidden="true" className="absolute inset-x-3 top-0 z-30 hidden h-2 cursor-n-resize lg:block" onPointerDown={event => startResizing(event, 'n')} />
        <div aria-hidden="true" className="absolute inset-x-3 bottom-0 z-30 hidden h-2 cursor-s-resize lg:block" onPointerDown={event => startResizing(event, 's')} />
        <div aria-hidden="true" className="absolute inset-y-3 left-0 z-30 hidden w-2 cursor-w-resize lg:block" onPointerDown={event => startResizing(event, 'w')} />
        <div aria-hidden="true" className="absolute inset-y-3 right-0 z-30 hidden w-2 cursor-e-resize lg:block" onPointerDown={event => startResizing(event, 'e')} />
        <div aria-hidden="true" className="absolute left-0 top-0 z-40 hidden h-4 w-4 cursor-nw-resize lg:block" onPointerDown={event => startResizing(event, 'nw')} />
        <div aria-hidden="true" className="absolute right-0 top-0 z-40 hidden h-4 w-4 cursor-ne-resize lg:block" onPointerDown={event => startResizing(event, 'ne')} />
        <div aria-hidden="true" className="absolute bottom-0 left-0 z-40 hidden h-4 w-4 cursor-sw-resize lg:block" onPointerDown={event => startResizing(event, 'sw')} />
        <div aria-hidden="true" className="absolute bottom-0 right-0 z-40 hidden h-4 w-4 cursor-se-resize lg:block" onPointerDown={event => startResizing(event, 'se')} />
      </div>
    </div>
  )
}

function TuiPreview() {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 py-3 font-mono text-[12px] leading-6 sm:text-[13px]">
      <p><span className="text-[var(--color-text-subtle)]">$</span> <span className="text-[var(--color-text-secondary)]">./nebula</span></p>
      <div
        className="relative my-3 shrink-0 overflow-hidden text-[5px] leading-[5px] tracking-normal min-[420px]:text-[7px] min-[420px]:leading-[7px] sm:text-[8px] sm:leading-[8px]"
        style={{
          fontFamily: "'Lucida Console', monospace",
          fontKerning: 'none',
          fontVariantLigatures: 'none',
        }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-[var(--color-tui-accent)]">
          {ASCII_BLOCK_PAIRS.map(({ row, column }) => (
            <span
              key={`${row}-${column}`}
              className="absolute block bg-[var(--color-tui-accent)]"
              style={{ left: `${column}ch`, top: `${row}em`, width: '2ch', height: '1em' }}
            />
          ))}
        </div>
        <pre
          aria-label="Nubols ASCII wordmark"
          className="relative z-10 m-0 text-[var(--color-tui-accent)]"
          style={{ fontFamily: "'Lucida Console', monospace", fontKerning: 'none', fontVariantLigatures: 'none' }}
        >{NEBULA_ASCII}</pre>
      </div>
      <p className="mb-2 pl-[9px] text-[11px] text-[var(--color-text-secondary)] sm:pl-[14px]"><span className="font-semibold text-[var(--color-text-primary)]">gpt-5.6-sol</span><span className="mx-2 text-[var(--color-text-subtle)]">·</span>low<span className="mx-2 text-[var(--color-text-subtle)]">·</span>coder</p>
      <LogLine time="08:42:01" label="hooks" text="4 event sources ready" />

      <div className="mt-3 border-t border-[var(--color-border-default)] pt-3 leading-5">
        <p><span className="mr-2 text-[var(--color-text-subtle)]">&gt;</span><span className="text-[var(--color-tui-accent-strong)]">Review the failed deployment</span></p>
        <p className="mt-2 text-[var(--color-text-muted)]">Preparing the workspace and inspecting the rollout</p>
        <p className="text-[var(--color-text-secondary)]"><span className="text-[var(--color-tui-accent)]">[tool]</span> Bash(pip install kubernetes &amp;&amp; python check_rollout.py)</p>
        <p className="pl-5 text-[var(--color-text-subtle)]">deployment healthy across all replicas</p>
        <p className="mt-2 max-w-lg text-[var(--color-text-secondary)]">The rollout was failing for two separate reasons. I repaired the workspace and checked the result:</p>
        <div className="mt-4 space-y-1.5 text-[var(--color-text-muted)]">
          <p><span className="mr-2 text-[var(--color-tui-accent)]">-</span>The rollout check now has its required Kubernetes client</p>
          <p><span className="mr-2 text-[var(--color-tui-accent)]">-</span>The deployment is using a fresh workspace secret</p>
          <p><span className="mr-2 text-[var(--color-tui-accent)]">-</span>All replicas are healthy and serving traffic</p>
        </div>
      </div>

      <div className="mt-auto border-t border-[var(--color-border-default)] pt-2">
        <TypingTask />
      </div>
    </div>
  )
}

function WebControlPlanePreview({ onReady, theme }: { onReady: () => void; theme: 'dark' | 'light' }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const syncTheme = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'nebula-preview-theme', theme },
      window.location.origin,
    )
  }

  useEffect(syncTheme, [theme])

  return (
    <div className="h-full w-full overflow-hidden">
      <iframe
        ref={iframeRef}
        title="Interactive Nubols Cloud application preview"
        src="/?landing-preview=runtime"
        onLoad={() => {
          syncTheme()
          onReady()
        }}
        className="block origin-top-left border-0 bg-transparent"
        style={{ width: '125%', height: '125%', transform: 'scale(0.8)' }}
      />
    </div>
  )
}

/* Kept temporarily as an implementation reference while the real workspace replaces it. */
function LegacyWebControlPlanePreview() {
  const operators = [
    { name: 'Release guardian', team: 'Engineering', state: 'Working', color: 'bg-sky-300/10' },
    { name: 'Support specialist', team: 'Customer success', state: 'Ready', color: 'bg-[var(--color-status-success-surface)]' },
    { name: 'Invoice auditor', team: 'Finance', state: 'Working', color: 'bg-violet-300/10' },
    { name: 'Security reviewer', team: 'Security', state: 'Ready', color: 'bg-amber-300/10' },
    { name: 'Research analyst', team: 'Strategy', state: 'Working', color: 'bg-cyan-300/10' },
    { name: 'Data steward', team: 'Operations', state: 'Ready', color: 'bg-rose-300/10' },
  ]

  return (
    <div className="flex h-full bg-[#080909] text-white/70">
      <aside className="hidden w-36 shrink-0 flex-col border-r border-white/[0.07] bg-[#111111] shadow-[4px_0_28px_rgba(0,0,0,0.55)] sm:flex">
        <div className="flex h-10 shrink-0 items-center justify-between pl-3 pr-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-white/90"><NebulaMark size={16} /> <span className="nebula-wordmark">Nubols</span></div>
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
          <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[9px] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-status-success)]" /> All systems healthy</div>
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
              <span className="flex items-center gap-1.5 text-[8px] text-white/35"><span className={`h-1 w-1 rounded-full ${operator.state === 'Working' ? 'bg-[var(--color-status-info)]' : 'bg-[var(--color-status-success)]'}`} />{operator.state}</span>
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
    ? 'text-[var(--color-tui-hooks)]'
    : label === 'github'
      ? 'text-[var(--color-tui-github)]'
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
      <span className="mr-2 text-[var(--color-text-subtle)]">&gt;</span>
      <span className="text-[var(--color-tui-accent-strong)]">{task}</span>
      <span aria-hidden="true" className="ml-0.5 inline-block h-[1.15em] w-[7px] animate-[blink_1s_step-end_infinite] bg-[var(--color-text-secondary)]" />
    </p>
  )
}

function Metrics() {
  return (
    <div className="mx-auto mt-7 grid w-full max-w-xl grid-cols-3 divide-x divide-[var(--color-border-strong)] text-center lg:mx-0 lg:text-left">
      <Metric value="Linux" label="a persistent home for every operator" />
      <Metric value="Chat + Console" label="delegate work or take over directly" />
      <Metric value="<30 MB RAM" label="standalone Nebula core" />
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
  const [usersHovered, setUsersHovered] = useState(false)

  return (
    <section id="platform" className="bg-transparent">
      <div className="mx-auto max-w-[1480px] px-6 py-28 lg:px-10 lg:py-36">
        <ScrollReveal className="max-w-4xl">
          <SectionEyebrow>/cloud</SectionEyebrow>
          <h2 className="mt-5 text-4xl font-medium tracking-[-0.045em] text-[var(--color-text-primary)] sm:text-6xl">Give every operator its own computer.</h2>
      <p className="mt-6 max-w-3xl text-base leading-7 text-[var(--color-text-secondary)]">Connect each operator to the tools it needs, then route work through Nubols Cloud so people can delegate, inspect, and stay in control.</p>
        </ScrollReveal>

        {/*
         * Architecture diagram constraints:
         * - Keep exactly three icon-only agent nodes on the left.
         * - Preserve the centered layout and left-side breathing room from the fixed agent cluster width.
         * - Keep the middle agent on one continuous straight dashed connector to Nebula Cloud.
         * - Keep only mirrored dashed curves from the top and bottom agents into that same connector.
         * - Keep the diagram minimal: no operator names, extra cards, or arrowheads.
         * - Use supplied product icons inside the small tool tiles; keep generic stand-ins limited to tools without an asset.
         */}
        <TooltipPrimitive.Provider delayDuration={300}>
          <ScrollReveal variant="visual" delay={0.08} className="mt-16 hidden items-center justify-center lg:flex lg:flex-row lg:gap-0">
            <AgentCluster />
            <LabeledDiagramNode visibleLabel="Nebula Cloud" label="Nebula Cloud" className={DIAGRAM_CLOUD_GLOW}>
              <NebulaMark size={30} />
            </LabeledDiagramNode>
            <DiagramConnector />
            <LabeledDiagramNode
              visibleLabel="Users"
              label="Users"
              className={usersHovered ? DIAGRAM_ACTIVE_GLOW : DIAGRAM_NODE_BASE}
              onMouseEnter={() => setUsersHovered(true)}
              onMouseLeave={() => setUsersHovered(false)}
            >
              <Users size={26} />
            </LabeledDiagramNode>
          </ScrollReveal>
          <ScrollReveal variant="visual" delay={0.08} className="mt-16 flex flex-col items-center lg:hidden">
            <LabeledDiagramNode
              visibleLabel="Users"
              label="Users"
              className={usersHovered ? DIAGRAM_ACTIVE_GLOW : DIAGRAM_NODE_BASE}
              onMouseEnter={() => setUsersHovered(true)}
              onMouseLeave={() => setUsersHovered(false)}
            >
              <Users size={26} />
            </LabeledDiagramNode>
            <VerticalDiagramConnector />
            <LabeledDiagramNode visibleLabel="Nebula Cloud" labelGap="mb-3" label="Nebula Cloud" className={DIAGRAM_CLOUD_GLOW}>
              <NebulaMark size={30} />
            </LabeledDiagramNode>
            <VerticalAgentBranches />
            <div className="relative grid w-[18rem] grid-cols-3 gap-6">
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-white/65">Operators</span>
              {['Operator 1', 'Operator 2', 'Operator 3'].map(label => (
                <DiagramNode key={label} label={label} className={DIAGRAM_NODE_BASE}>
                  <Bot size={26} />
                </DiagramNode>
              ))}
            </div>
            <VerticalThreeColumnConnectors />
            <div className="relative grid w-[18rem] grid-cols-3 gap-6">
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-white/65">Linux workspaces</span>
              {['Linux workspace 1', 'Linux workspace 2', 'Linux workspace 3'].map(label => (
                <DiagramNode key={label} label={label} className={DIAGRAM_NODE_BASE}>
                  <Monitor size={26} />
                </DiagramNode>
              ))}
            </div>
            <VerticalMobileTools />
          </ScrollReveal>
        </TooltipPrimitive.Provider>
      </div>
    </section>
  )
}

const DIAGRAM_NODE_BASE = 'diagram-node-base border-transparent [&_img]:transition-[filter,opacity] [&_img]:duration-200 [&_svg]:transition-[filter,opacity] [&_svg]:duration-200'
const DIAGRAM_ACTIVE_GLOW = 'diagram-node-active'
const DIAGRAM_CLOUD_GLOW = 'diagram-node-active diagram-node-cloud'

function AgentCluster() {
  const [activeOperator, setActiveOperator] = useState<number | null>(null)

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top
    setActiveOperator(y < 96 ? 0 : y < 192 ? 1 : 2)
  }

  // Each operator has its own Linux workspace node. Keep the connector padding
  // identical on both sides so every box-to-line distance stays consistent.
  return (
    <div className="flex h-72 w-[53rem] max-w-full shrink-0 items-center max-[1199px]:w-[46.5rem] max-[1099px]:w-[40.5rem] max-[1023px]:w-[36.5rem] max-[767px]:w-[27.5rem]" onMouseMove={handleMouseMove} onMouseLeave={() => setActiveOperator(null)}>
      <div className="mr-6 flex h-72 shrink-0 flex-col justify-between">
        <ToolCluster active={activeOperator === 0} tools={[{ label: 'Python', icon: <ToolAsset src={pythonIcon} /> }, { label: 'C', icon: <ToolAsset src={CIcon} /> }, { label: 'GitHub', icon: <ToolAsset src={githubIcon} className="diagram-monochrome-icon" /> }]} />
        <ToolCluster active={activeOperator === 1} tools={[{ label: 'Telegram', icon: <ToolAsset src={telegramIcon} /> }, { label: 'Gmail', icon: <ToolAsset src={gmailIcon} /> }, { label: 'Hooks', icon: <Clock size={28} /> }, { label: 'Excel', icon: <ToolAsset src={excelIcon} /> }]} />
        <ToolCluster active={activeOperator === 2} tools={[{ label: 'GitLab', icon: <ToolAsset src={gitlabIcon} /> }, { label: 'JavaScript', icon: <ToolAsset src={javascriptIcon} /> }, { label: 'npm', icon: <ToolAsset src={npmIcon} /> }]} />
      </div>
      <div className="flex h-72 flex-col justify-between">
        <LabeledDiagramNode visibleLabel="Linux workspaces" label="Linux workspace 1" className={activeOperator === 0 ? DIAGRAM_ACTIVE_GLOW : DIAGRAM_NODE_BASE}>
          <Monitor size={26} />
        </LabeledDiagramNode>
        <DiagramNode label="Linux workspace 2" className={activeOperator === 1 ? DIAGRAM_ACTIVE_GLOW : DIAGRAM_NODE_BASE}>
          <Monitor size={26} />
        </DiagramNode>
        <DiagramNode label="Linux workspace 3" className={activeOperator === 2 ? DIAGRAM_ACTIVE_GLOW : DIAGRAM_NODE_BASE}>
          <Monitor size={26} />
        </DiagramNode>
      </div>
      <div className="flex h-72 flex-col justify-between">
        <div className="flex h-20 items-center">
          <InlineDiagramConnector />
        </div>
        <div className="flex h-20 items-center">
          <InlineDiagramConnector />
        </div>
        <div className="flex h-20 items-center">
          <InlineDiagramConnector />
        </div>
      </div>
      <AgentNodeCluster activeOperator={activeOperator} />
    </div>
  )
}

  function ToolCluster({ active, tools }: { active: boolean; tools: Array<{ label: string; icon: ReactNode }> }) {
    // Responsive order: Telegram drops first, then the remaining tool columns hide from left to right.
    return (
      <div className="flex h-20 w-[24.5rem] shrink-0 items-center justify-end gap-6 max-[1199px]:w-[18rem] max-[1099px]:w-[12rem] max-[1023px]:w-[8rem] max-[767px]:w-[5rem]">
        {tools.map((tool, index) => (
          <DiagramNode
            key={tool.label}
            label={tool.label}
            size="h-20 w-20"
            className={`${active ? DIAGRAM_ACTIVE_GLOW : DIAGRAM_NODE_BASE} ${tool.label === 'Telegram' ? 'max-[1199px]:hidden' : ''} ${['Python', 'Gmail', 'GitLab'].includes(tool.label) ? 'max-[1099px]:hidden' : ''} ${['C', 'Hooks', 'JavaScript'].includes(tool.label) ? 'max-[1023px]:hidden' : ''}`}
          >
            {tool.icon}
          </DiagramNode>
        ))}
    </div>
  )
}

function ToolAsset({ src, className = '' }: { src: string; className?: string }) {
  return <img src={src} alt="" aria-hidden="true" className={`h-10 w-10 object-contain ${className}`} />
}

function InlineDiagramConnector() {
  // Match the main connector exactly: opaque dashed SVG, round caps, and 24px padding at both ends.
  return (
    <svg aria-hidden="true" className="h-2 w-28 shrink-0" viewBox="0 0 112 8" preserveAspectRatio="none">
      <line x1="24" y1="4" x2="88" y2="4" fill="none" stroke="#7dd3fc" strokeDasharray="3 6" strokeLinecap="round" strokeWidth="1" />
      <circle cx="24" cy="4" r="3" fill="#7dd3fc" />
      <circle cx="88" cy="4" r="3" fill="#7dd3fc" />
    </svg>
  )
}

function AgentNodeCluster({ activeOperator }: { activeOperator: number | null }) {
  // Keep this fixed-width cluster: it preserves the balanced outer spacing and connector geometry above.
    return (
      <div className="relative flex h-72 w-[15rem] max-w-full shrink-0 items-center max-[1023px]:w-[12rem] max-[767px]:w-[9rem]">
      <AgentClusterConnectors />
      <div className="relative z-10 flex h-72 flex-col justify-between">
        <LabeledDiagramNode visibleLabel="Operators" label="Operator 1" className={activeOperator === 0 ? DIAGRAM_ACTIVE_GLOW : DIAGRAM_NODE_BASE}>
          <Bot size={26} />
        </LabeledDiagramNode>
        <DiagramNode label="Operator 2" className={activeOperator === 1 ? DIAGRAM_ACTIVE_GLOW : DIAGRAM_NODE_BASE}>
          <Bot size={26} />
        </DiagramNode>
        <DiagramNode label="Operator 3" className={activeOperator === 2 ? DIAGRAM_ACTIVE_GLOW : DIAGRAM_NODE_BASE}>
          <Bot size={26} />
        </DiagramNode>
      </div>
    </div>
  )
}

function AgentClusterConnectors() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 240 288" preserveAspectRatio="none">
      {/* 24px inset from the agent cluster edge, matching DiagramConnector on both sides. */}
      {/* Stop the branch paths at the junction so they never double-paint the middle connector. */}
      <path d="M104 40 H164 Q176 40 176 52 V132 Q176 144 188 144" fill="none" stroke="#7dd3fc" strokeDasharray="3 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" />
      <path d="M104 144 H216" fill="none" stroke="#7dd3fc" strokeDasharray="3 6" strokeLinecap="round" strokeWidth="1" />
      <path d="M104 248 H164 Q176 248 176 236 V156 Q176 144 188 144" fill="none" stroke="#7dd3fc" strokeDasharray="3 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" />
      <circle cx="104" cy="40" r="3" fill="#7dd3fc" />
      <circle cx="104" cy="144" r="3" fill="#7dd3fc" />
      <circle cx="104" cy="248" r="3" fill="#7dd3fc" />
      <circle cx="216" cy="144" r="3" fill="#7dd3fc" />
    </svg>
  )
}

function VerticalDiagramConnector() {
  return (
    <svg aria-hidden="true" className="h-44 w-2" viewBox="0 0 8 176" preserveAspectRatio="none">
      <line x1="4" y1="24" x2="4" y2="136" fill="none" stroke="#7dd3fc" strokeDasharray="3 6" strokeLinecap="round" strokeWidth="1" />
      <circle cx="4" cy="24" r="3" fill="#7dd3fc" />
      <circle cx="4" cy="136" r="3" fill="#7dd3fc" />
    </svg>
  )
}

function VerticalAgentBranches() {
  return (
    <svg aria-hidden="true" className="h-40 w-[18rem]" viewBox="0 0 288 160" preserveAspectRatio="none">
      <path d="M144 24 V72 M144 72 H40 V136 M144 72 V120 M144 72 H248 V136" fill="none" stroke="#7dd3fc" strokeDasharray="3 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" />
      <circle cx="144" cy="24" r="3" fill="#7dd3fc" />
      <circle cx="40" cy="136" r="3" fill="#7dd3fc" />
      <circle cx="144" cy="120" r="3" fill="#7dd3fc" />
      <circle cx="248" cy="136" r="3" fill="#7dd3fc" />
    </svg>
  )
}

function VerticalInlineConnector({ endY = 72 }: { endY?: number }) {
  return (
    <svg aria-hidden="true" className="h-28 w-2" viewBox="0 0 8 112" preserveAspectRatio="none">
      <line x1="4" y1="24" x2="4" y2={endY} fill="none" stroke="#7dd3fc" strokeDasharray="3 6" strokeLinecap="round" strokeWidth="1" />
      <circle cx="4" cy="24" r="3" fill="#7dd3fc" />
      <circle cx="4" cy={endY} r="3" fill="#7dd3fc" />
    </svg>
  )
}

function VerticalThreeColumnConnectors() {
  return (
    <div className="grid h-28 w-[18rem] grid-cols-3 justify-items-center gap-6">
      {[88, 72, 88].map((endY, index) => <VerticalInlineConnector key={index} endY={endY} />)}
    </div>
  )
}

function VerticalMobileTools() {
  const tools = [
    [
      { label: 'Python', icon: <ToolAsset src={pythonIcon} /> },
      { label: 'C', icon: <ToolAsset src={CIcon} /> },
      { label: 'GitHub', icon: <ToolAsset src={githubIcon} className="diagram-monochrome-icon" /> },
    ],
    [
      { label: 'Telegram', icon: <ToolAsset src={telegramIcon} /> },
      { label: 'Gmail', icon: <ToolAsset src={gmailIcon} /> },
      { label: 'Hooks', icon: <Clock size={28} /> },
      { label: 'Excel', icon: <ToolAsset src={excelIcon} /> },
    ],
    [
      { label: 'GitLab', icon: <ToolAsset src={gitlabIcon} /> },
      { label: 'JavaScript', icon: <ToolAsset src={javascriptIcon} /> },
      { label: 'npm', icon: <ToolAsset src={npmIcon} /> },
    ],
  ]

  return (
    <div className="mt-6 grid w-[18rem] grid-cols-3 gap-6">
      {tools.map((column, columnIndex) => (
        <div key={columnIndex} className="flex w-20 flex-col items-center gap-6">
          {column.map((tool, index) => (
            <DiagramNode
              key={tool.label}
              label={tool.label}
              size="h-20 w-20"
              className={DIAGRAM_NODE_BASE}
            >
              {tool.icon}
            </DiagramNode>
          ))}
        </div>
      ))}
    </div>
  )
}

function DiagramNode({ label, className, size = 'h-20 w-20', children, onMouseEnter, onMouseLeave }: { label: string; className: string; size?: string; children: ReactNode; onMouseEnter?: () => void; onMouseLeave?: () => void }) {
    return (
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <div aria-label={label} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className={`flex ${size} shrink-0 items-center justify-center rounded-xl border transition-[border-color,background-color,box-shadow] duration-200 [&_img]:transition-[filter,opacity] [&_img]:duration-200 [&_svg]:transition-[filter,opacity] [&_svg]:duration-200 ${className}`}>{children}</div>
      </TooltipPrimitive.Trigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </TooltipPrimitive.Root>
  )
}

function LabeledDiagramNode({ visibleLabel, labelGap = 'mb-2.5', ...nodeProps }: { visibleLabel: string; labelGap?: string } & Parameters<typeof DiagramNode>[0]) {
  return (
    <div className="relative h-20 w-20 shrink-0">
      <span className={`pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-white/65 ${labelGap}`}>
        {visibleLabel}
      </span>
      <DiagramNode {...nodeProps} />
    </div>
  )
}

function DiagramConnector() {
  // Keep this SVG connector visually identical to the SVG branches in AgentClusterConnectors.
  return (
    <>
      <svg aria-hidden="true" className="h-16 w-2 lg:hidden" viewBox="0 0 8 64" preserveAspectRatio="none">
        <line x1="4" y1="16" x2="4" y2="48" fill="none" stroke="#7dd3fc" strokeDasharray="3 6" strokeLinecap="round" strokeWidth="1" />
        <circle cx="4" cy="16" r="3" fill="#7dd3fc" />
        <circle cx="4" cy="48" r="3" fill="#7dd3fc" />
      </svg>
      {/* 160px total span = the agent-node-to-Cloud span, with 24px padding on each end. */}
      <svg aria-hidden="true" className="hidden h-2 w-40 lg:block" viewBox="0 0 160 8" preserveAspectRatio="none">
        <line x1="24" y1="4" x2="136" y2="4" fill="none" stroke="#7dd3fc" strokeDasharray="3 6" strokeLinecap="round" strokeWidth="1" />
        <circle cx="24" cy="4" r="3" fill="#7dd3fc" />
        <circle cx="136" cy="4" r="3" fill="#7dd3fc" />
      </svg>
    </>
  )
}

function VideoShowcase() {
  return (
    <section id="demo" aria-labelledby="demo-heading" className="bg-transparent">
      <div className="mx-auto max-w-[1480px] px-6 py-28 lg:px-10 lg:py-36">
        <ScrollReveal className="max-w-4xl">
          <SectionEyebrow>/demo</SectionEyebrow>
          <h2 id="demo-heading" className="mt-5 text-4xl font-medium tracking-[-0.05em] text-[var(--color-text-primary)] sm:text-6xl">See an operator at work.</h2>
          <p className="mt-6 max-w-3xl text-base leading-7 text-[var(--color-text-secondary)]">From delegation to execution, follow an operator working inside its own persistent Linux workspace.</p>
        </ScrollReveal>

        <ScrollReveal variant="visual" delay={0.08} className="mt-16">
          <div className="group relative mx-auto aspect-video w-full overflow-hidden rounded-[2rem] bg-[var(--color-surface-diagram-node)] shadow-[0_30px_100px_rgba(0,0,0,0.35)] min-[1100px]:w-[61.5rem] min-[1200px]:w-[73rem]">
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(122,195,241,0.14),transparent_26%),linear-gradient(145deg,rgba(255,255,255,0.035),transparent_42%,rgba(255,255,255,0.02))]" />
            <div aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-75 opacity-[0.07] transition-transform duration-700 ease-out group-hover:scale-[0.8] sm:scale-100 sm:group-hover:scale-105">
              <NebulaMark size={384} />
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out group-hover:scale-105 sm:h-20 sm:w-20">
                <Play className="ml-1 h-6 w-6 fill-current sm:h-7 sm:w-7" strokeWidth={1.8} />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}

function RuntimeSection({ onLaunch }: { onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const [mode, setMode] = useState<'standalone' | 'cloud'>('standalone')
  const isCloud = mode === 'cloud'

  return (
    <section id="runtime" className="bg-transparent">
      <div className="mx-auto max-w-[1480px] px-6 py-28 lg:px-10 lg:py-36">
          <ScrollReveal className="max-w-4xl">
            <SectionEyebrow>/runtime</SectionEyebrow>
        <h2 className="mt-5 text-4xl font-medium tracking-[-0.05em] text-[var(--color-text-primary)] sm:text-6xl">Choose how Nubols runs.</h2>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[var(--color-text-secondary)]">Use the standalone runtime on your machine, or add Nubols Cloud when your team needs shared workspaces and organization-wide control.</p>
          </ScrollReveal>
          <ScrollReveal variant="visual" delay={0.04} className="mx-auto mt-8 w-fit">
            <SegmentedControl
            ariaLabel="Nubols deployment model"
              value={mode}
            options={[{ value: 'standalone', label: 'Standalone' }, { value: 'cloud', label: 'Nubols Cloud' }]}
              onValueChange={setMode}
              tone="dark"
              className="w-72"
            />
          </ScrollReveal>

          <ScrollReveal variant="visual" delay={0.08}>
            <RuntimeProductDisplay isCloud={isCloud} />
          </ScrollReveal>

      </div>
    </section>
  )
}

type RuntimeDetail = {
  id: string
  label: string
  eyebrow: string
  title: string
  description: string
  icon: ReactNode
  previewTitle: string
  previewLines: string[]
}

function RuntimeProductDisplay({ isCloud }: { isCloud: boolean }) {
  const standaloneDetails: RuntimeDetail[] = [
    { id: 'agent', label: 'Nebula Agent', eyebrow: 'Standalone runtime', title: 'One small runtime owns the work.', description: 'Nebula Agent keeps sessions, tools, context, and local policy together in one portable Linux process.', icon: <NebulaMark size={28} />, previewTitle: 'Nebula Agent', previewLines: ['C++ · Linux', '<30 MB RAM', 'Local and organization-neutral'] },
    { id: 'terminal', label: 'Terminal', eyebrow: 'Built-in interface', title: 'Work directly in the terminal.', description: 'Launch the built-in TUI for sessions, approvals, tools, and agent work without running another client.', icon: <Terminal size={28} />, previewTitle: '$ ./nebula', previewLines: ['Start or resume a session', 'Inspect tool calls', 'Approve work locally'] },
    { id: 'api', label: 'HTTP API', eyebrow: 'Local Runtime API', title: 'Connect any local interface.', description: 'Run nebula --serve to expose the same sessions, tools, and events through the organization-neutral Runtime API.', icon: <Braces size={28} />, previewTitle: '$ ./nebula --serve', previewLines: ['Local HTTP transport', 'Sessions and streamed events', 'Same runtime, no duplicated state'] },
    { id: 'tauri', label: 'Nubols Desktop', eyebrow: 'Desktop app', title: 'Use Nubols as a native desktop app.', description: 'Nubols Desktop starts the same local runtime and connects through its HTTP API, keeping your sessions, tools, and workspace on your machine.', icon: <Monitor size={28} />, previewTitle: 'Nubols Desktop', previewLines: ['Native Windows app', 'Local runtime connection', 'Same sessions and capabilities'] },
  ]

  const cloudDetails: RuntimeDetail[] = [
    { id: 'cloud', label: 'Nubols Cloud', eyebrow: 'Organization control plane', title: 'Coordinate every managed workspace.', description: 'Nubols Cloud owns authentication, organizations, access, shared capabilities, usage, and governance.', icon: <NebulaMark size={28} />, previewTitle: 'Organization layer', previewLines: ['Members and access', 'Shared MCPs, skills, and rules', 'Usage and governance'] },
    { id: 'chat', label: 'Chat', eyebrow: 'Delegation surface', title: 'Delegate work without managing infrastructure.', description: 'People assign work in Chat while the operator continues inside its persistent private workspace.', icon: <MessageSquare size={28} />, previewTitle: 'Chat', previewLines: ['Delegate a task', 'Follow progress', 'Inspect results'] },
    { id: 'console', label: 'Console', eyebrow: 'Direct control', title: 'Take over the exact same workspace.', description: 'Open Console when a human needs direct terminal access to the operator’s persistent environment.', icon: <Terminal size={28} />, previewTitle: 'Console', previewLines: ['Live PTY access', 'Same files and processes', 'Human takeover without handoff'] },
    { id: 'dashboard', label: 'Dashboard', eyebrow: 'Beta roadmap', title: 'Make organization activity visible.', description: 'The managed beta roadmap adds measured organization and personal usage views as the underlying usage events become available.', icon: <LayoutDashboard size={28} />, previewTitle: 'Planned dashboard', previewLines: ['Measured usage events', 'Organization views for admins', 'Personal usage for each member'] },
  ]

  const mode = isCloud ? 'cloud' : 'standalone'
  const details = isCloud ? cloudDetails : standaloneDetails
  const [selectedIds, setSelectedIds] = useState({ standalone: 'agent', cloud: 'cloud' })
  const selectedId = selectedIds[mode]
  const setSelectedId = (id: string) => setSelectedIds(current => ({ ...current, [mode]: id }))
  const selected = details.find(detail => detail.id === selectedId) ?? details[0]
  const capabilities = isCloud
    ? ['Access', 'Usage', 'Shared MCPs', 'Skills', 'Rules', 'Governance']
    : ['Sessions', 'Tools', 'Agents', 'Skills', 'MCPs', 'Rules', 'Commands', 'Hooks']

  return (
    <div className="mx-auto mt-6 w-full min-[1100px]:relative min-[1100px]:left-1/2 min-[1100px]:mx-0 min-[1100px]:w-[61.5rem] min-[1100px]:max-w-none min-[1100px]:-translate-x-1/2 min-[1200px]:w-[73rem]">
      {/* Keep this divider fixed on the switch seam; both columns get identical breathing room. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-1 left-1/2 hidden w-px -translate-x-1/2 bg-[var(--color-border-default)] min-[1100px]:block" />
      <RuntimeModeSwap mode={mode} className="grid gap-14 min-[1100px]:grid-cols-2 min-[1100px]:gap-16">
        <div className="flex min-h-0 items-start justify-center pb-1 pt-1 min-[1100px]:justify-start">
          <div className="flex w-full max-w-[30rem] flex-col items-center">
            <div className="grid w-full grid-cols-[5rem_5rem_5rem] justify-between">
              {(isCloud ? ['chat', 'console', 'dashboard'] : ['terminal', 'api', 'tauri']).map(id => {
                const detail = details.find(item => item.id === id)!
                return <RuntimeChoiceNode key={id} detail={detail} selected={selectedId === id} onSelect={() => setSelectedId(id)} labelPosition="top" />
              })}
            </div>

            <RuntimeBranchConnector />

            <RuntimeChoiceNode detail={details.find(item => item.id === (isCloud ? 'cloud' : 'agent'))!} selected={selectedId === (isCloud ? 'cloud' : 'agent')} onSelect={() => setSelectedId(isCloud ? 'cloud' : 'agent')} labelPosition="bottom" />

            <div className="mt-9 flex min-h-[4.25rem] w-full max-w-[18rem] flex-wrap content-start justify-center gap-2">
              {capabilities.map(capability => <span key={capability} className="rounded-full border border-[var(--color-border-default)] px-2.5 py-1 text-[10px] text-[var(--color-text-secondary)]">{capability}</span>)}
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 min-w-0 w-full flex-col justify-start border-t border-[var(--color-border-default)] pb-1 pt-10 min-[1100px]:border-t-0 min-[1100px]:pl-8 min-[1100px]:pt-1">
          <RuntimeDetailSwap transitionKey={`${mode}-${selected.id}`}>
            <RuntimeDetailPanel detail={selected} />
          </RuntimeDetailSwap>
        </aside>
      </RuntimeModeSwap>
    </div>
  )
}

function RuntimeModeSwap({ mode, children, className = '' }: { mode: 'standalone' | 'cloud'; children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={mode}
        className={className}
        initial={reduceMotion ? false : { opacity: 0, filter: 'blur(4px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        exit={reduceMotion ? undefined : { opacity: 0, filter: 'blur(3px)' }}
        transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

function RuntimeDetailSwap({ transitionKey, children }: { transitionKey: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={transitionKey}
        initial={reduceMotion ? false : { opacity: 0, filter: 'blur(4px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        exit={reduceMotion ? undefined : { opacity: 0, filter: 'blur(3px)' }}
        transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

function RuntimeChoiceNode({ detail, selected, onSelect, labelPosition = 'bottom' }: { detail: RuntimeDetail; selected: boolean; onSelect: () => void; labelPosition?: 'top' | 'bottom' }) {
  const label = <span className={`whitespace-nowrap text-[11px] ${selected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>{detail.label}</span>

  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className="group flex min-w-0 cursor-pointer flex-col items-center gap-2.5 text-center">
      {labelPosition === 'top' && label}
      <span className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border transition-[border-color,background-color,box-shadow] duration-200 ${selected ? DIAGRAM_ACTIVE_GLOW : `${DIAGRAM_NODE_BASE} group-hover:border-[var(--color-diagram-active-border)] group-hover:text-[var(--color-diagram-icon)]`}`}>{detail.icon}</span>
      {labelPosition === 'bottom' && label}
    </button>
  )
}

function RuntimeBranchConnector() {
  const reduceMotion = useReducedMotion()

  return (
    <svg aria-hidden="true" className="h-[6.5rem] w-full max-w-[30rem]" viewBox="0 0 480 104" preserveAspectRatio="none">
      <motion.path
        d="M40 24 V36 Q40 48 52 48 H224 Q240 48 240 64 V80 M240 24 V80 M440 24 V36 Q440 48 428 48 H256 Q240 48 240 64"
        fill="none"
        stroke="#7dd3fc"
        strokeDasharray="3 6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
        initial={reduceMotion ? false : { opacity: 0.35, strokeDashoffset: 18 }}
        animate={{ opacity: 1, strokeDashoffset: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.g
        initial={reduceMotion ? false : { opacity: 0.35 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <circle cx="40" cy="24" r="3" fill="#7dd3fc" />
        <circle cx="240" cy="24" r="3" fill="#7dd3fc" />
        <circle cx="440" cy="24" r="3" fill="#7dd3fc" />
        <circle cx="240" cy="80" r="3" fill="#7dd3fc" />
      </motion.g>
    </svg>
  )
}

function RuntimeDetailPanel({ detail }: { detail: RuntimeDetail }) {
  return (
    <div className="flex min-h-0 min-w-0 w-full flex-col justify-start">
      <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-diagram-node)] [&_img]:!h-5 [&_img]:!w-5 [&_svg]:h-5 [&_svg]:w-5">{detail.icon}</span>
        <span className="text-[10px] uppercase tracking-[0.16em]">{detail.eyebrow}</span>
      </div>
      <h3 className="mt-6 text-2xl font-medium tracking-[-0.035em] text-[var(--color-text-primary)] sm:text-3xl">{detail.title}</h3>
      <p className="mt-4 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">{detail.description}</p>
      <div className="mt-8 rounded-2xl bg-[var(--color-surface-diagram-node)] p-5">
        <p className="font-mono text-[11px] font-medium text-[var(--color-diagram-accent)]">{detail.previewTitle}</p>
        <div className="mt-5 space-y-3">
          {detail.previewLines.map(line => (
            <div key={line} className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
              <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--color-diagram-accent)]" />
              <span>{line}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FinalCta({ onLaunch }: { onLaunch: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const footerColumns = [
    {
      title: 'Products',
      links: [
        { label: 'Nubols Cloud', href: '#platform' },
        { label: 'Nebula Agent', href: '#runtime' },
        { label: 'Nubols Desktop', href: '#runtime' },
        { label: 'Pricing', href: '/plans' },
      ],
    },
    {
      title: 'Platform',
      links: [
        { label: 'Chat', href: '#' },
        { label: 'Console', href: '#' },
        { label: 'Linux workspaces', href: '#' },
        { label: 'Dashboard', href: '#' },
        { label: 'Shared skills & MCPs', href: '#' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Documentation', href: '/docs' },
        { label: 'API reference', href: '/docs?topic=runtime-api#runtime-api' },
        { label: 'Blog', href: '#' },
        { label: 'Changelog', href: '#' },
        { label: 'Status', href: '#' },
        { label: 'Community', href: '#' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '#' },
        { label: 'Security', href: '/legal?document=security' },
        { label: 'Privacy policy', href: '/legal?document=privacy' },
        { label: 'Terms of service', href: '/legal?document=terms' },
        { label: 'Responsible disclosure', href: '/legal?document=security' },
        { label: 'Contact', href: '/contact' },
      ],
    },
  ]

  return (
    <>
      <section className="mx-auto max-w-[1480px] px-6 py-24 lg:px-10 lg:py-28">
        <ScrollReveal
          variant="visual"
          className="relative isolate mx-auto flex min-h-[380px] w-full items-center justify-center overflow-hidden rounded-[2rem] bg-[var(--color-surface-diagram-node)] px-6 py-20 text-center sm:min-h-[420px] min-[1100px]:w-[61.5rem] min-[1200px]:w-[73rem]"
        >
          <div aria-hidden="true" className="final-cta-shader pointer-events-none absolute inset-0 [&>*]:!absolute [&>*]:!inset-0 [&>*]:!h-full [&>*]:!w-full">
            <NebulaBackground fade={0} variant="classic" palette="graphite" resolutionScale={0.7} />
          </div>
          <div aria-hidden="true" className="final-cta-copy-blob pointer-events-none absolute left-1/2 top-1/2 h-[19rem] w-[42rem] max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl" />
          <div className="relative z-10 flex flex-col items-center justify-center gap-8">
            <h2 id="workspace" className="text-4xl font-medium tracking-[-0.05em] text-[var(--color-text-primary)] sm:text-6xl">Try Nubols now.</h2>
            <a href="/app" onClick={onLaunch} className="group inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--color-control-primary)] px-6 text-sm font-semibold text-[var(--color-control-on-primary)] transition hover:bg-[var(--color-control-primary-hover)]">
              Deploy an operator <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </ScrollReveal>
      </section>

      <Footer footerColumns={footerColumns} />
    </>
  )
}

type FooterColumn = {
  title: string
  links: { label: string; href: string }[]
}

export function Footer({ footerColumns: columns }: { footerColumns?: FooterColumn[] } = {}) {
  const { resolvedTheme, setPreference } = useThemePreference()
  const footerColumns = columns ?? [
    {
      title: 'Products',
      links: [
        { label: 'Nubols Cloud', href: '/#platform' },
        { label: 'Nebula Agent', href: '/#runtime' },
        { label: 'Nubols Desktop', href: '/#runtime' },
        { label: 'Pricing', href: '/plans' },
      ],
    },
    {
      title: 'Platform',
      links: [
        { label: 'Chat', href: '/#workspace' },
        { label: 'Console', href: '/#workspace' },
        { label: 'Linux workspaces', href: '/#platform' },
        { label: 'Dashboard', href: '/#platform' },
        { label: 'Shared skills & MCPs', href: '/#platform' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Documentation', href: '/docs' },
        { label: 'API reference', href: '/docs?topic=runtime-api#runtime-api' },
        { label: 'Blog', href: '#' },
        { label: 'Changelog', href: '#' },
        { label: 'Status', href: '#' },
        { label: 'Community', href: '#' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '/contact' },
        { label: 'Security', href: '/legal?document=security' },
        { label: 'Privacy policy', href: '/legal?document=privacy' },
        { label: 'Terms of service', href: '/legal?document=terms' },
        { label: 'Responsible disclosure', href: '/legal?document=security' },
        { label: 'Contact', href: '/contact' },
      ],
    },
  ]

  return (
      <footer className="bg-[var(--color-surface-footer)] text-[var(--color-text-primary)]">
        <div className="mx-auto max-w-[1480px] px-8 pb-12 pt-8 lg:px-[50px] lg:pb-16 lg:pt-[50px]">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))] lg:gap-8">
            <div className="sm:col-span-2 lg:col-span-1">
              <a href="/" aria-label="Nubols home" className="inline-flex text-[var(--color-text-primary)]">
                <NebulaMark size={48} />
              </a>
            </div>

            {footerColumns.map(column => (
              <div key={column.title}>
                <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">{column.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map(link => (
                    <li key={link.label}>
                      <a href={link.href} className="text-[13px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]">{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12">
            <div className="flex items-center justify-between gap-6">
              <p className="text-xs text-[var(--color-text-muted)]">© 2026 Nubols. All rights reserved.</p>
              <TooltipProvider delayDuration={250}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
                      onClick={() => setPreference(resolvedTheme === 'dark' ? 'light' : 'dark')}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-selected)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                    >
                      {resolvedTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} mode</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="mt-4 flex items-center gap-5">
              {[
                { label: 'GitHub', icon: <FaGithub size={20} /> },
                { label: 'X', icon: <FaXTwitter size={19} /> },
                { label: 'LinkedIn', icon: <FaLinkedinIn size={20} /> },
                { label: 'YouTube', icon: <FaYoutube size={21} /> },
              ].map(social => (
                <a key={social.label} href="#" aria-label={social.label} className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]">
                  {social.icon}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
  )
}
