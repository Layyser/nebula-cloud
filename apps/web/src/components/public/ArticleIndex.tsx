import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function ArticleIndex({
  sections,
  pathPrefix = '',
  copyText,
}: {
  sections: readonly string[]
  pathPrefix?: string
  copyText?: string
}) {
  const sectionIds = useMemo(() => sections.map(slug), [sections])
  const sectionKey = sectionIds.join('|')
  const [activeId, setActiveId] = useState(sectionIds[0] ?? '')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setActiveId(window.location.hash.slice(1) || sectionIds[0] || '')
  }, [sectionKey])

  const copyPage = async () => {
    try {
      await navigator.clipboard.writeText(copyText ?? window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be denied by the browser. Keep the navigation usable.
    }
  }

  const selectSection = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault()
    setActiveId(id)

    document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })

    const nextUrl = pathPrefix
      ? `${pathPrefix}#${id}`
      : `${window.location.pathname}${window.location.search}#${id}`
    window.history.replaceState(null, '', nextUrl)
  }

  return (
    <nav aria-label="On this page">
      <div className="border-l-[3px] border-[var(--color-border-default)]">
        {sections.map((section, index) => {
          const id = sectionIds[index]
          const selected = id === activeId
          return (
            <a
              key={section}
              href={`${pathPrefix}#${id}`}
              aria-current={selected ? 'location' : undefined}
              onClick={event => selectSection(event, id)}
              className={`-ml-[3px] block border-l-[3px] px-4 py-1.5 text-xs leading-5 transition-[border-color,color] ${selected ? 'border-[var(--color-text-primary)] text-[var(--color-text-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]'}`}
            >
              {section}
            </a>
          )
        })}
      </div>
      <button
        type="button"
        onClick={copyPage}
        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--color-control-primary)] px-2.5 text-[11px] font-medium text-[var(--color-control-on-primary)] transition-colors hover:bg-[var(--color-control-primary-hover)]"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy page'}
      </button>
    </nav>
  )
}
