import type { ReactNode } from 'react'

export function SectionEyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-sm text-[var(--color-text-muted)] sm:text-base ${className}`}>
      {children}
    </p>
  )
}
