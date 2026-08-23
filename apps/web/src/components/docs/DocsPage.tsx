import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BookOpen, Boxes, ChevronDown, Cloud, Code2, KeyRound, MonitorSmartphone, Rocket, ShieldCheck, Users } from 'lucide-react'
import agentMd from '../../content/docs/agent.md?raw'
import capabilitiesMd from '../../content/docs/capabilities.md?raw'
import cloudMd from '../../content/docs/cloud.md?raw'
import conceptsMd from '../../content/docs/concepts.md?raw'
import desktopMd from '../../content/docs/desktop.md?raw'
import orgsMd from '../../content/docs/orgs.md?raw'
import runtimeApiMd from '../../content/docs/runtime-api.md?raw'
import securityMd from '../../content/docs/security.md?raw'
import startMd from '../../content/docs/start.md?raw'
import usageMd from '../../content/docs/usage.md?raw'
import { ArticleIndex } from '../public/ArticleIndex'
import { MarkdownContent } from '../public/MarkdownContent'
import { PublicPageShell } from '../public/PublicPageShell'
import { SectionEyebrow } from '../public/SectionEyebrow'

type DocTopicId = 'start' | 'concepts' | 'agent' | 'desktop' | 'cloud' | 'organizations' | 'usage' | 'runtime-api' | 'capabilities' | 'security'

type DocTopic = {
  id: DocTopicId
  label: string
  group: string
  icon: typeof Rocket
  summary: string
  sections: string[]
  markdown: string
}

const DOC_TOPICS: DocTopic[] = [
  {
    id: 'start',
    label: 'Quickstart',
    group: 'Get started',
    icon: Rocket,
    summary: 'From sign-in to a working operator.',
    sections: ['Overview', 'Before you begin', 'Meet your operator', 'Working by chat', 'Taking over in Console', 'Next steps'],
    markdown: startMd,
  },
  {
    id: 'concepts',
    label: 'Core concepts',
    group: 'Get started',
    icon: BookOpen,
    summary: 'Operators, workspaces, agents, sessions — the mental model.',
    sections: ['Overview', 'Operators', 'Workspaces', 'Agents', 'Sessions', 'Capabilities at a glance', 'Where configuration lives'],
    markdown: conceptsMd,
  },
  {
    id: 'agent',
    label: 'Nebula Agent',
    group: 'Runtime',
    icon: Code2,
    summary: 'The standalone runtime behind every interface.',
    sections: ['Overview', 'Interfaces', 'Install', 'Configuration', 'Model providers', 'Security modes', 'Change tracking', 'On-disk layout'],
    markdown: agentMd,
  },
  {
    id: 'desktop',
    label: 'Desktop & web UI',
    group: 'Runtime',
    icon: MonitorSmartphone,
    summary: 'Browser and Windows frontends for local runtimes.',
    sections: ['Overview', 'Standalone web app', 'Nebula Desktop for Windows', 'How connections work'],
    markdown: desktopMd,
  },
  {
    id: 'cloud',
    label: 'Cloud workspaces',
    group: 'Cloud',
    icon: Cloud,
    summary: 'Managed persistent Linux operators.',
    sections: ['Overview', 'Lifecycle', 'Persistent storage', 'Replacement and restarts', 'Resource profiles', 'Console access'],
    markdown: cloudMd,
  },
  {
    id: 'organizations',
    label: 'Organizations & access',
    group: 'Cloud',
    icon: Users,
    summary: 'Roles, join codes, and member governance.',
    sections: ['Overview', 'Roles', 'Active organization', 'Joining with codes', 'Managing members', 'Admin visibility'],
    markdown: orgsMd,
  },
  {
    id: 'usage',
    label: 'Usage & costs',
    group: 'Cloud',
    icon: BarChart3,
    summary: 'Token accounting and estimated spend.',
    sections: ['Overview', 'What gets recorded', 'Cost estimates', 'Dashboards', 'Ranges', 'Beta notes'],
    markdown: usageMd,
  },
  {
    id: 'runtime-api',
    label: 'Runtime API',
    group: 'Reference',
    icon: KeyRound,
    summary: 'The organization-neutral HTTP surface.',
    sections: ['Overview', 'Authentication', 'Health and metadata', 'Sending turns', 'Session management', 'Per-session controls', 'Agents and capabilities', 'Change ledger', 'Going through Nebula Cloud'],
    markdown: runtimeApiMd,
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    group: 'Reference',
    icon: Boxes,
    summary: 'Agents, skills, commands, rules, hooks, MCPs.',
    sections: ['Overview', 'Agents', 'Skills', 'Commands', 'Rules', 'Hooks', 'MCP servers', 'Managing capabilities'],
    markdown: capabilitiesMd,
  },
  {
    id: 'security',
    label: 'Security',
    group: 'Reference',
    icon: ShieldCheck,
    summary: 'Isolation boundaries and credential flow.',
    sections: ['Overview', 'Trust boundaries', 'Workspace isolation', 'Credentials and tokens', 'Audit trail', 'Responsible disclosure'],
    markdown: securityMd,
  },
]

export function DocsPage({ onLaunch }: { onLaunch: () => void }) {
  const topicFromQuery = new URLSearchParams(window.location.search).get('topic') as DocTopicId | null
  const [topicId, setTopicId] = useState<DocTopicId>(
    topicFromQuery && DOC_TOPICS.some(topic => topic.id === topicFromQuery) ? topicFromQuery : 'start',
  )
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const topic = useMemo(() => DOC_TOPICS.find(candidate => candidate.id === topicId) ?? DOC_TOPICS[0], [topicId])
  const activeIndex = DOC_TOPICS.findIndex(candidate => candidate.id === topic.id)
  const previous = activeIndex > 0 ? DOC_TOPICS[activeIndex - 1] : null
  const next = activeIndex < DOC_TOPICS.length - 1 ? DOC_TOPICS[activeIndex + 1] : null

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [topicId])

  const chooseTopic = (nextTopic: DocTopicId) => {
    setTopicId(nextTopic)
    setMobileNavOpen(false)
    window.history.replaceState(null, '', `/docs?topic=${nextTopic}`)
  }

  const groups = [...new Set(DOC_TOPICS.map(candidate => candidate.group))]

  return (
    <PublicPageShell onLaunch={onLaunch} className="public-page-plain">
      <main className="mx-auto min-h-screen max-w-[1480px] px-6 pb-10 pt-28 lg:px-10 lg:pt-32">
        <div className="flex justify-center">
          <div className="hidden min-w-0 grow basis-0 pr-10 min-[1280px]:flex">
            <aside className="sticky top-28 max-h-[calc(100vh-8rem)] w-60 max-w-full shrink-0 self-start overflow-y-auto pb-12 lg:top-32">
              <div className="mb-7">
                <SectionEyebrow>/docs</SectionEyebrow>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Product and runtime documentation.</p>
              </div>
              <nav aria-label="Documentation topics" className="space-y-6">
                {groups.map(group => (
                  <div key={group}>
                    <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">{group}</p>
                    <div className="space-y-0.5">
                      {DOC_TOPICS.filter(candidate => candidate.group === group).map(candidate => {
                        const Icon = candidate.icon
                        const selected = candidate.id === topicId
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => chooseTopic(candidate.id)}
                            className={`flex h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-left text-sm transition-colors ${selected ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'}`}
                          >
                            <Icon size={15} strokeWidth={1.8} />
                            {candidate.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>
          </div>

          <section className="w-full min-w-0 max-w-[760px] pb-36">
            <div className="relative mb-10 min-[1280px]:hidden">
              <button
                type="button"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(open => !open)}
                className="flex h-11 w-full items-center justify-between rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] px-4 text-sm font-medium text-[var(--color-text-primary)]"
              >
                <span className="flex items-center gap-3">
                  <topic.icon size={15} strokeWidth={1.8} />
                  {topic.label}
                </span>
                <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} />
              </button>
              {mobileNavOpen && (
                <div className="absolute inset-x-0 top-full z-40 mt-2 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-diagram-node)] p-2 shadow-[var(--shadow-surface)]">
                  {groups.map(group => (
                    <div key={group} className="py-1.5">
                      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">{group}</p>
                      {DOC_TOPICS.filter(candidate => candidate.group === group).map(candidate => {
                        const selected = candidate.id === topic.id
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            onClick={() => chooseTopic(candidate.id)}
                            className={`flex h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left text-sm transition-colors ${selected ? 'bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'}`}
                          >
                            <candidate.icon size={15} strokeWidth={1.8} />
                            {candidate.label}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <header className="border-b border-[var(--color-border-subtle)] pb-5">
              <h1 className="text-3xl font-medium leading-[1.08] tracking-[-0.045em] sm:text-4xl">{topic.label}</h1>
              <p className="mt-3 max-w-2xl text-[0.95rem] leading-7 text-[var(--color-text-secondary)]">{topic.summary}</p>
            </header>
            <MarkdownContent source={topic.markdown} />

            <nav aria-label="Documentation pagination" className="mt-14 flex items-stretch justify-between gap-4 border-t border-[var(--color-border-subtle)] pt-6 min-[1280px]:hidden">
              {previous ? (
                <button
                  type="button"
                  onClick={() => chooseTopic(previous.id)}
                  className="min-w-0 flex-1 rounded-[var(--radius-control)] px-1 text-left transition-colors hover:text-[var(--color-text-primary)]"
                >
                  <span className="block text-xs text-[var(--color-text-muted)]">Previous</span>
                  <span className="mt-1 block truncate text-sm font-medium text-[var(--color-text-secondary)] underline decoration-[var(--color-border-strong)] decoration-1 underline-offset-4">{previous.label}</span>
                </button>
              ) : <span className="flex-1" />}
              {next ? (
                <button
                  type="button"
                  onClick={() => chooseTopic(next.id)}
                  className="min-w-0 flex-1 rounded-[var(--radius-control)] px-1 text-right transition-colors hover:text-[var(--color-text-primary)]"
                >
                  <span className="block text-xs text-[var(--color-text-muted)]">Next</span>
                  <span className="mt-1 block truncate text-sm font-medium text-[var(--color-text-secondary)] underline decoration-[var(--color-border-strong)] decoration-1 underline-offset-4">{next.label}</span>
                </button>
              ) : <span className="flex-1" />}
            </nav>
          </section>

          <div className="hidden min-w-0 grow basis-0 justify-end pl-10 min-[1280px]:flex">
            <aside className="sticky top-28 max-h-[calc(100vh-8rem)] w-[190px] max-w-full shrink-0 self-start overflow-y-auto lg:top-32 min-[1380px]:w-[210px]">
              <ArticleIndex sections={topic.sections} pathPrefix={`/docs?topic=${topicId}`} copyText={topic.markdown.trim()} />
            </aside>
          </div>
        </div>
      </main>
    </PublicPageShell>
  )
}
