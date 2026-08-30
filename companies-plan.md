# Nubols founder-led company outreach plan

**Research date:** 29 August 2026
**Goal:** book qualified problem-discovery calls and private, synthetic-data
demos for Nubols. This is not yet a paid-beta sales campaign.

## 1. The decision

Start with **small AI-native software agencies and product consultancies** in
Spain, the UK, and nearby European time zones. Add a smaller comparison group
of early-stage SaaS teams that explicitly use coding agents.

This is the initial hypothesis:

> Teams already using Codex, Claude Code, Cursor, or similar agents lose time
> recreating environments, keeping long-running work alive, inspecting what an
> agent changed, and handing the exact environment to another person. Nubols
> gives every team member a persistent, inspectable Linux Operator where Chat,
> Console, files, processes, and explicitly published services share one state.

Do not lead with “cloud computer,” containers, Docker, Firecracker, model count,
or infrastructure architecture. Start with one or two friendly questions about
something that may already have annoyed them:

- “Have you ever needed an agent to start a database or API, but had no spare
  server where it could stay running?”
- “Have you ever hesitated to let an agent work autonomously because it could
  touch unrelated files, credentials, or processes on your own computer?”
- “Have you ever wanted an agent to keep checking pull requests, webhooks,
  messages, or a recurring task without leaving somebody's laptop open?”
- “Do Codex, Claude Code, OpenCode, plus the builds, tests, browsers, and
  databases they start ever consume enough RAM or CPU to slow down your actual
  computer?”
- “Have you wanted to give an agent a simple weekly, biweekly, or monthly job
  without maintaining a separate server and scheduler?”
- “Has somebody ever inherited an agent task and then spent longer rebuilding
  the environment than understanding the work?”
- “Have you ever wanted to inspect the exact process and terminal behind an
  agent's answer instead of trusting a summary in the chat?”

Then connect only the pain they recognize to the outcome:

> Start an agent task, leave it running in a real environment, take over the
> exact same environment from the terminal, and hand it back without rebuilding
> context.

The networking claim must be precise. Nubols does not reveal the workspace's
private container IP. A process listens on a local port inside the Operator;
`nubols expose` publishes it through a managed HTTP URL or an allocated TCP
hostname and port. The user can list and revoke those routes.

### Why agencies first

- They repeatedly switch among client repositories, dependencies, and services.
- They have handoffs among founders, engineers, contractors, and clients.
- They already understand the value of coding agents, so the conversation does
  not begin with AI education.
- A founder or technical director can test a workflow without a long procurement
  chain.
- One agency interview exposes several projects and may reveal a repeatable use
  case faster than one ordinary SaaS team.

### Who is not a first-wave prospect

- Large regulated enterprises with procurement, SSO, on-premise, or formal-SLA
  requirements.
- Teams that only use Copilot-style autocomplete and have no autonomous or
  terminal-based workflow.
- Solo contractors unless they operate through a limited company and have a
  recurring multi-project handoff problem.
- Direct workspace/sandbox competitors such as E2B, Daytona, Coder, Gitpod,
  Ona, Replit, or Modal. They may be useful expert interviews later, but they
  are not unbiased first customers.
- Anyone expecting production credentials, private repositories, personal data,
  or public self-service access during validation.

## 2. Outreach is gated by law and product truth

This section is operational caution, not legal advice.

Spain's LSSI article 21 generally prohibits unsolicited promotional email unless
it was requested/expressly authorized or falls under the prior-customer exception.
It does not provide a broad B2B cold-email exemption. The official text is at
[BOE, Ley 34/2002, article 21](https://boe.es/buscar/act.php?id=BOE-A-2002-13758#art21).

Not being incorporated and not asking for money do **not automatically** make a
message non-promotional. The LSSI definition covers direct or indirect promotion
of the image, goods, or services of a company, organization, **or person** carrying
out commercial, industrial, craft, or professional activity. A pre-launch email
that describes Nubols, explains its benefits, offers a demo, and identifies
possible future users can therefore still look like a commercial communication
even if no sale is offered.

UK rules are different: the ICO says unsolicited B2B email can be sent to
corporate subscribers without PECR consent, but the sender must identify itself,
provide a valid opt-out route, comply with UK GDPR when using a named person's
data, and treat sole traders and some partnerships as individuals. See the
[ICO B2B marketing guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/).

There is a genuine-research distinction, but it is narrow. The ICO says genuine
market research is not direct marketing when research is the only purpose. If
the message contains promotional material, generates leads, or gathers details
for later marketing, it becomes direct marketing; calling it “research” does not
change that. See the
[ICO electronic-marketing guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/).

In practical terms:

- A neutral request to understand how teams currently run agents, with no
  product pitch, demo, mailing-list addition, or later sales use, is much closer
  to genuine research.
- “I built Nubols to solve these problems; can I show you a demo?” has a mixed
  research and product-promotion purpose and should not be assumed exempt.
- If someone first agrees to a research conversation and then explicitly asks
  to see Nubols or receive beta updates, the later communication is solicited
  and easier to handle cleanly.
- The legal classification depends on purpose, content, recipient, sender, and
  jurisdiction—not on whether Nubols has already incorporated or charged money.

Because Jorge will send from Spain, **do not infer that targeting a UK company
automatically removes the Spanish-law issue**. Before sending the first campaign,
obtain a short written review from a Spanish lawyer or qualified privacy adviser
covering LSSI, GDPR article 14 notice, the sender's pre-incorporation status, and
the target jurisdictions.

Until that review is complete:

- research organizations and public contact routes;
- request introductions from people already known;
- speak at meetups or respond to public requests for tools/interviews;
- prepare personalized drafts without sending them;
- use the public Contact Sales form only when the organization clearly invites
  relevant partnership or business proposals;
- do not disguise a Nubols pitch as neutral research—product-discovery outreach
  can still be marketing.

Before any outreach, the real privacy notice must explain prospect-data use and
the suppression list. Never buy a list, infer private email addresses, use
tracking pixels, or continue after an objection. Store an opt-out as a
suppression record instead of deleting it and accidentally contacting the person
again.

## 3. Who to contact

Contact one person per organization, in this order:

1. Founder who still ships code.
2. CTO or technical co-founder.
3. Head of Engineering at a team below roughly 50 people.
4. Delivery/AI lead at a boutique agency.
5. A generic `hello@`, `contact@`, or partnership form only when no relevant
   named business contact is publicly offered.

Do not contact sales, HR, a generic developer, or several people at the same
company simultaneously. The likely buyer is the person who owns delivery speed,
environment risk, and engineering workflow—not a procurement department.

For every prospect, record the exact public evidence that justified contact.
One sentence in the email must make that evidence visible. If that sentence
could be pasted into an email to ten other companies, the research is not done.

## 4. Ranked prospect list

Scores are hypotheses, not claims that the company has Nubols' problem.

- **A:** contact in the first ten; explicit coding-agent use or an unusually
  strong multi-project environment/handoff fit.
- **B:** second wave; strong agent-development or consultancy fit but less direct
  evidence of the internal coding workflow.
- **C:** comparison interview or possible channel relationship; useful learning,
  but more likely to have an existing infrastructure opinion or be adjacent to
  Nubols.

### Wave A — the first ten

| # | Organization | Market / type | Public evidence and why it fits | Write to | First-email angle |
|---:|---|---|---|---|---|
| 1 | [The AI Dev Agency](https://www.theaidevagency.com/) | London; founder-led AI software agency | Says it builds with Claude Code, handles white-label agency delivery, and publicly names founder Simon Filtness. This is the cleanest multi-client, agent-native fit. | Simon Filtness, founder, through the public business email | Ask how he isolates and resumes several Claude Code client environments and hands work to collaborators. |
| 2 | [Alteam](https://www.alteam.io/) | London/EU; product consultancy | A public role described Claude Code as part of the daily workflow and required candidates to explain where it breaks; the company works with AI-native delivery teams. | Technical founder/partner | Reference the daily-Claude-Code hiring language and ask about handoff across client teams. |
| 3 | [FastTech Consulting](https://fasttech.consulting/) | Barcelona; boutique AI consultancy | Ships agentic systems, context engineering, AI product work, and delivery improvements. It is local, senior, and reachable. | Founder or AI delivery lead through the public work email | Ask whether persistent, inspectable Operators would reduce environment/context setup during one-week MVP delivery. |
| 4 | [Seventy3](https://seventythree.ai/) | Barcelona; boutique AI-agent studio | Builds on each client's cloud/model/data/CI stack and hands systems back to client teams. That creates a concrete cross-stack handoff hypothesis. | Founder/technical lead at the published `hello@` route | Ask how they reproduce client environments and transfer an agent's live work without losing state. |
| 5 | [YGO.ai](https://ygo.ai/) | Berlin; AI travel infrastructure, 11–50 | A recent engineering role made Claude Code mandatory and described a Go monorepo, PostgreSQL, Redis, Docker Compose, and end-to-end ownership. | CTO or engineering lead | Ask about giving a small AI-native team persistent remote environments that mirror its multi-service stack. |
| 6 | [Topliner](https://topliner.app/) | Amsterdam; early B2B SaaS, 1–10 | A founding-engineer role explicitly sought someone who “lives in Cursor or Claude Code,” loves the terminal, and deploys end to end. | Founder/CTO; public profile lists founder Arsen Ibragimov | Ask how a tiny team preserves context and reviews agent work when every engineer owns the full stack. |
| 7 | [annwn](https://annwn.ai/) | London; agentic sustainability startup, 1–10 | A founding-engineer role explicitly requires Codex/Claude Code and trusted agentic workflows over messy real-world data. | Founder/CPO | Ask whether a persistent workspace plus direct Console takeover would improve inspection of long-running data/agent experiments. |
| 8 | [BauGPT](https://baugpt.com/en) | Munich; AI construction SaaS, 11–50 | A recent role required advanced Claude Code use beyond autocomplete, including multi-step delegation and custom tooling; a founder also publicly documents internal agent use. | Founder or engineering lead | Reference its advanced agent workflow and ask where local environment continuity or human takeover still breaks. |
| 9 | [Antai Ventures](https://www.antaiventures.com/) | Barcelona; venture studio | A recent Barcelona role said AI coding agents are used daily across research, specs, implementation, review, and debugging. A studio repeats this workflow across ventures. | Venture-building CTO / technical partner | Ask about a repeatable Operator template per venture—not a generic developer seat. |
| 10 | [Wonder Apps](https://www.wonderapps.co.uk/) | UK; AI application agency | Builds and ships bespoke LLM products and SaaS across a modern multi-provider stack. It is a strong agency comparison even without explicit internal-agent evidence. | Founder or technical director | Ask how they keep agent-built environments inspectable and transferable from prototype through handoff. |

### Wave B — next ten agencies

| # | Organization | Market / type | Why it is worth qualifying | Write to |
|---:|---|---|---|---|
| 11 | [Reeb Labs](https://reeblabs.com/en/) | Barcelona; AI engineering lab | Production agents, integrations, data pipelines, and fast prototypes create repeated environment work. | Founder/technical lead |
| 12 | [Berlin AI Labs](https://berlinailabs.de/) | Berlin; boutique AI studio | Founder-led custom agent and enterprise-integration delivery; likely reachable and technical. | Yami Gopal, founder |
| 13 | [Algorythmos](https://algorythmos.com/) | Paris/Sydney; boutique AI consultancy | Agentic automation, document intelligence, SQL, and MLOps; useful data-workflow comparison. | Founder or senior engineering lead |
| 14 | [Klevere](https://www.klevere.ai/) | Netherlands; SMB AI-agent agency | Builds and operates custom agents for SMBs, which may expose repeatable environment and client-handoff pain. | Founder |
| 15 | [Asgardium Consulting](https://www.asgardiumconsulting.com/) | Valencia; AI engineering consultancy | Builds private LLM/RAG/agent systems and emphasizes deployment and data control. | Founder/technical director |
| 16 | [GJO](https://gjo.es/) | Spain; AI agency | Claims senior engineering and agents that run in clients' stacks around the clock. | Technical founder |
| 17 | [SapiensDataAI](https://www.sapiensdataai.com/) | Spain; boutique AI/automation consultancy | Named founder, small-company reachability, n8n/data/agent projects, and private VPS deployments. | Miguel Marín Pascual, founder |
| 18 | [Q2B Studio](https://q2bstudio.com/) | Madrid/Barcelona; custom software and AI | Multi-project software, cloud, AI, cybersecurity, and automation delivery; larger and less agent-native, but useful comparison. | CTO or AI practice lead |
| 19 | [Trencadís](https://trencadis.barcelona/) | Barcelona; custom AI/software studio | Designs and deploys custom agents and software for business workflows. | Technical/business founder through public business email |
| 20 | [Idesoftbcn](https://idesoftbcn.com/) | Barcelona; software and AI engineering | Long-running custom software shop now delivering AI agents; tests whether the pain exists outside AI-native boutiques. | Technical director |

### Wave C — channel and market-learning candidates

| # | Organization | Market / type | Why it is useful | Write to |
|---:|---|---|---|---|
| 21 | [Droogies AI](https://droogies-ai.com/) | EU; Claude Code agency | Builds Claude Code agents, MCP servers, and automation. Strong workflow expertise, but may already have a preferred stack. | Founder |
| 22 | [Genai Sapiens](https://www.genaisapiens.com/expertos-claude-code/) | Spain; Claude Code adoption consultancy | Helps Spanish engineering teams and agencies adopt Claude Code with specialized agents and controls. Potential expert/channel interview. | Technical founder/program lead |
| 23 | [Qlcube](https://qlcube.com/claude-code-empresas/) | Spain; enterprise Claude Code implementation | Runs repository pilots, compliance guardrails, and adoption work. More enterprise-oriented, useful for objections. | Claude Code practice lead |
| 24 | [LIS Data Solutions](https://www.lisdatasolutions.com/es/desarrollo-agentes-ia-claude-empresas/) | Spain; data/AI consultancy | Implements terminal/IDE agents and DevOps/repository integrations; useful security and governance interview. | AI engineering lead |
| 25 | [Hack'celeration](https://hackceleration.com/claude-code-agency/) | Europe; Claude Code agency | Publicly sells Claude Code application, refactor, testing, and integration work. | Founder/technical lead |
| 26 | [Impacter](https://impacter.tech/) | Amsterdam; AI automation company | Combines an agent platform with done-for-you implementation and EU hosting. Could reveal channel value or competitive overlap. | Product/technical founder |
| 27 | [Cloud First Consulting](https://cloudfirstconsulting.com/) | London; AI automation consultancy | Agent teams, MCP/A2A workflows, and self-hosted AI for SMBs. More infrastructure-aware and likely to raise useful objections. | Founder/technical director |
| 28 | [theagency47](https://theagency47.com/) | EU; boutique agent agency | English-first, founder-led, and focused on operating custom agents for SMBs. | Christos Papadimitriou, founder |
| 29 | [DG Virtual Agency](https://dgvirtualagency.eu/en/ai-agents) | EU; SME agent consultancy | Narrow, controlled workflow agents and human approval fit Nubols' governance story. | Founder |
| 30 | [NEXXAI Barcelona](https://nexxai.world/locations/barcelona/) | Barcelona; AI/software studio | Builds agents and custom software in English and Spanish; likely less founder-reachable, so keep for later. | Barcelona technical lead |

### Recommended first five

If only five messages can be prepared, choose:

1. The AI Dev Agency.
2. Alteam.
3. FastTech Consulting.
4. Seventy3.
5. YGO.ai.

This set produces a useful mix: one explicit Claude Code agency, one AI-native
delivery consultancy, two local boutique agent consultancies, and one small
product company with mandatory agent use. Do not send all five with the same
copy.

## 5. Research record required before writing

Create one row per organization with:

```text
organization
legal form / country
website
contact name and role
public business contact route
source URL and date checked
exact evidence of coding-agent or multi-project use
hypothesized last painful workflow
company segment
language
lawful-contact review status
first message date
follow-up dates
reply / objection / opt-out
call notes
pain evidence (1–5)
buyer and likely users
security blocker
next commitment and date
```

Never put private customer material, inferred private addresses, or unnecessary
personal details in this repository. The eventual operational tracker should be
private and access-controlled.

## 6. Sending identity and deliverability

Use:

```text
From: Jorge — Nubols <beta@nubols.com>
Reply-to: beta@nubols.com
```

Use Jorge's real full name and a real personal LinkedIn profile so the recipient
can verify who is contacting them. Identity builds trust; an employer's brand
must not be borrowed as implied endorsement.

Default introduction:

```text
I'm Jorge, a software engineer building Nubols independently in my spare time.
It isn't a company yet and I'm not selling anything—I am trying to find out
whether this is a real problem.
```

Do not name Marvell in the outreach body unless the outside project/invention
has been disclosed and any required conflict or ownership review has been
completed. If Marvell is eventually named, state the separation explicitly:

```text
I currently work as an engineer at Marvell Technology, and I'm building Nubols
independently in my spare time. Nubols is not affiliated with or endorsed by
Marvell.
```

Never send from a Marvell address, use its logo, contact its customers or
co-workers through the Marvell relationship, or use Marvell time, equipment,
code, information, or other resources for Nubols. Marvell's published Code says
outside activities can create conflicts and potential or actual conflicts must
be disclosed; internal employment, invention-assignment, and approval procedures
may be more specific. See the
[Marvell Code of Business Conduct and Ethics](https://www.marvell.com/content/dam/marvell/en/company/esg/marvell-code-of-business-conduct-and-ethics.pdf).

### LinkedIn or email

Prefer a warm introduction when one genuinely exists. Otherwise choose one
primary channel per person:

- **LinkedIn first** when the founder is active there, has posted about coding
  agents, or does not publish a business email. Send a very short connection
  note tied to the public signal; send the full question only after acceptance.
- **Email first** when the person or company publishes a business address for
  relevant technical/partnership inquiries. Email is better for the complete
  draft and easier for the recipient to forward to the CTO or engineering lead.
- Do not send the same long message through LinkedIn and email on the same day.
  That feels automated and invasive. If the chosen channel gets no response,
  use the normal close-the-loop sequence there and stop rather than surrounding
  the person across channels.

Suggested LinkedIn connection note:

```text
Hi [Name]—I saw [specific agent-workflow signal] at [Company]. I'm researching
where coding agents run once they need databases, background jobs, or a safe
machine separate from a developer's laptop. I would value your perspective.
```

The signature must be honest about current status:

```text
Jorge
Founder, Nubols (pre-launch validation)
https://nubols.com
```

Operational rules:

- SPF, DKIM, and DMARC must pass before outreach.
- Send manually as plain text from the real mailbox; no mass-mail tool at this
  volume.
- No attachment, calendar link, tracking pixel, read receipt, hidden image, or
  URL shortener in the first message.
- Begin with at most three carefully researched messages per day. Increase to
  five only after normal delivery and genuine replies; never “warm” the domain
  with fake conversations.
- One recipient per company and no CC chain.
- Two follow-ups maximum, then stop.
- A reply of “no,” “remove me,” or equivalent immediately creates a suppression
  record.
- Do not claim customers, production readiness, security certifications,
  benchmarks, availability, or launch dates that do not exist.

## 7. The first message

The tone should be one builder speaking to another. Avoid “environment
continuity,” “operating layer,” and other phrases that sound like a sales deck.
Use ordinary situations: a database that needs somewhere to run, an agent that
should not touch the founder's laptop, or a pull request that needs checking
while nobody is online.

The target length is **90–140 words**. Its structure is:

1. **Observed signal:** one true sentence showing why this person was selected.
2. **Friendly pain question:** ask about one or two situations, never a list of
   ten features.
3. **Concrete experiment:** explain Nubols in one plain sentence only after the
   question.
4. **Small ask:** 20 minutes to test the hypothesis, not “jump on a sales call.”
5. **Safety and autonomy:** synthetic data, no system access, easy opt-out.

### Founder draft v1 — discussion copy

This is the first full draft to edit before adapting it to each company. Replace
the opening line and choose the two or three questions most relevant to the
recipient; never send the bracketed placeholders.

**Subject:** Where do your coding agents actually live?

```text
Hi [Name],

I saw that [specific, real detail about how Company uses Codex, Claude Code,
OpenCode, Cursor, agents, or multi-project development], and I was curious how
you handle the less glamorous part of running coding agents.

Have you ever held an agent back because it could touch unrelated files or
credentials on your computer? Has running the agent—or the builds, tests,
browser, and databases it starts—slowed down the computer you still need for
everything else? Or have you needed an API, database, PR monitor, or scheduled
task to remain running and reachable after the laptop closes, with nowhere
simple to host it?

I'm Jorge, a software engineer building Nubols independently in my spare time.
It isn't a company yet and I'm not selling anything—I am trying to find out
whether this is a real problem.

Nubols gives your agents a dedicated Linux workspace; your laptop stays yours.
It remains available between sessions, a person can inspect or take over, and
services can stay running or be published through a controlled URL or TCP
endpoint.

Would you be open to 20 minutes? I can show the prototype in ten, then spend the
other ten hearing what is wrong or missing. The demo runs entirely on my server
with a fake project—I do not need access to any of your systems.

Even “we already solve this with [tool]” would be genuinely useful.

Jorge
Nubols — pre-launch product validation
[Personal LinkedIn URL]
```

Why this draft works:

- The subject creates curiosity while accurately describing the problem.
- The first line proves the recipient was selected intentionally.
- The questions are recognizable situations, not infrastructure terminology.
- “Prototype in ten, criticism for ten” creates a clear, low-effort exchange.
- Asking to hear the existing solution makes disagreement valuable and lowers
  pressure.

Likely edits after friendly-reviewer feedback:

- Reduce the three questions to two for each recipient.
- Decide whether “It isn't a company yet” creates useful honesty or unnecessary
  uncertainty; always retain “pre-launch” and “not selling anything.”
- Test “separate computer” against “persistent Linux workspace” in live
  conversations; prefer whichever prospects understand immediately.
- Do not include the website or a calendar link until the recipient asks or the
  final legally reviewed outreach version allows it.

### English template — agency

**Subject:** quick question about how you run agents at `[Company]`

```text
Hi [Name] — I saw that [specific public evidence, for example: your team uses
Claude Code for client builds].

Quick question: have you ever had an agent start a database or API and then
needed somewhere for it to keep running? Or had another person take over the
task and need to rebuild everything first?

I'm building Nubols to test that problem: the agent works in its own persistent
Linux computer, a person can open the same terminal, and a local service can get
a temporary URL or TCP endpoint when needed.

I'm not selling it yet. Would you be open to a 20-minute chat and small demo,
using only a fake project, to tell me whether this is a real problem for your
team or not?

If this is not relevant, tell me and I won't follow up.

Jorge
Founder, Nubols (pre-launch validation)
```

### English template — SaaS team

**Subject:** has this happened with your coding agents?

```text
Hi [Name] — I found [specific truthful evidence about Codex, Claude Code,
Cursor, terminal ownership, or the team's multi-service stack] at [Company].

Have you ever wanted an agent to keep working or checking something after you
closed your laptop? And have you ever worried about giving it broad access to
the same computer that has all your unrelated files and credentials?

I'm testing Nubols: the agent gets a separate persistent Linux computer that a
human can inspect and take over at any time. It can also react to scheduled jobs
or webhooks and keep a database/API running without using somebody's laptop.

I'm still validating it, not selling it. Could I show you a small synthetic
demo and hear how you handle those cases today? Twenty minutes, no access to
your code or systems.

If it is not relevant, I will not follow up.

Jorge
```

### Spanish template — Spain-based technical founder

**Asunto:** una pregunta rápida sobre cómo usáis agentes en `[Empresa]`

```text
Hola [Nombre]. He visto que en [Empresa] [señal pública concreta y verdadera].

Una pregunta: ¿alguna vez un agente ha necesitado levantar una base de datos o
una API y no teníais un servidor donde dejarla funcionando? ¿O habéis evitado
darle más autonomía porque trabaja en el mismo ordenador que vuestros archivos,
credenciales y procesos personales?

Estoy creando Nubols para probar justo eso: el agente tiene su propio ordenador
Linux persistente, una persona puede entrar en el mismo terminal y los servicios
locales pueden publicarse mediante una URL o un endpoint TCP controlado.

Todavía no lo estoy vendiendo. ¿Te apetecería ver una demo pequeña con un
proyecto falso y contarme si esto os pasa realmente? Serían 20 minutos y no
necesito acceso a ningún sistema vuestro. El producto está en inglés por ahora.

Si no encaja, dímelo y no insistiré.

Jorge
Fundador de Nubols (validación previa al lanzamiento)
```

### A research-only first contact

Use this version only if the purpose truly is research only. Do not include the
Nubols link, offer a demo, add the person to a beta list, or turn the response
into later marketing without new permission.

```text
Hi [Name] — I saw that [specific evidence] and I'm researching how small
technical teams actually run coding agents once they need a real terminal,
databases, or long-running processes.

Could I ask you a few questions about the last time your team used one this way?
I'm especially interested in what happens when the laptop closes, another person
needs to take over, or the agent needs to react to something later.

This is a 20-minute product-research conversation. I do not need access to your
code or systems, and I will not add you to a marketing list.

If it is not relevant, no problem—I will not follow up.

Jorge
```

If they agree, conduct the interview first. Ask separately during the call:
“Would it be useful if I showed you the prototype I am testing?” Do not treat a
research acceptance as blanket consent for future beta marketing.

### Pain-question bank

Choose at most two per message and match them to the public evidence:

- **No server:** “Has an agent ever started a database, API, dashboard, or game
  server that needed to remain reachable, but you had nowhere simple to run it?”
- **Laptop dependency:** “Have you ever needed to leave a laptop awake because
  the agent or its process had to keep running?”
- **Blast radius:** “Have you ever held back an agent because it could touch
  unrelated files, credentials, or processes on your computer?”
- **Human takeover:** “When an agent gets stuck, can someone open the exact same
  terminal and running process, or do they have to reconstruct what happened?”
- **Team handoff:** “Has a teammate ever inherited an agent task and spent more
  time rebuilding dependencies and context than continuing the task?”
- **Recurring work:** “Do you have an always-on place where agents can perform a
  scheduled check without depending on a developer's machine?”
- **GitHub events:** “Could an agent react to a pull request or CI webhook while
  the team is offline, then leave its work ready for review?”
- **Messages and mail:** “Would it help to let a narrowly configured agent check
  a Slack or mailbox through approved tools on a schedule?”
- **Preview before deployment:** “Have you wanted to show a client or teammate
  the API/site an agent just started before doing a real deployment?”
- **Machine pollution:** “Do repeated agent projects leave local dependencies,
  ports, and background processes all over developers' computers?”
- **Inspectability:** “Have you received a confident chat answer but still
  needed to inspect the actual files, logs, and process behind it?”
- **Parallel work:** “Can one person run several agent tasks without all of them
  fighting over the same local environment?”
- **RAM and CPU pressure:** “Does running Codex, Claude Code, or OpenCode—plus
  the builds, tests, browsers, and databases they launch—slow down the computer
  you still need for the rest of your work?”
- **Calendar jobs:** “Have you wanted to tell an agent ‘check this every Monday,’
  ‘run it every two weeks,’ or ‘prepare this report every month’ without setting
  up and maintaining another server?”

Map the answer accurately:

| Pain | Nubols proof | Do not overclaim |
|---|---|---|
| A database/API needs somewhere to run | Persistent Operator plus managed HTTP URL or allocated TCP endpoint | Do not say Nubols gives out the container's private IP or supports every protocol safely by default. |
| Concern about the agent touching the founder's computer | The agent works inside a separate, resource-limited workspace container | It can still modify/delete data inside its own workspace; backups and production-data guarantees are separate beta gates. |
| Work must continue after a laptop closes | Worker-owned persistent compute and sessions | Do not imply unlimited uptime or an SLA during validation. |
| Human must inspect/take over | Chat and Console share the exact workspace, files, and processes | Do not claim live multi-user collaborative terminal editing unless implemented. |
| PR/event automation | Webhook hooks can trigger an agent turn; interval/time hooks support recurring work | GitHub access still needs an approved integration/token and correct permissions. |
| Slack/email checks | Scheduled hooks can call configured tools/MCP/API integrations | Do not imply built-in Slack or mailbox access where it has not been configured. |
| Client preview | `nubols expose` publishes and later revokes a controlled route | Raw TCP has no Nubols token layer; the application should use its protocol-native authentication. |
| Agent workloads slow the person's computer | Agent execution, builds, tests, browsers, databases, and background processes run remotely inside a resource-limited Operator | Do not claim the CLI alone always uses excessive RAM or promise that every workload will be faster; the benefit is moving and bounding the workload. |
| Weekly, biweekly, or monthly autonomous work | Nebula currently supports interval hooks and a fixed daily time; persistent compute gives those hooks somewhere to run | `7d`/`14d` elapsed intervals are not durable calendar schedules, and monthly/calendar rules are not implemented yet. Do not promise “every Monday” or reliable monthly jobs until a durable scheduler exists. |

### Personalized opening lines for the first five

- **The AI Dev Agency:** “I saw that you run white-label client builds with
  Claude Code and document the actual delivery process, rather than only selling
  AI strategy.”
- **Alteam:** “Your engineering role says Claude Code is part of the daily
  workflow and asks candidates to explain where it breaks—that is exactly the
  operational layer I am researching.”
- **FastTech:** “Your context-engineering and one-week MVP work suggests your
  team repeatedly moves from a client problem to a live, inspectable agent
  environment under extreme time pressure.”
- **Seventy3:** “You build inside each client's cloud, model, data, and CI stack
  and then hand ownership back; I am researching the environment continuity
  behind that handoff.”
- **YGO.ai:** “Your recent backend role made Claude Code mandatory in a Go,
  PostgreSQL, Redis, and Docker Compose stack, which is a much stronger signal
  than a generic ‘we use AI’ claim.”

Do not copy the source's wording beyond the minimum needed to identify the
signal. Verify every statement again on the day of sending because job posts and
team details expire.

## 8. Follow-up sequence

### Day 0 — initial message

Send the personalized 90–140-word email.

### Day 3 or 4 — useful clarification

Do not write “just bumping this.” Add one concrete point:

```text
Hi [Name] — one thing I may have explained badly: Nubols is not another coding
model or IDE. It is a separate computer where the agent's files and processes
stay running, which a person can open and inspect at any time.

If your current setup already handles that well, “we already solved this” would
also be a genuinely useful answer and I will close the loop.
```

### Day 8 or 9 — close the loop

```text
I'll leave you alone after this note. I am trying to learn whether teams need a
separate, always-available computer for their agents, or whether their existing
local/cloud setup already does the job well enough.

If you would be open to a short demo/interview later, reply with “later” and I
will ask once after the beta is ready. Otherwise I will not contact you again.
```

No third follow-up. Do not manufacture urgency.

## 9. Ethical persuasion: what to use

These are communication principles, not tricks for bypassing judgment.

### In the email

- **Specificity:** concrete public evidence signals that the message is for them.
- **Pattern interruption without clickbait:** “tell me where the idea is wrong”
  is more credible than “revolutionize your workflow.”
- **Autonomy:** explicitly make “no” easy. People are more willing to engage
  when they do not feel trapped.
- **Low-friction commitment:** ask for 20 minutes and no account setup, data,
  purchase, or preparation.
- **Curiosity gap with substance:** name the operational problem, but leave the
  live persistence/handoff proof for the demo.
- **Honest vulnerability:** “pre-launch validation” and synthetic data reduce
  skepticism and invite expert criticism.
- **Identity consistency:** approach the recipient as a technical expert whose
  judgment matters, not as a lead in a funnel.

### In the presentation

- **Diagnosis before demonstration:** ask about the last real incident first.
  Their own story becomes the frame; do not tell them they have pain they did
  not report.
- **Contrast:** show the “before” state (a local session/environment that another
  person must recreate) and immediately show the same files/process in Nubols
  Chat and Console.
- **Concrete proof:** restart/reopen the Operator and show persistence. A visible
  file and running service are more persuasive than architecture slides.
- **Endowment through participation:** let the prospect choose one synthetic
  workflow or command. They should shape the demo without supplying real data.
- **Progressive disclosure:** show the useful outcome first; explain isolation,
  routing, and quotas only when relevant or asked.
- **Loss framing, grounded in their facts:** calculate the cost of repeated setup
  or failed handoffs only from numbers they provide. Never invent ROI.
- **Peak-end:** finish the live proof by opening a service URL or connecting to a
  TCP service, then revoke it. This creates a memorable final proof and also
  demonstrates control.
- **Commitment and consistency:** end by asking for one small next step tied to
  what they said, such as a second demo with a synthetic version of their
  workflow—not a vague “stay in touch.”

### Never use

- fake scarcity, countdowns, or “only two beta slots” unless a real hard
  capacity limit is explained accurately;
- invented customers, logos, quotes, waitlist size, security claims, or social
  proof;
- fear about job replacement;
- guilt, repeated unsolicited follow-ups, or contacting colleagues after an
  opt-out;
- a fake “research” identity that hides the commercial product;
- dark-pattern calendar links, prechecked consent, tracking pixels, or false
  “Re:” subject lines;
- a live failure disguised as a roadmap capability.

## 10. The 20-minute call

### Minutes 0–3 — diagnose

Ask:

1. “Tell me about the last task where an agent needed a real environment.”
2. “What happened when the session, machine, project, or person changed?”
3. “How did someone inspect or take over what the agent had done?”

If there is no concrete recent incident, do not force the demo narrative. Ask
what they already use and learn why it is sufficient.

### Minutes 3–12 — one proof, not a feature tour

Use a workflow matched to the segment:

- **Agency:** open a synthetic client project, install a dependency, start its
  API, move from Chat to Console, make a manual change, return to the agent, and
  reopen the same state.
- **SaaS:** give the agent a bug in a multi-service sample app, inspect the
  process/logs in Console, change one file manually, and let the agent continue.
- **Data/automation:** upload a synthetic CSV, install a package, generate an
  artifact, inspect it manually, and retain it across sessions.

Show `nubols expose`, the returned route, `nubols ps`, and `nubols stop` only at
the end and only if the core handoff proof already landed.

### Minutes 12–18 — interview

Ask:

- “Which part maps to a real workflow, if any?”
- “What would prevent you from using this?”
- “Which credentials, repositories, data, or networks could never enter it?”
- “Who would administer it, who would use it, and who would approve it?”
- “What do you spend today in engineering time or tools on this workflow?”

### Minutes 18–20 — next commitment

Choose one:

- No fit: thank them, record why, and stop.
- Weak fit: permission for one later update.
- Strong fit: book a second, workflow-specific synthetic demo with the technical
  decision-maker.
- Very strong fit: ask for a non-binding pilot-planning conversation after the
  legal entity and beta security gates exist.

Do not ask for money, credentials, private code, a production workload, or a
binding commitment during validation.

## 11. Demo presentation rules

- No more than one architecture slide, shown after the live proof.
- No pricing slide until a real buyer and current cost are understood.
- Do not show the dashboard as the opening scene. Start in the Operator doing
  work.
- Keep the synthetic project resettable and rehearse it twice from clean state.
- Narrate limitations plainly: one persistent container per member, controlled
  HTTP/TCP publication, no Docker-in-Docker, no production customer data, and no
  formal SLA during validation.
- If the demo fails, state what failed, switch to the recorded fallback only if
  available, and follow up with the actual cause. Do not bluff.
- The English-only product is acceptable for this technical first cohort. In a
  Spanish email, disclose that the interface/demo is currently English-only.

## 12. Two-week execution schedule

### Days 1–2 — prepare

- Obtain the outreach/privacy legal review; do not send before it is complete.
- Verify SPF, DKIM, DMARC, reply handling, and the sender identity for
  `beta@nubols.com`.
- Create the private tracker and suppression list.
- Re-verify the first ten organizations, their legal form, current contact, and
  public evidence.
- Rehearse the agency, SaaS, and data variants twice each.
- Get two friendly technical reviewers to challenge the 20-minute call.

### Days 3–5 — first wave

- Send three individually researched messages per day, only where legally
  cleared.
- Start with The AI Dev Agency, Alteam, FastTech, Seventy3, and YGO.ai.
- Record delivery, reply, objection, concrete pain, and next action.
- Change the message only after a repeated pattern, not one reaction.

### Days 6–9 — calls and second wave

- Run discovery first, then demo.
- Send the first follow-up where appropriate.
- Add Topliner, annwn, BauGPT, Antai Ventures, and Wonder Apps.
- Use warm introductions, founder communities, and relevant meetups alongside
  email; the plan needs ten calls, not merely thirty sent messages.

### Days 10–12 — workflow-specific proof

- Invite the strongest respondents to a second session using a synthetic version
  of their workflow.
- Ask the likely buyer/technical approver to attend.
- Record security blockers and current cost in their own words.

### Days 13–14 — decide

Evaluate:

- Did three organizations report the same recent, recurring problem?
- Did two commit to a concrete next step?
- Did one identify a buyer and plausible budget/current cost?
- Was the strongest segment agency, SaaS, or data/automation?
- Was persistence/handoff the pain, or did another repeated problem dominate?

If the gate fails, narrow the segment and run five more interviews. Do not hide
weak demand by sending more generic mail or building unrelated features.

## 13. Success metrics

The objective is evidence, not open rate. With no tracking pixels, measure:

```text
qualified organizations researched
messages legally cleared and sent
positive, neutral, negative, and opt-out replies
discovery calls completed
live demos completed
recent recurring incidents described
second sessions booked
buyer/budget identified
security blockers repeated
non-binding pilot-planning commitments
```

For the first 30 qualified organizations, a useful operational target is:

- at least 10 real conversations sourced across email, introductions, and
  communities;
- at least 5 live demos;
- at least 3 independently reported recurring incidents;
- at least 2 concrete next commitments;
- at least 1 identified buyer and plausible budget/current cost.

These are the existing validation gates, not promises about normal cold-email
conversion rates.

## 14. Source notes

The shortlist was built from public company pages and current public hiring
signals. Particularly strong evidence includes:

- The AI Dev Agency publicly says it builds with Claude Code and offers
  white-label delivery: [company site](https://www.theaidevagency.com/).
- FastTech publicly describes boutique agent, context-engineering, and 0-to-1
  delivery work: [company site](https://fasttech.consulting/).
- Seventy3 publicly describes client-stack builds and handoff to client teams:
  [company site](https://seventythree.ai/).
- YGO's current site describes its AI infrastructure and engineering context:
  [company site](https://ygo.ai/).
- annwn's public early-stage engineering listing describes Codex/Claude Code and
  trusted agentic workflows:
  [public role](https://wellfound.com/jobs/3880487-founding-fullstack-ai-engineer).
- Antai's public company site provides its venture-studio context:
  [company site](https://www.antaiventures.com/).

Public pages change. Re-check every source and recipient before sending.
