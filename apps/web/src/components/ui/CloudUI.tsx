import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { NebulaMark } from '@nebula/runtime-ui'

export type NebulaSurface = 'cloud' | 'docs' | 'legal'

export function BrandLockup({
  surface,
  onSelect,
  compact = false,
}: {
  surface?: NebulaSurface
  onSelect?: () => void
  compact?: boolean
}) {
  const content = (
    <>
      <span className="ui-icon-frame ui-icon-frame--brand">
        <NebulaMark size={compact ? 20 : 24} />
      </span>
      <span className="nebula-wordmark leading-none">Nebula</span>
      {surface && (
        <>
          <span aria-hidden="true" className="brand-lockup__divider" />
          <span className="brand-lockup__surface">{surface}</span>
        </>
      )}
    </>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-label="Return to the Nebula landing page"
        className="brand-lockup cursor-pointer"
      >
        {content}
      </button>
    )
  }

  return <span className="brand-lockup">{content}</span>
}

export function IconFrame({
  children,
  size = 'md',
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  tone?: 'neutral' | 'blue' | 'green' | 'red'
  className?: string
}) {
  return (
    <span className={`ui-icon-frame ui-icon-frame--${size} ui-icon-frame--${tone} ${className}`}>
      {children}
    </span>
  )
}

export function SurfacePanel({
  children,
  className = '',
  level = 2,
}: {
  children: ReactNode
  className?: string
  level?: 1 | 2 | 3
}) {
  return (
    <div className={`ui-panel ui-panel--${level} ${className}`}>
      {children}
    </div>
  )
}

export const ActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: 'primary' | 'secondary' | 'quiet' | 'danger'
    size?: 'sm' | 'md' | 'lg'
  }
>(function ActionButton(
  { tone = 'secondary', size = 'md', className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`ui-button ui-button--${tone} ui-button--${size} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})

export function ActionLink({
  href,
  children,
  onClick,
  tone = 'secondary',
  size = 'md',
  className = '',
}: {
  href: string
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  tone?: 'primary' | 'secondary' | 'quiet'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={`ui-button ui-button--${tone} ui-button--${size} ${className}`}
    >
      {children}
    </a>
  )
}

export function FieldLabel({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="ui-field__label">{label}</span>
      {children}
    </label>
  )
}

export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function TextField({ className = '', ...props }, ref) {
  return <input ref={ref} className={`ui-field ${className}`} {...props} />
})

export function StatusGlyph({
  state,
  children,
}: {
  state: 'complete' | 'active' | 'pending' | 'error'
  children: ReactNode
}) {
  return (
    <span className={`ui-status-glyph ui-status-glyph--${state}`}>
      {children}
    </span>
  )
}
