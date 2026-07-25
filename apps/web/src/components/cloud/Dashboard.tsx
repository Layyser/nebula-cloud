import { CircleDollarSign, Cpu, ListChecks } from 'lucide-react'

export function Dashboard({
  userName,
}: {
  userName: string
}) {
  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <div className="flex items-start justify-between gap-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">Organization overview</p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-white/95">
            Good morning, {userName}.
          </h1>
          <p className="mt-2 text-sm text-white/42">Your operators, workspaces, and organization controls in one place.</p>
        </div>
        <span className="rounded-full border border-emerald-300/15 bg-emerald-400/[0.06] px-3 py-1.5 text-[11px] text-emerald-300/75">● All systems healthy</span>
      </div>

      <div className="mt-9 grid grid-cols-3 gap-3">
        <Metric icon={<Cpu size={15} />} label="Deployed operators" value="1" detail="1 workspace online" />
        <Metric icon={<CircleDollarSign size={15} />} label="July spend" value="$9" detail="Infrastructure only" />
        <Metric icon={<ListChecks size={15} />} label="Tasks completed" value="148" detail="+24% this month" />
      </div>

      <section className="mt-4 rounded-2xl border border-white/[0.075] bg-white/[0.018] p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">Your operator</p>
          <h2 className="mt-2 text-lg font-medium text-white/90">Persistent Linux workspace</h2>
        </div>
        <div className="mt-5 flex items-center gap-4 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
          <span className="h-9 w-9 rounded-xl border border-sky-300/10 bg-sky-300/[0.06]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-white/80">Release guardian</span>
            <span className="mt-0.5 block text-[11px] text-white/35">Engineering · nebula --serve</span>
          </span>
          <span className="text-[11px] text-emerald-300/65">● Online</span>
        </div>
      </section>
    </div>
  )
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.075] bg-white/[0.018] p-5">
      <div className="flex items-center gap-2 text-white/35">{icon}<span className="text-[11px]">{label}</span></div>
      <p className="mt-5 text-2xl font-semibold tracking-tight text-white/90">{value}</p>
      <p className="mt-1 text-[10px] text-white/30">{detail}</p>
    </div>
  )
}
