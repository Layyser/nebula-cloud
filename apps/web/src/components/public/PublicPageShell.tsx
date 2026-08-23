import type { MouseEvent, ReactNode } from 'react'
import { Footer, Header, type HeaderNavigationLink } from '../landing/LandingPage'

interface PublicPageShellProps {
  children: ReactNode
  onLaunch: () => void
  className?: string
  headerLinks?: readonly HeaderNavigationLink[]
}

export function PublicPageShell({ children, onLaunch, className = '', headerLinks }: PublicPageShellProps) {
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
    <div className={`public-page relative z-[2] min-h-screen overflow-x-clip bg-[var(--color-surface-page)] text-[var(--color-text-primary)] ${className}`}>
      <Header onLaunch={handleLaunch} navigationLinks={headerLinks} />
      {children}
      <Footer />
    </div>
  )
}
