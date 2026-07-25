export function PlaceholderPage({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">{eyebrow}</p>
      <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-white/95">{title}</h1>
      <div className="mt-9 max-w-2xl rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.015] p-8">
        <p className="text-sm leading-6 text-white/42">{description}</p>
        <p className="mt-3 text-[11px] text-white/25">Control-plane template · backend not implemented yet</p>
      </div>
    </div>
  )
}
