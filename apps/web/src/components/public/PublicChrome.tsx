import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Building2,
  ChevronDown,
  Code2,
  FileText,
  Menu,
  MessagesSquare,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react'
import {
  ActionLink,
  BrandLockup,
  IconFrame,
  type NebulaSurface,
} from '../ui/CloudUI'

export type PublicNavigate = (path: string) => void

interface PublicHeaderProps {
  onNavigate: PublicNavigate
  surface?: NebulaSurface
  quiet?: boolean
}

const menuGroups = [
  {
    label: 'Product',
    summary: 'One persistent computer for every AI operator.',
    links: [
      { href: '/#operator', label: 'The operator', description: 'Intelligence, tools, memory, and a Linux home.', icon: Boxes },
      { href: '/#collaboration', label: 'Chat + Console', description: 'Delegate the task or take over the same workspace.', icon: MessagesSquare },
      { href: '/#control', label: 'Organization control', description: 'Access, usage, sharing, and cost in one place.', icon: Building2 },
    ],
  },
  {
    label: 'Platform',
    summary: 'Run Nebula alone or manage it as infrastructure.',
    links: [
      { href: '/#architecture', label: 'Runtime architecture', description: 'A tiny standalone core behind every operator.', icon: Code2 },
      { href: '/#architecture', label: 'Isolated workspaces', description: 'Persistent Linux homes with explicit boundaries.', icon: Terminal },
      { href: '/#control', label: 'Security and governance', description: 'Humans remain in control of access and policy.', icon: ShieldCheck },
    ],
  },
  {
    label: 'Resources',
    summary: 'Understand the system before you deploy it.',
    links: [
      { href: '/docs', label: 'Documentation', description: 'Product, architecture, and runtime reference.', icon: BookOpen },
      { href: '/legal', label: 'Legal center', description: 'Draft policy and agreement surfaces.', icon: FileText },
      { href: '/#pricing', label: 'Pricing', description: 'Operator-based plans with your own model access.', icon: ArrowRight },
    ],
  },
] as const

function internalClick(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  onNavigate: PublicNavigate,
) {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) return

  if (!href.startsWith('/')) return
  event.preventDefault()
  onNavigate(href)
}

export function PublicHeader({ onNavigate, surface, quiet = false }: PublicHeaderProps) {
  const [scrolled, setScrolled] = useState(
    () => typeof window !== 'undefined' && window.scrollY > 12,
  )
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSection, setMobileSection] = useState<string | null>('Product')

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const navigate = (path: string) => {
    setMobileOpen(false)
    onNavigate(path)
  }

  return (
    <header className={`public-header ${scrolled || quiet ? 'public-header--solid' : ''}`}>
      <div className="public-header__inner">
        <BrandLockup surface={surface} onSelect={() => onNavigate('/')} />

        <NavigationMenu.Root className="public-nav hidden lg:block" delayDuration={90}>
          <NavigationMenu.List className="public-nav__list">
            {menuGroups.map(group => (
              <NavigationMenu.Item key={group.label}>
                <NavigationMenu.Trigger className="public-nav__trigger">
                  {group.label}
                  <ChevronDown size={13} aria-hidden="true" />
                </NavigationMenu.Trigger>
                <NavigationMenu.Content className="public-nav__content">
                  <div className="public-nav__intro">
                    <span>{group.label}</span>
                    <p>{group.summary}</p>
                  </div>
                  <div className="public-nav__links">
                    {group.links.map(link => {
                      const Icon = link.icon
                      return (
                        <NavigationMenu.Link key={`${group.label}-${link.label}`} asChild>
                          <a
                            href={link.href}
                            onClick={event => internalClick(event, link.href, onNavigate)}
                            className="public-nav__link"
                          >
                            <IconFrame size="md"><Icon size={15} /></IconFrame>
                            <span>
                              <strong>{link.label}</strong>
                              <small>{link.description}</small>
                            </span>
                          </a>
                        </NavigationMenu.Link>
                      )
                    })}
                  </div>
                </NavigationMenu.Content>
              </NavigationMenu.Item>
            ))}
            <NavigationMenu.Item>
              <NavigationMenu.Link asChild>
                <a
                  href="/#pricing"
                  onClick={event => internalClick(event, '/#pricing', onNavigate)}
                  className="public-nav__direct"
                >
                  Pricing
                </a>
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          </NavigationMenu.List>
          <div className="public-nav__viewport-position">
            <NavigationMenu.Viewport className="public-nav__viewport" />
          </div>
        </NavigationMenu.Root>

        <div className="public-header__actions">
          <ActionLink
            href="/app"
            onClick={event => internalClick(event, '/app', onNavigate)}
            tone="primary"
            size="md"
            className="hidden sm:inline-flex"
          >
            Try Nebula
            <ArrowRight size={14} />
          </ActionLink>

          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <button type="button" className="public-header__menu lg:hidden" aria-label="Open navigation">
                <Menu size={18} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="mobile-nav__overlay" />
              <Dialog.Content className="mobile-nav__content">
                <div className="mobile-nav__top">
                  <BrandLockup surface={surface} onSelect={() => navigate('/')} />
                  <Dialog.Close asChild>
                    <button type="button" className="public-header__menu" aria-label="Close navigation">
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>
                <div className="mobile-nav__body">
                  {menuGroups.map(group => {
                    const open = mobileSection === group.label
                    return (
                      <section key={group.label} className="mobile-nav__section">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setMobileSection(open ? null : group.label)}
                          className="mobile-nav__section-trigger"
                        >
                          {group.label}
                          <ChevronDown size={15} className={open ? 'rotate-180' : ''} />
                        </button>
                        <div className={`mobile-nav__section-content ${open ? 'is-open' : ''}`}>
                          {group.links.map(link => {
                            const Icon = link.icon
                            return (
                              <a
                                key={link.label}
                                href={link.href}
                                onClick={event => {
                                  internalClick(event, link.href, navigate)
                                }}
                                className="mobile-nav__link"
                              >
                                <Icon size={15} />
                                <span>{link.label}</span>
                              </a>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                  <a
                    href="/#pricing"
                    onClick={event => internalClick(event, '/#pricing', navigate)}
                    className="mobile-nav__pricing"
                  >
                    Pricing
                  </a>
                </div>
                <ActionLink
                  href="/app"
                  onClick={event => internalClick(event, '/app', navigate)}
                  tone="primary"
                  size="lg"
                  className="w-full"
                >
                  Try Nebula
                  <ArrowRight size={15} />
                </ActionLink>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  )
}

export function PublicFooter({
  onNavigate,
  surface,
}: {
  onNavigate: PublicNavigate
  surface?: NebulaSurface
}) {
  const groups: Array<{ label: string; links: Array<{ label: string; href: string }> }> = [
    {
      label: 'Product',
      links: [
        { label: 'Operator', href: '/#operator' },
        { label: 'Chat + Console', href: '/#collaboration' },
        { label: 'Pricing', href: '/#pricing' },
      ],
    },
    {
      label: 'Resources',
      links: [
        { label: 'Docs', href: '/docs' },
        { label: 'Architecture', href: '/#architecture' },
        { label: 'Legal', href: '/legal' },
      ],
    },
  ]

  return (
    <footer className="public-footer">
      <div className="public-footer__lead">
        <div>
          <BrandLockup surface={surface} onSelect={() => onNavigate('/')} />
          <p>Persistent AI operators for people and organizations.</p>
        </div>
        <ActionLink href="/app" onClick={event => internalClick(event, '/app', onNavigate)} tone="primary">
          Try Nebula <ArrowRight size={14} />
        </ActionLink>
      </div>
      <div className="public-footer__grid">
        <p className="public-footer__note">Nebula Core stays independent. Nebula Cloud manages the infrastructure around it.</p>
        {groups.map(group => (
          <div key={group.label} className="public-footer__group">
            <span>{group.label}</span>
            {group.links.map(link => (
              <a
                key={link.label}
                href={link.href}
                onClick={event => internalClick(event, link.href, onNavigate)}
              >
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="public-footer__bottom">
        <span>© 2026 Nebula</span>
        <span>Built around an organization-neutral runtime.</span>
      </div>
    </footer>
  )
}

export function PublicPage({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`public-page ${className}`}>{children}</div>
}
