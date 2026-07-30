import { LoaderCircle } from 'lucide-react'
import { NebulaMark } from '@nebula/runtime-ui'

export function AuthLoading({ label = 'Opening Nebula' }: { label?: string }) {
  return (
    <div className="relative z-[2] flex min-h-screen items-center justify-center text-white">
      <div className="flex items-center gap-3 text-sm text-white/45">
        <NebulaMark size={24} />
        <span>{label}</span>
        <LoaderCircle size={14} className="animate-spin text-white/30" />
      </div>
    </div>
  )
}
