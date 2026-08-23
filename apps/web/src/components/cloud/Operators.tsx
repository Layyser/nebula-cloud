import { ArrowRight, Box, Plus } from 'lucide-react'

export function Operators({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">Organization</p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-white/95">Operators</h1>
          <p className="mt-2 text-sm text-white/42">Each operator has an isolated Linux workspace and its own Nebula runtime.</p>
        </div>
        <button type="button" disabled className="flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-[12px] font-medium text-black opacity-45">
          <Plus size={14} /> Deploy operator
        </button>
      </div>

      <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button type="button" onClick={onOpenWorkspace} className="group rounded-2xl border border-white/[0.075] bg-white/[0.018] p-5 text-left transition hover:border-white/[0.13] hover:bg-white/[0.03]">
          <div className="flex items-start justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-300/10 bg-sky-300/[0.06] text-sky-200/60"><Box size={18} /></span>
            <span className="text-[10px] text-[var(--color-status-success)]">● Online</span>
          </div>
          <h2 className="mt-6 text-[15px] font-medium text-white/85">Release guardian</h2>
          <p className="mt-1 text-[11px] text-white/35">Engineering · Frankfurt</p>
          <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] text-white/35">
            <span>Persistent workspace</span>
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </button>
      </div>
    </div>
  )
}
