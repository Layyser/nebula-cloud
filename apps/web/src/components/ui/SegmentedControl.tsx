type SegmentedOption<T extends string> = {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  ariaLabel: string
  value: T
  options: readonly [SegmentedOption<T>, SegmentedOption<T>]
  onValueChange: (value: T) => void
  tone?: 'light' | 'dark'
  className?: string
}

export function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  options,
  onValueChange,
  tone = 'light',
  className = '',
}: SegmentedControlProps<T>) {
  const selectedIndex = options.findIndex(option => option.value === value)
  const light = tone === 'light'

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative grid h-10 grid-cols-2 items-center rounded-full ${light ? 'border border-white/[0.16]' : 'bg-[var(--color-surface-segment)]'} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute ${light ? '-inset-y-[3px]' : '-inset-y-0.5'} w-[calc(54%+4px)] rounded-full shadow-sm transition-[left,width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          selectedIndex === 0 ? '-left-[3px]' : 'left-[calc(46%-1px)]'
        } ${light ? 'bg-white shadow-[0_0_24px_rgba(255,255,255,0.14)]' : 'bg-[var(--color-surface-segment-selected)]'}`}
      />
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onValueChange(option.value)}
            className={`relative z-10 flex h-10 cursor-pointer items-center justify-center self-center rounded-full px-4 text-center text-sm leading-none transition-colors duration-[320ms] ${
              selected
                ? light ? 'text-black' : 'text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <span className={`flex w-full items-center justify-center ${index === 0 ? 'translate-x-[4%]' : '-translate-x-[4%]'}`}>
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
