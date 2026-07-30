import { type MouseEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Bot,
  Boxes,
  Building2,
  Check,
  CircleDot,
  Cloud,
  Code2,
  Database,
  FolderKanban,
  Gauge,
  Globe2,
  HardDrive,
  KeyRound,
  Library,
  LockKeyhole,
  MessagesSquare,
  Network,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Wifi,
} from 'lucide-react'
import { NebulaBackground, NebulaMark } from '@nebula/runtime-ui'
import { ActionLink, IconFrame, SurfacePanel } from '../ui/CloudUI'
import { PublicFooter, PublicHeader, PublicPage, type PublicNavigate } from '../public/PublicChrome'

interface LandingPageProps {
  onNavigate: PublicNavigate
}

const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.22 },
  transition: { duration: 0.62, ease: [0.22, 1, 0.36, 1] as const },
}

function navigateAnchor(
  event: MouseEvent<HTMLAnchorElement>,
  path: string,
  onNavigate: PublicNavigate,
) {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) return
  event.preventDefault()
  onNavigate(path)
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <PublicPage className="landing-page">
      <PublicHeader onNavigate={onNavigate} />
      <Hero onNavigate={onNavigate} />
      <main className="landing-main">
        <OperatorSection />
        <CollaborationSection />
        <ControlPlaneSection />
        <ArchitectureSection />
        <PricingSection onNavigate={onNavigate} />
        <FinalCallToAction onNavigate={onNavigate} />
      </main>
      <PublicFooter onNavigate={onNavigate} />
    </PublicPage>
  )
}

function Hero({ onNavigate }: { onNavigate: PublicNavigate }) {
  return (
    <section className="landing-hero">
      <div className="landing-hero__shader">
        <NebulaBackground fade={0} variant="classic" palette="graphite" resolutionScale={0.58} />
      </div>
      <div aria-hidden="true" className="landing-hero__veil" />
      <div className="landing-hero__grid">
        <motion.div
          className="landing-hero__copy"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="landing-eyebrow">
            <span />
            A persistent computer for every operator
          </p>
          <h1>AI operators with a computer of their own.</h1>
          <p className="landing-hero__lede">
            Give every operator a private Linux workspace, intelligence, tools,
            and memory. Manage access, usage, and cost from one control plane.
          </p>
          <div className="landing-hero__actions">
            <ActionLink
              href="/app"
              onClick={event => navigateAnchor(event, '/app', onNavigate)}
              tone="primary"
              size="lg"
            >
              Try Nebula
              <ArrowRight size={15} />
            </ActionLink>
            <ActionLink href="#operator" tone="secondary" size="lg">
              See the system
            </ActionLink>
          </div>
        </motion.div>
        <OperatorOrbit />
      </div>
      <ProofStrip />
    </section>
  )
}

function OperatorOrbit() {
  return (
    <motion.div
      className="operator-orbit"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
    >
      <div aria-hidden="true" className="operator-orbit__ring operator-orbit__ring--one" />
      <div aria-hidden="true" className="operator-orbit__ring operator-orbit__ring--two" />
      <div aria-hidden="true" className="operator-orbit__line operator-orbit__line--left" />
      <div aria-hidden="true" className="operator-orbit__line operator-orbit__line--right" />

      <OrbitNode className="operator-orbit__node--chat" icon={<MessagesSquare size={15} />} label="Chat" detail="Delegate" />
      <OrbitNode className="operator-orbit__node--console" icon={<Terminal size={15} />} label="Console" detail="Take over" />
      <OrbitNode className="operator-orbit__node--cloud" icon={<Building2 size={15} />} label="Cloud" detail="Govern" />

      <div className="operator-orbit__core">
        <div className="operator-orbit__brand">
          <NebulaMark size={28} />
          <span className="nebula-wordmark">Nebula</span>
        </div>
        <div className="operator-orbit__identity">
          <IconFrame size="lg" tone="blue"><Bot size={18} /></IconFrame>
          <div>
            <strong>Release operator</strong>
            <span>Private Linux workspace</span>
          </div>
        </div>
        <div className="operator-orbit__terminal">
          <span><i>$</i> inspect failed rollout</span>
          <span className="operator-orbit__terminal-muted">Reading deployment state…</span>
          <span><b>✓</b> repaired secret and verified replicas</span>
        </div>
        <div className="operator-orbit__status">
          <span><CircleDot size={11} /> Working</span>
          <code>4 GB peak · 5 GB home</code>
        </div>
      </div>
    </motion.div>
  )
}

function OrbitNode({
  className,
  icon,
  label,
  detail,
}: {
  className: string
  icon: ReactNode
  label: string
  detail: string
}) {
  return (
    <div className={`operator-orbit__node ${className}`}>
      <IconFrame size="md">{icon}</IconFrame>
      <span><strong>{label}</strong><small>{detail}</small></span>
    </div>
  )
}

function ProofStrip() {
  const items = [
    { value: 'Linux home', label: 'Persistent files and installed tools', icon: HardDrive },
    { value: 'Chat + Console', label: 'Delegate or work in the same environment', icon: Terminal },
    { value: 'One control plane', label: 'Usage, access, sharing, and cost', icon: Gauge },
  ]
  return (
    <div className="proof-strip">
      {items.map(item => {
        const Icon = item.icon
        return (
          <div key={item.value} className="proof-strip__item">
            <Icon size={15} />
            <span><strong>{item.value}</strong><small>{item.label}</small></span>
          </div>
        )
      })}
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: ReactNode
  children: ReactNode
}) {
  return (
    <motion.div className="section-heading" {...reveal}>
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      <div>{children}</div>
    </motion.div>
  )
}

function OperatorSection() {
  const capabilities = [
    { icon: Sparkles, title: 'Intelligence', text: 'Connect model subscriptions through OAuth or use provider API keys.' },
    { icon: Terminal, title: 'Tools', text: 'Run Bash, edit files, browse, fetch, and extend the operator through MCP.' },
    { icon: Database, title: 'Memory', text: 'Keep sessions, local context, installed capabilities, and project history.' },
    { icon: HardDrive, title: 'Storage', text: 'Mount a persistent home that survives compute replacement and restarts.' },
    { icon: Wifi, title: 'Internet', text: 'Reach the services and resources the task requires under explicit policy.' },
    { icon: LockKeyhole, title: 'Permissions', text: 'Choose full access, default policy, or a workspace-confined sandbox.' },
  ]

  return (
    <section id="operator" className="landing-section operator-section">
      <SectionHeading
        eyebrow="Anatomy of an operator"
        title={<>Not a chat window.<br />A durable working environment.</>}
      >
        Nebula pairs an agent runtime with the computer around it. The operator
        can install what a task needs, retain its workspace, and continue where
        the last session stopped.
      </SectionHeading>
      <motion.div className="operator-anatomy" {...reveal}>
        <div className="operator-anatomy__rail">
          <span>Operator / 01</span>
          <code>online</code>
        </div>
        <div className="operator-anatomy__body">
          <div className="operator-anatomy__center">
            <IconFrame size="lg" tone="blue"><Bot size={19} /></IconFrame>
            <p>One identity</p>
            <h3>Its own computer.<br />Its own context.</h3>
            <span>Persistent across every conversation.</span>
          </div>
          <div className="operator-anatomy__capabilities">
            {capabilities.map(capability => {
              const Icon = capability.icon
              return (
                <article key={capability.title}>
                  <IconFrame size="md"><Icon size={15} /></IconFrame>
                  <div>
                    <h3>{capability.title}</h3>
                    <p>{capability.text}</p>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </motion.div>
    </section>
  )
}

function CollaborationSection() {
  return (
    <section id="collaboration" className="landing-section collaboration-section">
      <SectionHeading
        eyebrow="One computer, two collaborators"
        title={<>Delegate in Chat.<br />Take over in Console.</>}
      >
        The agent and the human never drift into separate environments. Both
        work against the same files, processes, installed packages, and project
        state.
      </SectionHeading>
      <motion.div className="collaboration-stage" {...reveal}>
        <div className="collaboration-stage__tabs">
          <span className="is-active"><MessagesSquare size={14} /> Chat</span>
          <span><Terminal size={14} /> Console</span>
          <code>workspace / release-monitor</code>
        </div>
        <div className="collaboration-stage__body">
          <div className="chat-demo">
            <div className="chat-demo__message chat-demo__message--human">
              Review the failed deployment and get it healthy.
            </div>
            <div className="chat-demo__operator">
              <IconFrame size="md" tone="blue"><NebulaMark size={17} /></IconFrame>
              <div>
                <span className="chat-demo__thinking">Working across the deployment</span>
                <div className="chat-demo__tool"><Terminal size={13} /> Bash(kubectl get pods --all-namespaces)</div>
                <p>I found an expired registry secret, refreshed it, and verified every replica reached a healthy state.</p>
              </div>
            </div>
          </div>
          <div className="console-demo">
            <div className="console-demo__title">
              <span><i /> operator@nebula</span>
              <code>live PTY</code>
            </div>
            <pre>
              <span className="console-demo__prompt">$</span> kubectl get deploy release-api{'\n'}
              NAME          READY   UP-TO-DATE   AVAILABLE{'\n'}
              release-api   6/6     6            6{'\n\n'}
              <span className="console-demo__prompt">$</span> git status --short{'\n'}
              <span className="console-demo__success">✓ clean workspace</span>
            </pre>
            <div className="console-demo__handoff"><Users size={13} /> Human and operator share this exact environment</div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}

function ControlPlaneSection() {
  const points = [
    { icon: Users, title: 'Shared capabilities', text: 'Publish agents, skills, MCPs, hooks, and rules across the organization.' },
    { icon: KeyRound, title: 'Controlled access', text: 'Tie every workspace to an authenticated member and organization.' },
    { icon: Gauge, title: 'Usage and cost', text: 'See operator activity, resource allocation, and spend from one dashboard.' },
  ]
  return (
    <section id="control" className="control-section">
      <div className="landing-section control-section__inner">
        <SectionHeading
          eyebrow="The control plane"
          title={<>Many operators.<br />One place in control.</>}
        >
          Each person gets an isolated Nebula operator. The organization gets a
          coherent layer for identity, governance, shared capabilities, and
          infrastructure.
        </SectionHeading>
        <motion.div className="control-blueprint" {...reveal}>
          <div className="control-blueprint__top">
            <BrandMetric icon={<Building2 size={16} />} label="Organization" value="Nebula" />
            <BrandMetric icon={<Bot size={16} />} label="Operators" value="24 active" />
            <BrandMetric icon={<Gauge size={16} />} label="Monthly usage" value="$418" />
          </div>
          <div className="control-blueprint__chart">
            <div className="control-blueprint__chart-heading">
              <span>Fleet activity</span><code>last 7 days</code>
            </div>
            <div className="control-blueprint__bars" aria-label="Illustrative operator activity chart">
              {[36, 58, 46, 72, 64, 82, 70, 86, 60, 76, 92, 80].map((height, index) => (
                <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
          <div className="control-blueprint__list">
            {['Release operator', 'Support specialist', 'Invoice auditor'].map((name, index) => (
              <div key={name}>
                <span className={`control-blueprint__avatar control-blueprint__avatar--${index + 1}`} />
                <strong>{name}</strong>
                <small>{['Engineering', 'Customer success', 'Finance'][index]}</small>
                <code>{index === 1 ? 'Ready' : 'Working'}</code>
              </div>
            ))}
          </div>
        </motion.div>
        <div className="control-points">
          {points.map(point => {
            const Icon = point.icon
            return (
              <article key={point.title}>
                <Icon size={17} />
                <h3>{point.title}</h3>
                <p>{point.text}</p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function BrandMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="brand-metric">
      <IconFrame size="md">{icon}</IconFrame>
      <span><small>{label}</small><strong>{value}</strong></span>
    </div>
  )
}

function ArchitectureSection() {
  return (
    <section id="architecture" className="landing-section architecture-section">
      <SectionHeading
        eyebrow="One core, two ways to run"
        title={<>Standalone by default.<br />Managed when you need it.</>}
      >
        Nebula Core remains a complete organization-neutral binary. Cloud adds
        identity, infrastructure, storage, governance, and billing around it
        without putting business logic into the agent.
      </SectionHeading>
      <motion.div className="architecture-map" {...reveal}>
        <div className="architecture-map__core">
          <IconFrame size="lg" tone="blue"><NebulaMark size={21} /></IconFrame>
          <div><span>Runtime core</span><strong>Nebula</strong><small>&lt;30 MB standalone binary</small></div>
        </div>
        <div className="architecture-map__connector">
          <span />
          <code>organization-neutral API</code>
          <span />
        </div>
        <div className="architecture-map__paths">
          <ArchitecturePath
            icon={<Terminal size={18} />}
            eyebrow="Standalone"
            title="Run nebula"
            command="$ ./nebula"
            text="Use the built-in TUI directly in the current project, or start --serve for the standalone Web application."
          />
          <ArchitecturePath
            icon={<Cloud size={18} />}
            eyebrow="Managed"
            title="Run Nebula Cloud"
            command="$ nebula --serve"
            text="The worker starts the same runtime inside a persistent operator workspace while Cloud manages the surrounding organization."
          />
        </div>
      </motion.div>
    </section>
  )
}

function ArchitecturePath({
  icon,
  eyebrow,
  title,
  command,
  text,
}: {
  icon: ReactNode
  eyebrow: string
  title: string
  command: string
  text: string
}) {
  return (
    <SurfacePanel level={1} className="architecture-path">
      <div className="architecture-path__top">
        <IconFrame size="md">{icon}</IconFrame>
        <span>{eyebrow}</span>
      </div>
      <h3>{title}</h3>
      <code>{command}</code>
      <p>{text}</p>
    </SurfacePanel>
  )
}

interface PricingPlan {
  name: string
  audience: string
  price: string
  detail: string | null
  description: string
  inherits: string
  featured?: boolean
  features: string[]
}

const pricingPlans: PricingPlan[] = [
  {
    name: 'Individual',
    audience: 'For one person',
    price: '9',
    detail: null,
    description: 'Your first persistent AI operator, with a private managed Linux workspace.',
    inherits: 'Included',
    features: ['1 deployed operator', 'Persistent Linux home and Console', 'Skills, MCPs, hooks, and web fetch'],
  },
  {
    name: 'Team',
    audience: 'For small teams',
    price: '10',
    detail: '+ $5 per operator',
    description: 'Deploy up to 15 operators and equip them from one shared organization library.',
    inherits: 'Everything in Individual, plus',
    features: ['$5 per deployed operator', 'Shared agent templates and capabilities', 'Usage and cost dashboard'],
  },
  {
    name: 'Business',
    audience: 'For organizations',
    price: '99',
    detail: '+ $10 per operator after 15',
    description: 'Governed operator access and visibility as Nebula expands across departments.',
    inherits: 'Everything in Team, plus',
    featured: true,
    features: ['15 deployed operators included', '$10 per additional operator', 'Roles and artifact permissions', 'Audit history and budget controls', 'SSO and priority support'],
  },
  {
    name: 'Enterprise',
    audience: 'For enterprises',
    price: '999',
    detail: '+ $15 per operator after 100',
    description: 'Dedicated capacity and hands-on operations for business-critical AI workforces.',
    inherits: 'Everything in Business, plus',
    features: ['100 deployed operators included', '$15 per additional operator', 'Dedicated worker capacity', 'Advanced security policies', 'Provisioning and migration support'],
  },
]

function PricingSection({ onNavigate }: { onNavigate: PublicNavigate }) {
  return (
    <section id="pricing" className="landing-section pricing-section">
      <SectionHeading
        eyebrow="Straightforward pricing"
        title={<>Pay for each operator.<br />Bring your own intelligence.</>}
      >
        Every operator includes a managed Linux workspace, persistent home,
        Console access, automatic runtime updates, and encrypted storage.
      </SectionHeading>
      <motion.div className="pricing-grid" {...reveal}>
        {pricingPlans.map(plan => (
          <article key={plan.name} className={`pricing-card ${plan.featured ? 'pricing-card--featured' : ''}`}>
            <div className="pricing-card__heading">
              <span>{plan.audience}</span>
              {plan.featured && <code>Most popular</code>}
            </div>
            <h3>{plan.name}</h3>
            <div className="pricing-card__price"><sup>$</sup><strong>{plan.price}</strong><span>/ month</span></div>
            <p className={`pricing-card__detail ${plan.detail ? '' : 'is-empty'}`}>{plan.detail || 'Operator pricing'}</p>
            <p className="pricing-card__description">{plan.description}</p>
            <div className="pricing-card__rule" />
            <span className="pricing-card__inherits">{plan.inherits}</span>
            <ul>
              {plan.features.map(feature => <li key={feature}><Check size={13} />{feature}</li>)}
            </ul>
            <ActionLink
              href="/app"
              onClick={event => navigateAnchor(event, '/app', onNavigate)}
              tone={plan.featured ? 'primary' : 'secondary'}
              size="md"
              className="mt-auto w-full"
            >
              Choose {plan.name}
            </ActionLink>
          </article>
        ))}
      </motion.div>
      <div className="pricing-note">
        <Network size={16} />
        <p><strong>Use subscriptions you already have—even on Individual.</strong> Connect Codex, OpenCode Go, and other supported plans through OAuth, or bring provider API keys. Model and API charges are not included, and Nebula adds no token markup.</p>
        <span>USD · taxes excluded</span>
      </div>
    </section>
  )
}

function FinalCallToAction({ onNavigate }: { onNavigate: PublicNavigate }) {
  return (
    <section className="landing-section final-cta">
      <motion.div {...reveal}>
        <p>From one operator to an AI workforce</p>
        <h2>Give the work a computer.<br />Keep the company in control.</h2>
        <ActionLink
          href="/app"
          onClick={event => navigateAnchor(event, '/app', onNavigate)}
          tone="primary"
          size="lg"
        >
          Try Nebula
          <ArrowRight size={15} />
        </ActionLink>
      </motion.div>
    </section>
  )
}
