# Nebula pricing rationale

Research date: 18 July 2026. All amounts below exclude VAT unless stated otherwise.

## Executive conclusion

Nebula should **not charge per defined agent, per binary, or per server**.

An agent definition is configuration. It has almost no marginal infrastructure cost, and one roughly 30 MB runtime can host multiple agents. A customer creating its eleventh agent does not cause Nebula to provision another €99 of infrastructure—or necessarily any infrastructure at all. Pricing the current landing plans as “€99 for 10 agents” makes the price look arbitrary and invites the exact objection that exposed this problem.

The recommended model is hybrid:

1. A monthly organization/platform fee pays for the control plane, tenancy, updates, dashboard, artifact registry, security, and baseline hosting.
2. Active employee seats scale price with organizational adoption and the value of collaboration, permissions, and governance.
3. Nebula manages capacity, placement, and scaling internally. Public plans do not impose an artificial concurrent-run quota; dedicated capacity remains available when a customer needs guaranteed isolation or performance.
4. Model and API usage is never included. Customers connect their own provider accounts and pay those providers directly.

Agent definitions should be unlimited, subject only to a generous technical fair-use limit.

Customers never manage Kubernetes, servers, pods, or worker placement. Each employee sees the Nebula application and an OpenCode-like agent interface. The deployment model is an internal Nebula implementation detail.

## What actually creates cost

The 30 MB runtime is a major economic advantage, but binary RAM is not the entire cost of operating Nebula. The service still needs:

- Runtime hosts and, only at sufficient scale, an internal scheduler or Kubernetes cluster.
- The Nebula organization/account backend.
- PostgreSQL or equivalent durable metadata storage.
- Agent workspaces, backups, object storage, and transfer.
- Load balancing, public IPs, TLS, secrets, and networking.
- Logs, metrics, traces, alerting, and incident capacity.
- Spare capacity for node failure and rolling upgrades.
- Engineering, security work, customer support, payment fees, and company overhead.

The first eight items are infrastructure COGS. Engineering salaries and product development are mainly operating expenses; the gross profit has to fund them, but they should not be disguised as a per-agent hosting charge.

## Current Hetzner reference costs

Hetzner changed prices for new cloud orders and rescales on 15 June 2026. The current Germany/Finland prices include:

| Resource | Monthly price |
| --- | ---: |
| CAX11 shared ARM cloud | €5.99 |
| CAX21 shared ARM cloud | €10.49 |
| CAX31 shared ARM cloud | €20.99 |
| CAX41 shared ARM cloud | €40.99 |
| CCX13 dedicated vCPU cloud | €42.99 |
| CCX23 dedicated vCPU cloud | €85.99 |
| AX42-1 dedicated server | €97.30 plus €49 setup |
| Cloud primary IPv4 | €0.50 |
| Object Storage base, including 1 TB storage and 1 TB egress | €4.99 |
| LB11 load balancer | approximately €8 |

Sources:

- [Hetzner price adjustment, 15 June 2026](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- [Hetzner shared versus dedicated cloud resources](https://docs.hetzner.com/cloud/servers/faq/)
- [Hetzner cloud primary IP pricing](https://docs.hetzner.com/cloud/servers/primary-ips/overview/)
- [Hetzner Object Storage announcement and pricing](https://www.hetzner.com/pressroom/object-storage/)
- [Hetzner Kubernetes tutorial with LB11 estimate](https://community.hetzner.com/tutorials/install-kubernetes-cluster/)

The prices are useful cost inputs, not a proposed architecture. Production sizing still requires load tests of concurrent tool execution, workspace I/O, history storage, and failure recovery.

## What does 1 GB for one company cost?

Hetzner does not currently sell a 1 GB cloud instance. Its smallest current cost-optimized instance is the CAX11:

- 2 shared ARM vCPUs.
- 4 GB RAM.
- 40 GB local disk.
- €5.99 or $6.99 per month after the June 2026 adjustment.
- A primary IPv4 adds €0.50 or $0.60 per month; IPv6 is free.

The raw RAM arithmetic is therefore:

| Calculation | EUR | USD |
| --- | ---: | ---: |
| CAX11 price per 1 GB, excluding IP | €1.50 | $1.75 |
| CAX11 plus IPv4, divided by 4 GB | €1.62 | $1.90 |
| Three 1 GB company tenants after reserving 1 GB for the host OS | €2.16/company | $2.53/company |
| Entire dedicated 4 GB CAX11 for one company | €6.49/company | $7.59/company |

The €2.16/$2.53 figure is a more useful early-stage tenant estimate than a large Kubernetes cluster. Shared databases, backups, object storage, the account backend, and monitoring add several more euros per customer, but the total infrastructure cost can still remain in the **€5–10/customer/month** range for small companies.

### Do 30 Nebula programs fit in 1 GB?

The simple arithmetic says yes: 30 × 30 MB = 900 MB. That leaves only 124 MB, however, so 30 separate processes would not be a safe operational limit once allocators, libraries, file caches, sockets, child processes, and temporary peaks are included.

The more important point is that Nebula does not need 30 processes for 30 agents. If one runtime loads multiple agent definitions, the 30 MB base is paid once and each additional idle agent should add mainly configuration and history. A 1 GB company allocation may therefore hold dozens or hundreds of idle agent definitions.

The limit will normally be **simultaneous work**, not stored agents:

- Shell commands can launch memory-heavy compilers, package managers, and test suites.
- Browser and MCP tools can create subprocesses and network/file buffers.
- Several simultaneous runs compete for the two shared vCPUs even when RAM is available.
- Large repositories and histories create disk and page-cache pressure.

The product should therefore say “unlimited agents” without advertising an invented concurrent-run limit. Nebula should monitor aggregate RSS, CPU, and I/O, then automatically move a tenant to a larger allocation or worker when measured demand crosses an internal threshold.

## Deployment stages

### Stage 1: one or a few ordinary hosts

Do not start with Kubernetes.

- Run the central account/dashboard backend separately from the agent runtime if convenient.
- Run multiple companies on one 4 GB or 8 GB host using processes, Linux users, containers, and cgroup memory/CPU limits.
- Give each company a tenant ID, encrypted credentials, and an isolated workspace root.
- Keep one runtime per company when stronger process isolation is useful; each runtime can still hold all of that company's agents.
- Move a high-usage or higher-security customer onto a dedicated CAX11 for only €6.49/month including IPv4.

An illustrative lean platform could start with two CAX21 application/data hosts, one CAX11 runtime worker, Object Storage, and three IPv4 addresses:

| Component | Monthly cost |
| --- | ---: |
| 2 × CAX21 | €20.98 |
| 1 × CAX11 worker | €5.99 |
| Object Storage | €4.99 |
| 3 × IPv4 | €1.50 |
| Subtotal | **€33.46** |
| 25% operational reserve | **€8.37** |
| Illustrative starting total | **€41.83/month** |

This is not a complete high-availability design. It is the correct order of magnitude for validating the business before paying the operational complexity tax of Kubernetes.

### Stage 2: a worker pool and placement service

As usage grows, add ordinary worker VMs and let the Nebula backend place companies according to memory, CPU, region, and security requirements. A small internal scheduler plus systemd or Docker may remain sufficient for a long time.

### Stage 3: Kubernetes when it earns its complexity

Use Kubernetes internally when there are enough nodes and deployments that automated bin-packing, rollouts, rescheduling, autoscaling, and failure recovery save more engineering time than Kubernetes costs. The customer experience remains unchanged: employees see Nebula's UI, not pods or clusters.

The earlier €303 Kubernetes cluster is a plausible later-stage shared platform, not the starting cost of serving one company.

## Margin model

There are two useful margin views. The public prices are in USD; the Hetzner inputs above remain in EUR because that is how the infrastructure is billed. The small currency difference is immaterial for this first-pass model and should be handled explicitly in the financial model.

### Infrastructure margin

This compares representative subscription revenue only with plausible hosting infrastructure. Model/API usage is excluded:

| Customer | Revenue | Plausible hosting cost | Infrastructure margin |
| --- | ---: | ---: | ---: |
| Individual | $9 | $3–5 | **44.4–66.7%** |
| Five-person Team ($10 + 5 × $5) | $35 | $5–10 | **71.4–85.7%** |
| Fifteen-person Team ($10 + 15 × $5) | $85 | $6–15 | **82.4–92.9%** |
| 25-person Business ($99 + 10 × $10) | $199 | $10–25 | **87.4–95.0%** |
| Enterprise with 100 included operators | $999 | $50–100 | **90.0–95.0%** |

The ranges include an allocation for common database, storage, backup, and monitoring infrastructure; they are not just the 30 MB process.

### Contribution margin after service costs

Payment processing and human support matter much more than RAM. Until real usage data exists, the following are planning ranges rather than promises:

| Customer | Hosting | Payments | Support/operations | Total variable COGS | Contribution margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Individual at $9 | $3–5 | $0.30–0.50 | $0–1 | $3.30–6.50 | **27.8–63.3%** |
| Five-person Team at $35 | $5–10 | $1–2 | $3–8 | $9–20 | **42.9–74.3%** |
| Fifteen-person Team at $85 | $6–15 | $2–3 | $8–15 | $16–33 | **61.2–81.2%** |
| 25-person Business at $199 | $10–25 | $5–7 | $20–40 | $35–72 | **63.8–82.4%** |
| Enterprise at $999 | $50–100 | $25–30 | $100–200 | $175–330 | **67.0–82.5%** |

These support figures are assumptions. If Enterprise customers consume several engineering hours every month, the platform fee or support package may need to rise. If the product becomes genuinely self-serve, the upper end of each margin range becomes realistic.

The key result is that **RAM is not the primary margin risk**. Support, reliability commitments, security/compliance work, and unexpectedly heavy tool execution are the margin risks. Individual is intentionally a lower-margin, self-service acquisition tier.

## Evaluation of licensing units

### Per agent

Do not use this as the primary license.

Advantages:

- Easy to explain superficially.
- Revenue rises with the visible size of a fleet.

Problems:

- An agent is cheap configuration, not a scarce resource.
- It discourages experimentation, specialization, and reuse—the product behaviors Nebula wants.
- Customers can combine several responsibilities into one agent to avoid fees.
- The price is disconnected from both compute cost and company value.

### Per server or pod

Do not expose this as the normal SaaS license.

Advantages:

- Closely tracks dedicated infrastructure.
- Appropriate as an enterprise add-on for isolated capacity.

Problems:

- Customers are buying an agent platform, not virtual machines.
- Multi-tenant pooling makes the mapping artificial.
- It turns the 30 MB efficiency advantage into a reason to charge less without capturing platform value.
- It makes pricing depend on an implementation detail that may change.

### Per employee seat

Use this as the main growth unit, but bill only active operators.

Advantages:

- Familiar to business buyers and procurement teams.
- Revenue grows as Nebula spreads across teams.
- Maps directly to collaboration, sharing, permissions, audit logs, and centralized administration.
- Predictable for both Nebula and the customer.

Problems:

- Autonomous and event-triggered agents can create value without a human logged in.
- Charging every invited viewer discourages company-wide visibility.
- Seat-only pricing does not protect Nebula from one customer running extreme workloads.

The solution is to make viewers free, monitor resource use internally, and sell dedicated capacity only when sustained workloads require it. Ordinary customers should not have to reason about concurrency slots.

An **active operator** should mean a user who, during the billing month, does at least one of the following:

- Starts or interacts with an agent run.
- Creates or edits an agent, skill, MCP connection, hook, or shared artifact.
- Administers organization policy, credentials, budgets, or members.

People who only receive Slack/email/Telegram output or view a shared dashboard should not require a paid seat. Service accounts and scheduled triggers should not be turned into fake employee seats; their resource use is handled by Nebula's internal placement and scaling.

## Market anchors

Seat licensing is normal for collaborative AI software:

- ChatGPT Business is generally $25 per user/month when billed monthly or $20 annually and includes model access. [Official OpenAI explanation](https://help.openai.com/en/articles/8792828-what-is-chatgpt-team/)
- Cursor Teams is $40 per active user/month and includes model usage pools plus administration. [Official Cursor pricing documentation](https://docs.cursor.com/account/pricing)
- Microsoft Copilot Studio also offers tenant-wide consumption packs, historically $200 for 25,000 messages, showing that autonomous agents require a usage guardrail in addition to human licensing. [Official Microsoft pricing](https://www.microsoft.com/en-us/microsoft-365/copilot/pricing/copilot-studio)

Nebula does not include model usage, so its seat price should be materially lower than products that bundle inference. Its organization fee can separately capture the value of the managed control plane.

## Recommended public pricing

### Individual

- **$9/month** for one active operator.
- Unlimited personal agent definitions.
- Hooks, skills, MCPs, web fetch, provider API keys, and supported OAuth subscriptions such as Codex and OpenCode Go.
- Fully managed shared hosting with no customer-visible concurrency quota.
- Community/self-service support.

### Team

- **$10 per organization/month**.
- **$5 per active operator/month**.
- Available for teams of up to 15 active operators.
- Includes unlimited agent definitions, shared artifacts, the organization dashboard, and standard support.
- Example totals: **$35/month for five operators** and **$85/month for fifteen operators**.

### Business

- **$99 per organization/month, including 15 active operators**.
- **$10 per additional active operator/month** beyond the included 15.
- Intended for organizations with 16–100 active operators or teams that need stronger governance.
- Includes unlimited agent definitions, RBAC, audit history, budget controls, SSO, and priority support.
- Example totals: **$199/month for 25 operators**, **$449/month for 50**, and **$949/month for 100**.

### Enterprise

- **$999 per organization/month, including 100 active operators**.
- **$15 per additional active operator/month** beyond the included 100.
- Intended for organizations with more than 100 active operators or contractual infrastructure and support requirements.
- Includes unlimited agent definitions, advanced policies, provisioning, priority migration, dedicated capacity, SLA options, and enterprise support.
- Example totals: **$1,014/month for 101 operators** and **$1,749/month for 150**.

The headcount ranges describe the intended customer rather than an arbitrary technical limitation. Business and Enterprise can also be selected earlier when a customer needs the plan's governance, security, support, or infrastructure capabilities.

### Capacity add-ons

- Dedicated CAX41 worker: **€99/month** against €40.99 raw compute cost.
- Dedicated CCX23 worker: **€199/month** against €85.99 raw compute cost.
- Larger isolated pools: quoted from a published multiplier of approximately **2.0–2.5× raw infrastructure cost**, depending on support and redundancy.

The dedicated-worker margins are intentionally lower than pure software margins because they resell real capacity. The platform and seat fees carry the software margin.

## Example customer invoices

All examples exclude VAT and model/API charges.

| Customer | Calculation | Monthly subscription |
| --- | --- | ---: |
| One-person hosted workspace | Individual plan | **$9** |
| Five-person team | $10 Team platform + 5 × $5 operators | **$35** |
| Fifteen-person team | $10 + 15 × $5 | **$85** |
| 16-person business | $99 including 15 + 1 × $10 | **$109** |
| 25-person business | $99 including 15 + 10 × $10 | **$199** |
| 50-person business | $99 including 15 + 35 × $10 | **$449** |
| 100-person business | $99 including 15 + 85 × $10 | **$949** |
| 101-person enterprise | $999 including 100 + 1 × $15 | **$1,014** |
| 150-person enterprise | $999 including 100 + 50 × $15 | **$1,749** |

This is much easier to defend than charging for agent definitions. The customer pays for a managed, governed platform used by employees, while unlimited agent definitions remain a product advantage rather than a billing obstacle.

## Gross-margin sanity check

At $5–10 of hosting COGS, a five-operator Team customer paying $35 has a 71.4–85.7% infrastructure margin. After illustrative payment and support costs, the planning contribution-margin range is 42.9–74.3%. This lower introductory margin is deliberate: Team is the acquisition tier, while Business and Enterprise fund the heavier governance and support burden.

That does **not** mean the business has a 95% final margin. The following still need measurement and allocation:

- Database and workspace growth per customer.
- Backup retention and restore testing.
- Observability ingestion and retention.
- Support time by plan.
- Payment processing, fraud, and failed payments.
- Spare capacity required for real concurrency peaks.
- Additional regions and high-availability requirements.
- Security, compliance, and incident response costs.

Target a 75–85% blended software gross margin before R&D and general company expenses. Recalculate prices after load tests and again after the first ten paying customers reveal actual support and usage patterns.

## Changes recommended for the landing page

Replace the current €99/€299/€799 agent-count cards. They imply that agent definitions are what customers buy and what Nebula pays to host.

The public cards should instead show:

- **Individual — $9/month**, includes one active operator, unlimited personal agents, hooks, skills, MCPs, web fetch, and supported OAuth subscriptions.
- **Team — $10/month plus $5 per active operator**, available for up to 15 operators.
- **Business — $99/month including 15 active operators, then $10 per additional operator**.
- **Enterprise — $999/month including 100 active operators, then $15 per additional operator**.
- “Unlimited agents” on every plan.
- The included operator allowance and additional active-operator price on every applicable card.
- No customer-visible concurrent-run quota.
- A prominent statement that model and third-party API usage is billed directly by the provider and receives no Nebula markup.

## Decisions still requiring benchmarks

Before treating these as final prices, measure:

1. Peak RSS for 1, 10, 100, and 1,000 loaded agent definitions in one runtime.
2. CPU and memory during simultaneous shell, web, MCP, and file workloads.
3. Workspace disk growth and history size per active user/month.
4. How many concurrent runs a CAX41 and CCX23 sustain at acceptable latency.
5. Isolation overhead per organization using a process, container, or dedicated VM; benchmark Kubernetes only when operating a real multi-node fleet.
6. Backup, restore, and observability cost at 10, 50, and 100 organizations.
7. Monthly support minutes for Team, Business, and Enterprise customers.

Those results should tune internal placement, autoscaling, and dedicated-worker prices. They should not create a customer-visible per-agent or concurrent-run license.
