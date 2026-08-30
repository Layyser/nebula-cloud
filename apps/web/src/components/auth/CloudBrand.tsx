import { NebulaMark } from '@nebula/runtime-ui'

export function CloudBrand({
  onSelect,
}: {
  onSelect?: () => void
}) {
  const brand = (
    <>
      <NebulaMark size={24} />
      <span className="nebula-wordmark leading-none">Nubols</span>
    </>
  )

  return (
    <div className="flex h-6 items-center gap-2.5">
      {onSelect
        ? (
            <button
              type="button"
              onClick={onSelect}
              aria-label="Return to the Nubols landing page"
              className="flex h-6 cursor-pointer items-center gap-2.5 text-sm font-semibold leading-none text-white/80 transition hover:text-white"
            >
              {brand}
            </button>
          )
        : (
            <div className="flex h-6 items-center gap-2.5 text-sm font-semibold leading-none text-white/80">
              {brand}
            </div>
          )}
      <span className="h-4 w-px bg-white/[0.12]" />
      <span className="flex h-6 items-center text-[10px] font-medium uppercase leading-none tracking-[0.18em] text-white/30">
        Cloud
      </span>
    </div>
  )
}
