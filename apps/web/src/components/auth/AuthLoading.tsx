import { LoaderCircle } from 'lucide-react'
import { NebulaMark } from '@nebula/runtime-ui'

export function AuthLoading({ label = 'Opening Nubols' }: { label?: string }) {
  return (
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 text-[var(--color-text-primary)]">
      <div className="ui-border-surface w-full max-w-sm rounded-2xl bg-[var(--color-surface-auth)] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div role="status" className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
          <NebulaMark size={24} />
          <span>{label}</span>
          <LoaderCircle size={14} className="ml-auto shrink-0 animate-spin text-[var(--color-text-muted)]" />
        </div>
      </div>
    </div>
  )
}
