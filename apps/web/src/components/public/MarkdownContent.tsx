import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function textFromChildren(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textFromChildren).join('')
  return ''
}

function headingId(children: ReactNode): string {
  return textFromChildren(children)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function MarkdownContent({ source, legal = false }: { source: string; legal?: boolean }) {
  const headingClass = legal
    ? 'font-serif font-normal tracking-[-0.025em] text-[var(--color-text-primary)]'
    : 'font-medium tracking-[-0.035em] text-[var(--color-text-primary)]'

  const bodyClass = legal
    ? 'font-serif text-[1.08rem] leading-[1.75]'
    : 'text-[0.95rem] leading-[1.75rem]'

  return (
    <article className={`${legal ? 'legal-markdown' : 'docs-markdown'} min-w-0`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 id={headingId(children)} className={`${headingClass} text-4xl leading-[1.08] sm:text-5xl`}>{children}</h1>,
          h2: ({ children }) => <h2 id={headingId(children)} className={`${headingClass} scroll-mt-28 text-[1.7rem] leading-[1.18] sm:text-[1.9rem]`}>{children}</h2>,
          h3: ({ children }) => <h3 id={headingId(children)} className={`${headingClass} scroll-mt-28 text-lg leading-snug sm:text-xl`}>{children}</h3>,
          p: ({ children }) => <p className={bodyClass}>{children}</p>,
          a: ({ children, href }) => <a href={href} className="font-medium text-[var(--color-text-primary)] underline decoration-[var(--color-border-strong)] decoration-1 underline-offset-4 transition-[color,text-decoration-color] hover:decoration-[var(--color-text-primary)]">{children}</a>,
          strong: ({ children }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc space-y-1.5 pl-5 marker:text-[var(--color-text-subtle)]">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1.5 pl-5 marker:text-[var(--color-text-subtle)]">{children}</ol>,
          li: ({ children }) => <li className={legal ? 'font-serif text-[1.08rem] leading-[1.7]' : 'text-[0.95rem] leading-6'}>{children}</li>,
          blockquote: ({ children }) => <blockquote className="rounded-r-[var(--radius-surface)] border-l-[3px] border-[var(--color-border-strong)] bg-[var(--color-surface-recessed)] px-5 py-4 text-[var(--color-text-secondary)]">{children}</blockquote>,
          code: ({ children, className, ...props }: ComponentPropsWithoutRef<'code'>) => {
            const block = className?.startsWith('language-')
            return block
              ? <code className={`${className ?? ''} font-mono text-[13px] leading-6 text-[var(--color-text-secondary)]`} {...props}>{children}</code>
              : <code className="rounded-[calc(var(--radius-control)*0.65)] bg-[var(--color-surface-raised)] px-1.5 py-0.5 font-mono text-[0.88em] text-[var(--color-text-primary)]" {...props}>{children}</code>
          },
          pre: ({ children }) => <pre className="overflow-x-auto rounded-[var(--radius-control)] bg-[var(--color-surface-raised)] px-4 py-3">{children}</pre>,
          hr: () => <hr className="border-0 border-t border-[var(--color-border-subtle)]" />,
          table: ({ children }) => <div className="markdown-table overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border-b border-[var(--color-border-strong)] px-3 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-primary)] first:pl-0">{children}</th>,
          td: ({ children }) => <td className="border-b border-[var(--color-border-subtle)] px-3 py-3.5 leading-6 text-[var(--color-text-secondary)] first:pl-0">{children}</td>,
        }}
      >
        {source}
      </ReactMarkdown>
    </article>
  )
}
