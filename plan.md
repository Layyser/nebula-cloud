# Nubols beta launch plan

**Target:** controlled beta by **11 September 2026**  
**Company:** Nubols (recommended legal name subject to availability: `Nubols Labs, S.L.`)  
**Products:** Nubols Cloud (commercial control plane) and Nebula Agent (runtime)  
**Audience:** small technical teams and design partners, initially B2B  
**Capacity target:** 5–10 organizations, at most 25 provisioned workspaces during the first beta

> This is an execution plan, not legal or tax advice. Before accepting money,
> a Spanish *gestor/asesor fiscal* and a lawyer familiar with SaaS, GDPR, and
> technology contracts must validate the company, tax, and contract sections.

## 1. What the beta actually sells

Nubols Cloud gives each organization member one persistent Operator. An
Operator is the Nebula application running in one isolated Linux workspace.
Inside that Operator, Nebula Agent can run multiple chats and agent
configurations in parallel. Those chats share the same Linux filesystem,
installed software, quotas, and container lifecycle.

```text
Organization
└── Member (one billable seat)
    └── Operator (one persistent Linux container)
        ├── Chat / agent configuration A
        ├── Chat / agent configuration B
        └── Chat / agent configuration C
            all share the same workspace and resource limits
```

This distinction must be consistent in product copy, database names, metrics,
support documentation, and billing:

- **Seat:** an active organization membership entitled to one Operator.
- **Operator:** one running Nebula application and its persistent Linux home.
- **Agent:** a model/tool/skill/MCP/rule/permission/context configuration.
- **Chat/session:** one conversation or work stream inside an Operator.
- Multiple chats do not create more containers and are not extra seats.

### Beta promise

- One Operator per active, entitled member.
- Persistent home and sessions across restarts.
- Multiple chats may execute in parallel inside that Operator.
- Chat and Console operate on the same workspace.
- Organization owners can invite members and inspect basic usage.
- Nubols can place new workspaces on more than one registered worker host.
- Operators can run workspace-owned Docker containers without access to the
  host Docker daemon or another workspace's containers.
- An Operator can explicitly publish an approved HTTP or TCP service through a
  Nubols-managed hostname/port and ingress policy.
- Provider-neutral runtime: the workspace is not tied to one model vendor.

### Explicit non-goals for this month

- More than one Operator per member.
- Moving a live workspace automatically between worker hosts.
- Kubernetes, automatic cloud autoscaling, or active-active control planes.
- Enterprise SSO/SCIM, formal SLA, procurement integrations, or annual contracts.
- Unrestricted host-port publishing, direct worker exposure, privileged nested
  containers, or access to another workspace's container runtime/network.
- A polished fleet dashboard with every metric shown on the landing mockup.
- Unrestricted self-service signup with unlimited provisioning.

## 2. Definition of beta-ready

The beta may open only when every P0 gate below is green.

| Gate | Required result |
|---|---|
| Identity | Verified email, password reset, secure production cookies, auth rate limits, and working organization invitations |
| Entitlement | An unentitled member cannot provision or access an Operator; an entitled member can own exactly one |
| Billing | Stripe sandbox and live-mode webhook paths tested; duplicate/reordered events are safe; invoices expose legal and tax IDs |
| Compute | At least two worker hosts can be registered, health-checked, capacity-scored, and assigned deterministically |
| Isolation | Existing worker security tests pass; outer and nested resource, disk, PID, network, and concurrency limits are enforced |
| Published services | Workspace-owned HTTP/TCP services use explicit policy, scoped routing, TLS where applicable, abuse controls, and revocation; workers expose no arbitrary host ports |
| Recovery | Control-plane database and workspace data have automated backups and a completed restore drill |
| Observability | Alerts exist for API failure, provisioning backlog, worker health, disk pressure, failed payments, and email delivery |
| Legal | Company can invoice; Terms, Privacy, DPA, AUP, cookie policy, subprocessors, and beta limitations are published |
| Brand/domain | Nubols naming is consistent; production HTTPS, email DNS, redirects, and search metadata work |
| Operations | Support mailbox, incident runbook, status communication, and emergency provisioning/worker kill switches exist |

If billing or company formation is delayed, launch an **invite-only free design
partner beta** with written beta terms. Do not take payments personally and
retrofit the legal entity later.

## 3. Critical path and goals

### G0 — Freeze the beta contract (11–12 August)

**Outcome:** everybody builds the same small product.

- [x] Record the one-seat/one-Operator rule in the internal beta product contract.
- [x] Keep the existing unique `workspace.member_id` database guard (verified in
      `packages/database/src/index.ts`).
- [x] Define the runtime concurrency policy for parallel chats. Start with a safe
      default such as two active agent turns per Operator; queue excess turns.
- [x] Decide the beta capacity ceiling: 25 provisioned workspaces.
- [x] Decide the first cohort: 5–10 hand-approved design partners, with expiring
      free beta entitlements and Stripe-enabled paid pilots through the same
      authorization path; no unrestricted public provisioning.
- [x] Remove or label landing claims that the beta dashboard cannot yet prove;
      the Dashboard now renders recorded model turns and token totals rather
      than fake operator, spend, task, or health metrics.

**Acceptance:** a one-page product contract defines member, seat, Operator,
agent, session, included limits, data retention, and beta support.

#### Implementation reconciliation — 23 August 2026

The following foundations are already implemented and validated locally. They
support later launch gates, but they do not by themselves make those gates
complete:

- [x] Nebula Agent supports provider/model discovery, multiple provider wire
      formats, Codex authentication, and OpenCode Go credential management.
- [x] The shared Runtime UI has one settings shell for appearance, providers,
      and Operator controls, plus semantic light/dark/system theme tokens.
- [x] Cloud consumes the shared Runtime UI as an immutable vendored package
      rather than copying its components.
- [x] Worker exposes the effective workspace image and reserved runtime resource
      metadata needed by the Operator settings view.
- [x] Cloud stores deduplicated model-turn usage, derives versioned estimated
      model cost, and authorizes personal versus organization usage queries.
- [x] Cloud has organization access-code and membership-disable primitives plus
      the initial organization dashboard shell.
- [x] Public route shells exist for `/docs`, `/plans`, `/legal`, and `/contact`,
      sharing the marketing header, footer, theme system, and reusable controls.
- [x] Deterministic Frontend and Cloud preview states cover the primary runtime,
      auth, startup, settings, terminal, and dashboard surfaces.

Still open on the beta critical path: verified email and recovery, durable
invitations, entitlements and Stripe projection, the multi-worker registry,
nested-container and publication boundaries, complete audit events, backups and
restore evidence, production infrastructure, reviewed legal copy, and real
customer validation. Placeholder pages and local dashboards must not be counted
as completing those launch gates.

### G1 — Validate demand through closed demos (start now; decide within two weeks)

**Outcome:** prove that a specific customer has a recurring problem worth solving
before paying the cost and accepting the obligations of an S.L.

This phase is product discovery, not a commercial beta. Until the company exists,
do not accept money, sign binding customer/pilot/DPA/SLA agreements, or process
real customer credentials, repositories, production workloads, personal data,
or confidential files. Use synthetic data and founder-controlled systems.

- [x] Define the closed-demo script, interview questions, evidence hierarchy,
      validation threshold, outreach template, and two-week sprint in
      `docs/closed-demo-validation.md`.
- [ ] Select one initial customer hypothesis: software agencies, small SaaS
      engineering teams, or data/automation teams using coding agents.
- [ ] Create a private tracker for organization, contact, observed problem,
      frequency, workaround, security blockers, buyer, and next commitment.
- [x] Define the local-first closed-demo boundary, minimal usage/shared-capability/
      HTTP-publication contracts, hosting purchase gate, EUR 60 ceiling, and
      build order in `docs/demo-technical-scope.md`.
- [ ] Build one reliable 12-minute demo using only synthetic project and CSV data,
      following that scope rather than completing every beta feature.
- [ ] Create a list of 30 qualified founder-reachable prospects and conduct at
      least 10 discovery calls.
- [ ] Run at least 5 closed demos, with the strongest prospects receiving a
      second workflow-specific session.
- [ ] Obtain at least 2 concrete next commitments and evidence of a plausible
      buyer/budget from at least 1 organization.
- [ ] Decide whether the validation gate passes. If not, narrow the segment or
      problem and repeat five interviews instead of adding speculative features.

**Acceptance:** at least three organizations independently describe the recurring
problem, two commit time to a real next step, one identifies buyer/budget, and the
founder can state the initial customer, workflow, and measurable outcome clearly.

### G1B — Form Nubols correctly in Spain (after validation; finish before charging)

**Recommendation:** create a **Sociedad de Responsabilidad Limitada (S.L.)**,
not operate the hosted product indefinitely as an individual autónomo. The S.L.
better separates the founder from contractual, infrastructure, data, and abuse
risk and is a more natural counterparty for enterprise customers and Stripe.

The statutory minimum capital can be EUR 1, but sub-EUR 3,000 companies have
special reserve/liability rules. Put in **EUR 3,000 if affordable**; this is a
business recommendation, not a legal requirement.

- [x] Prepare the founder/gestor incorporation brief, ordered name candidates,
      employment/IP review, formation sequence, and official action links in
      `docs/company-formation-brief-es.md`.
- [ ] Review the founder's employment contract and employer policies for
      exclusivity, non-compete, confidentiality, moonlighting, and IP ownership.
- [ ] Ask the Central Mercantile Registry for a negative name certificate for
      several ordered options, starting with `Nubols Labs, S.L.`. The domain does
      not reserve the company name or trademark.
- [ ] Search OEPM and EUIPO for `Nubols` and `Nebula` in the relevant software,
      SaaS, and AI classes before investing further in the brand.
- [ ] Hire a gestor before incorporation. Give them this product description:
      B2B SaaS, cloud compute, downloadable software later, customers potentially
      inside and outside Spain, recurring card billing through Stripe.
- [ ] Use a PAE/CIRCE and the DUE where practical, or a notary directly if the
      shareholding/IP arrangements are non-standard.
- [ ] Open the capital account, execute the deed, obtain provisional NIF,
      register with the Mercantile Registry, obtain definitive NIF, and file the
      census start/modification through Modelo 036/DUE.
- [ ] Register for ROI/VIES before qualifying EU B2B cross-border services.
- [ ] Confirm the founder-administrator's Social Security position. An
      administrator with effective control commonly falls under RETA; the exact
      treatment depends on ownership, duties, and remuneration.
- [ ] Open a company bank account, company Stripe account, and accounting system.
- [ ] Assign all relevant existing code, domains, logo, and product IP to the
      company with a written founder IP assignment.
- [ ] Record beneficial owner, administrator powers, fiscal address, fiscal year,
      and activity codes with the gestor.

#### Accounting automation and filing workflow

Stripe is the authoritative payment processor, but not the accounting ledger or
the Spanish tax filer. Every Stripe payment, refund, dispute, fee, invoice, tax
amount, and payout must be synchronized into a Spain-compatible accounting
system and reconciled against the dedicated company bank account. Supplier
invoices and company expenses must enter the same ledger even though they do not
pass through Stripe.

- [ ] Select a Spain-compatible accounting platform with Stripe and bank import,
      invoice attachment, a usable API/export, PGC-compatible accounts, and
      support for the applicable Spanish invoicing-system requirements.
- [ ] Keep company and personal money completely separate. Pay company expenses
      from one company bank account and retain a valid invoice for every expense.
- [ ] Enable Stripe Tax only after the gestor confirms the Nubols Cloud product
      tax code, Spanish VAT registration, VIES/ROI position, and whether OSS is
      required for any EU B2C sales.
- [ ] Import Stripe balance transactions rather than treating payouts as sales:
      separately book gross revenue, VAT, refunds, disputes, and Stripe fees,
      then reconcile the net payout to the bank.
- [ ] Use automation/AI to extract supplier invoices, propose account and VAT
      treatment, identify missing documents, reconcile transactions, and prepare
      draft VAT, OSS, annual-account, and Corporate Income Tax workpapers.
- [ ] Require human approval for every low-confidence classification and every
      filing. The gestor owns tax treatment and submission; the administrator
      retains legal responsibility.
- [ ] Give the gestor read-only access or standardized monthly exports. Close and
      review each month instead of reconstructing the year before Modelo 200.
- [ ] Store the source document, ledger entry, Stripe object IDs, bank movement,
      applied tax rule, reviewer, and filing period as an auditable chain.
- [ ] Test the full ledger with a EUR 1 sale/refund, Stripe fee, Spanish B2B sale,
      EU VAT-ID customer, failed payment, supplier invoice, and founder-paid
      pre-incorporation expense before accepting beta revenue.

AI may prepare filings but must not autonomously submit them during beta. Stripe
Tax calculations and reports do not replace bookkeeping, VAT registrations,
returns, payments, annual accounts, Modelo 200, or Mercantile Registry filings.

**Tax operating checklist (gestor-owned):**

- Corporate bookkeeping, invoices, expense receipts, annual accounts, books,
  Corporate Income Tax, VAT, applicable withholding returns, and IAE/census.
- Validate eligibility before assuming the 15% new-company Corporate Income Tax
  rate; it generally applies to the first profitable period and the following
  one when statutory conditions are met.
- Spanish VAT for domestic sales; VIES validation and reverse-charge handling
  where applicable for EU B2B; customer-location evidence and OSS analysis for
  EU B2C electronic services.
- Stripe Tax calculates tax but does not replace registration, returns, payment,
  bookkeeping, or the gestor.
- Choose invoicing/accounting software that is ready for Spain's invoicing-system
  rules. Current official guidance makes them mandatory for Corporate Income
  Tax taxpayers from 1 January 2027, so buying a dead-end invoicing tool now
  would create an immediate migration.

**Acceptance:** Nubols can sign a contract, issue a compliant invoice, receive a
Stripe payout, reconcile gross sale/tax/fees/refund to the bank, book the related
expenses, and explain which VAT treatment was applied. A gestor can reproduce
the result from the retained source documents without editing production data.

### G2 — Rebrand and wire `nubols.com` (12–15 August)

Use Nubols as the company/cloud brand and keep Nebula as the agent/runtime name.

```text
nubols.com             marketing, pricing, legal, docs entry point
app.nubols.com         authenticated Web app and same-origin control plane API
*.apps.nubols.com      managed HTTPS endpoints explicitly published by Operators
*.tcp.nubols.com       names for allocated raw-TCP ingress endpoints (port separate)
status.nubols.com      hosted status page
docs.nubols.com        documentation (can initially redirect to one docs site)
send.nubols.com        transactional-email sending subdomain
```

- [ ] Put DNS behind a provider with DNSSEC, API tokens scoped per zone, and
      account MFA.
- [ ] Point `nubols.com` and `www.nubols.com`; choose one canonical URL and issue
      permanent redirects from the other.
- [ ] Reserve wildcard DNS for managed service ingress. Do not point it directly
      at Worker hosts until the publication gateway, ownership checks, route
      reconciliation, TLS, quotas, and revocation path are operational.
- [ ] Serve Web and `/api/*` from `app.nubols.com` so Better Auth cookies remain
      first-party and the reverse proxy can forward Console WebSocket upgrades.
- [ ] Set `BETTER_AUTH_URL=https://app.nubols.com`, exact trusted origins, secure
      cookies, production secret, and trusted proxy/IP header configuration.
- [ ] Update `Nebula Cloud` product references to `Nubols Cloud`; keep `Nebula
      Agent`, `Nebula Desktop`, the `nebula` executable, and runtime API names.
- [ ] Update title, OpenGraph cards, favicon, schema/organization metadata,
      support addresses, invoice branding, and footer legal entity.
- [ ] Add a temporary redirect map for any old domain/URL that has been shared.
- [ ] Enable HSTS only after every required subdomain works over HTTPS.

**Acceptance:** signup, verification link, login, app API, WebSockets, Stripe
return URLs, and password reset all work from production URLs with no mixed
content or cross-domain cookie exceptions.

### G3 — Production email and account recovery (12–17 August)

Use a transactional provider such as Resend with an EU sending region if its
current DPA/subprocessor terms are acceptable. Keep human mailboxes (for example
Google Workspace, Fastmail, or Proton Business) separate from transactional
sending.

- [ ] Create `hello@nubols.com`, `support@nubols.com`, `security@nubols.com`,
      `privacy@nubols.com`, and `billing@nubols.com` aliases/mailboxes.
- [ ] Verify `send.nubols.com` with the provider-supplied DKIM and SPF records.
- [ ] Publish DMARC in monitoring mode, review reports, then move toward
      quarantine/reject once every legitimate sender is aligned.
- [ ] Implement Better Auth `sendVerificationEmail`, send on signup, and require
      verification before creating/provisioning a workspace.
- [ ] Implement forgot/reset password, reset completion, resend verification,
      expired-link, and already-used-link UI.
- [ ] Implement organization invitation email and acceptance screens; require
      the signed-in address to match the invitation.
- [ ] Build branded plain-text and HTML templates with absolute Nubols URLs.
- [ ] Store provider message ID and delivery status, not email bodies, in an
      `email_delivery` diagnostic table.
- [ ] Add per-IP and per-address limits for signup, login, reset, resend, and
      invitations. Return non-enumerating responses for account recovery.
- [ ] Test Gmail, Outlook, Apple/iCloud, mobile clients, expired links, duplicate
      clicks, and a provider outage.

**Acceptance:** a new user can verify, reset a forgotten password, accept an
organization invite, and receive every message with SPF/DKIM/DMARC passing.

### G4 — Billing and entitlements with Stripe (13–21 August)

**Recommended beta model:** one organization subscription with a quantity equal
to entitled members. Each paid seat grants one Operator. Keep the exact price in
Stripe/configuration rather than hard-coding it in access-control logic.

Stripe is preferable to a Merchant of Record for the B2B beta because Nubols
needs organization subscriptions, tax IDs, invoices, and direct customer
relationships. A Merchant of Record such as Paddle can be reconsidered before a
large international B2C launch if VAT administration outweighs the loss of
control and higher fees. Do not integrate two billing systems for beta.

#### Required data model

```text
billing_customer
  organization_id UNIQUE
  stripe_customer_id UNIQUE
  billing_email
  country
  created_at / updated_at

subscription
  organization_id UNIQUE
  stripe_subscription_id UNIQUE
  stripe_price_id
  status
  entitled_seats
  cancel_at_period_end
  current_period_end
  last_event_created_at

entitlement
  membership_id UNIQUE
  organization_id
  kind = 'operator'
  state = pending | active | grace | suspended | revoked
  source = beta | stripe | admin
  starts_at / ends_at

stripe_event
  stripe_event_id UNIQUE
  type
  created_at
  processed_at
  processing_result
```

#### Integration order

- [ ] Create Nubols Cloud product and monthly recurring seat price in Stripe
      sandbox; use a single currency for beta.
- [ ] Create one Stripe Customer per organization, not per user.
- [ ] Use Stripe-hosted Checkout so raw card data never touches Nubols.
- [ ] Collect legal/business name, billing address, country, and tax ID where
      relevant; enable automatic tax only after the gestor validates product tax
      code and registrations.
- [ ] Add a signed webhook endpoint. Persist the event ID before processing;
      make handlers idempotent and tolerant of duplicates and out-of-order events.
- [ ] Project Stripe state into local subscription/entitlement tables. Never call
      Stripe synchronously on every authorization request.
- [ ] At minimum handle successful checkout, invoice paid/failed, subscription
      created/updated/deleted, and customer/tax detail updates.
- [ ] Provision only after a local entitlement becomes active. Failed payment
      moves through a documented grace period before suspension; never delete
      workspace data automatically because a card failed.
- [ ] Configure Stripe Customer Portal for payment methods, tax IDs, invoices,
      and cancellation. Keep seat changes admin-controlled during beta if
      quantity proration is not thoroughly tested.
- [ ] Add invoice legal name, address, NIF/VAT ID, support details, Terms, Privacy,
      and cancellation policy to Stripe public business information.
- [ ] Complete Stripe account verification, payout bank, webhook live secret,
      restricted API keys, team MFA, and least-privilege access.
- [ ] Test cards: success, SCA, decline, delayed payment, duplicate webhook,
      webhook arriving before browser redirect, cancellation, refund, tax-ID
      update, and live EUR 1/refunded smoke transaction.

**Beta shortcut:** an admin-created `source=beta` entitlement uses exactly the
same authorization path as Stripe. It expires on a specific date and cannot
silently become permanent.

**Acceptance:** payment state and workspace access remain correct when the user
closes Checkout, webhooks are replayed, events arrive out of order, or Stripe is
temporarily unavailable.

### G5 — Multi-worker placement, nested containers, and controlled ingress (13–27 August)

Keep one Web/control-plane deployment for beta. It may continue using SQLite on
a durable encrypted volume if backups and single-instance operation are
explicit. Multiple control-plane replicas require moving shared auth, jobs, and
leases to PostgreSQL; do not pretend SQLite is active-active.

Replace the current single `NEBULA_WORKER_URL` assumption with a worker registry
and scheduler:

```text
Browser
  -> app.nubols.com (Web + one control plane)
      -> durable provisioning job
          -> placement scheduler
              ├── Worker A / provider A / region A
              └── Worker B / provider B / region B
                    -> one persistent container per entitled member
```

The detailed security and routing contract is documented in
`docs/nested-containers-and-ingress.md`. The key boundary is that an Operator
may control Docker-compatible containers inside its own workspace, but it never
receives the host Docker socket, Worker credentials, host networking, privileged
mode, or visibility into objects owned by another workspace.

#### Required data model

```text
worker_host
  id, name, provider, region
  base_url
  credential_key_id          # reference, never plaintext secret in responses
  enabled, schedulable
  state = unknown | healthy | draining | unavailable
  total/reserved memory, cpu, disk, workspace slots
  last_heartbeat_at, last_error_code

workspace
  ...existing fields
  worker_host_id             # immutable while assigned in beta
  worker_workspace_id

worker_health_sample         # short retention
  worker_host_id, observed_at, status, capacity fields
```

#### Implementation

- [ ] Introduce `WorkerDirectory` and `WorkerClientFactory`; gateway, Console,
      restart, and provisioning resolve the workspace's assigned worker.
- [ ] Add admin-only worker registration/update/disable/drain operations.
- [ ] Keep worker credentials in deployment secrets or an encrypted secret
      store. The database should reference a key ID, not expose bearer/HMAC keys.
- [ ] Connect control plane to workers through private networking (for example
      WireGuard between hosts). Keep worker APIs off the public internet. Retain
      request authentication and replay protection even on the private network.
- [ ] Poll authenticated status/capacity, persist last-known health, and alert on
      staleness. Do not trust provider labels supplied by the browser.
- [ ] Placement filters to enabled + schedulable + recently healthy hosts, checks
      hard workspace/resource/disk ceilings, then chooses the least-loaded valid
      host. Tie-break deterministically.
- [ ] Reserve capacity transactionally when a provisioning job receives an
      assignment so concurrent jobs cannot overbook a host.
- [ ] Never re-place an already assigned workspace because its worker is briefly
      unhealthy. Retry there and escalate to an operator; cross-host data
      migration is a later feature.
- [ ] `draining` rejects new placements but preserves existing workspaces.
- [ ] Deploy two real worker nodes, preferably across two providers only to prove
      the boundary. Use the same immutable, digest-pinned workspace image.
- [ ] Add a canary workspace per host and run Chat, file persistence, Console,
      restart, quota, and image-version smoke tests.
- [ ] Add per-host emergency disable, global provisioning pause, and global
      workspace-start pause.

#### Worker production safeguards

- [ ] Maintain the existing non-root, dropped-capability, no-new-privileges,
      private-network, quota, bounded-log, and no-host-runtime-port properties.
- [ ] Patch host OS and Docker; scan and sign images; deploy by digest.
- [ ] Enforce outbound abuse controls and rate/connection limits. Block cloud
      metadata endpoints, private control networks, SMTP abuse, crypto mining,
      scanning, and privilege escalation. Publish an AUP.
- [ ] Package a workspace-scoped, rootless Docker-compatible daemon. Its daemon
      socket exists only inside the Operator and cannot address the host daemon.
- [ ] Put the nested daemon data root (images, layers, build cache, volumes, and
      writable container layers) below `/home/nebula` so the existing hard XFS
      project quota includes every nested-container byte.
- [ ] Keep nested processes beneath the outer workspace cgroup. Prove aggregate
      nested memory, CPU, PID, and disk consumption cannot exceed the Operator's
      hard limits; fail the feature closed on hosts without the required cgroup
      v2/user-namespace support.
- [ ] Reject nested resource reservations whose aggregate exceeds the parent
      workspace envelope. Regardless of inner declarations, the outer cgroup and
      XFS quota remain the non-bypassable enforcement boundary.
- [ ] Preserve one network namespace and one nested daemon per workspace. Reject
      host networking, privileged mode, host PID/IPC namespaces, devices,
      arbitrary mounts, and cross-workspace networks.
- [ ] Add a workspace-scoped service-publication broker. The runtime can request
      publication only for its own service and target port; it never receives
      Worker, DNS-provider, or ingress credentials.
- [ ] Add durable `published_service` state with workspace ownership, protocol,
      internal target, public hostname/allocated TCP port, visibility, auth
      policy, status, expiry, timestamps, and audit actor.
- [ ] Route HTTP/HTTPS through managed wildcard DNS and TLS. Route raw TCP (for
      example Minecraft) through an allocated gateway port; optionally publish
      protocol-specific SRV records where clients support them. DNS alone does
      not encode a generic TCP port.
- [ ] Default every service to private. Making it public requires an explicit,
      auditable action with quotas, rate/connection limits, expiry/revocation,
      and clear UI output containing the exact endpoint.
- [ ] Require TLS and generated credentials for database-like protocols, plus
      optional source-IP allowlists. A password/token alone is not an adequate
      public-database boundary.
- [ ] Add per-organization service/port/bandwidth limits, abuse detection, and
      emergency revocation. Block SMTP, metadata/private control networks,
      reflection/amplification patterns, scanning, and prohibited workloads.
- [ ] Integration-test two workspaces on one worker: each can build/run/list only
      its own nested containers, each hits only its own quota, and neither can
      connect to or inspect the other's daemon, containers, volumes, or network.
- [ ] End-to-end test one HTTPS service and one raw TCP service from the public
      internet, including restart persistence, certificate issuance, routing to
      the correct worker, credential rotation, expiry, deletion, and worker drain.
- [ ] Publish only services registered through this controlled ingress contract;
      never expose arbitrary Docker/host ports directly.
- [ ] Define idle/suspend policy without killing active parallel chats.

**Acceptance:** two members can provision concurrently onto different healthy
workers; all later Runtime, Console, nested-container, and published-service
traffic resolves to the recorded host; draining one host sends only new work
elsewhere; a worker outage never creates a second empty workspace. Nested
containers remain inside their parent resource/quota envelope, and public routes
can reach only the exact workspace-owned service recorded by the control plane.

### G6 — Real organization dashboard, usage, cost, and audit (17–27 August)

Do not derive business metrics from UI state. Introduce append-only events and
aggregate them server-side.

#### Minimum event contract

```text
usage_event
  event_id UNIQUE
  organization_id, membership_id, workspace_id
  session_id, agent_id (nullable)
  provider, model
  input_tokens, output_tokens, cached_tokens
  estimated_provider_cost_minor, currency, pricing_version
  duration_ms, outcome
  occurred_at, received_at

compute_sample
  workspace_id, worker_host_id
  state, memory_bytes, cpu_time, disk_bytes
  sampled_at

audit_event
  organization_id, actor_user_id
  action, target_type, target_id
  result, source_ip_hash, occurred_at
  bounded metadata JSON with secrets removed
```

- [x] Make Nebula Agent or the authenticated Runtime gateway emit one stable
      event ID per completed model turn; retries must not duplicate usage.
- [x] Store raw provider-reported tokens. Estimated cost is a separate versioned
      calculation and must be labelled “estimated” unless reconciled to a bill.
- [x] Add database-enforced append-only `audit_event` storage with bounded,
      scalar metadata; enabled-member event writers; owner/admin reads; bounded
      cursor pagination; and initial coverage for access-code, member-state,
      organization-name, ensure-running, and restart actions.
- [ ] Capture provisioning/start/stop/restart/failure, login, invitation, role,
      capability policy, Console open, billing, and deletion audit events.
- [x] Implement organization authorization on every aggregate query. Members see
      their own usage; owners/admins see organization totals and per-member data.
- [ ] Dashboard P0 cards: entitled members, ready/active Operators, sessions,
      model turns, tokens, estimated model cost, provisioning failures, and
      worker health. No fake “tasks completed” metric without a task definition.
- [ ] Add UTC storage and organization-local display; document aggregation
      windows and delayed events.
- [ ] Add retention: detailed usage/audit retained for a defined beta period;
      logs shorter; billing records according to legal/accounting requirements.
- [ ] Export CSV for organization usage and invoices before building elaborate
      charts.

**Acceptance:** a test fixture with two members, multiple chats, duplicate usage
events, and two workers produces correct member and organization totals and
rejects cross-organization access.

### G7 — Security, privacy, and abuse readiness (in parallel; gate by 31 August)

- [ ] Threat-model browser → control plane → worker → container → model provider,
      including malicious members, prompt/tool abuse, SSRF, container escape,
      credential theft, webhook forgery, and cross-organization ID guessing.
- [ ] Extend the threat model through nested daemon → nested container → ingress,
      including Docker API abuse, namespace/cgroup escape, image/build attacks,
      disk exhaustion, cross-workspace discovery, exposed databases, DDoS,
      malware hosting, scanning, and abandoned DNS/route takeover.
- [ ] Run dependency, secret, container image, and host configuration scans.
- [ ] Rotate production secrets; keep dev/bootstrap credentials out of prod.
- [ ] Encrypt disks/volumes and backups; document who can access workspace data.
- [ ] Add log redaction tests for prompts, tokens, authorization headers, worker
      addresses, paths, provider credentials, and Console contents.
- [ ] Add per-org/member quotas for provisioning, model turns, uploads, Console
      sessions, bandwidth, and storage.
- [ ] Add upload limits, content-type handling, malware strategy, and safe filename
      handling before marketing CSV uploads.
- [ ] Add account deletion, organization deletion request, export request, and a
      reviewed delayed workspace-destruction workflow.
- [ ] Define RPO/RTO for beta; recommended starting targets: control-plane RPO
      <= 24h, workspace RPO <= 24h, manual RTO <= 8h. State these honestly.
- [ ] Perform one full restore into an isolated environment and record evidence.
- [ ] Create incident severity levels, contact tree, evidence preservation,
      customer notification template, and personal-data-breach assessment flow.
- [ ] Create `security@nubols.com` and a vulnerability disclosure page.

**Acceptance:** a written security review has no open critical finding, backup
restore succeeds, and the founder can disable signup, billing, provisioning, a
worker, or all workspace starts without deploying code.

### G8 — Legal pages and contracts (finish by 31 August)

For beta, sell to businesses and have users confirm they act for an organization.
This reduces—not eliminates—consumer-law complexity.

- [ ] Legal notice (*Aviso legal*) with company identity, NIF, registry details,
      address, and contact data once available.
- [ ] Terms of Service covering account authority, seat/Operator definition,
      payment, renewal/cancellation, suspension, beta status, warranty limits,
      acceptable use, IP, feedback, termination, data export/deletion, governing
      law, and support.
- [ ] Privacy notice mapping account, organization, billing, usage, logs, email,
      support, and security data to purpose, legal basis, retention, recipients,
      transfers, and rights.
- [ ] Data Processing Agreement for business customers, including security
      measures, subprocessors, breach handling, deletion/return, and assistance.
- [ ] Public subprocessor list: hosting providers, worker providers, Stripe,
      email, monitoring, support, analytics, and model providers only where Nubols
      actually processes data through them.
- [ ] Acceptable Use Policy specific to shell-capable compute: no malware,
      scanning, credential theft, spam, mining, illegal content, evasion, or
      unauthorized third-party access.
- [ ] Cookie policy and consent mechanism only for non-essential analytics/ads.
      Necessary auth/security cookies do not justify a banner by themselves;
      have counsel validate the final implementation.
- [ ] AI disclosure and human-control language: model output can be wrong;
      customers authorize tools and remain responsible for consequential actions.
- [ ] Vendor DPAs and international transfer mechanisms reviewed before data is
      sent outside the EEA.
- [ ] Record of Processing Activities, retention schedule, rights-request
      procedure, breach register, and processor access list.
- [ ] Explicit clickwrap for Terms/Privacy version at signup and DPA acceptance
      by an organization owner; store version, timestamp, and actor.

**Acceptance:** counsel/gestor sign off, every footer link resolves, every vendor
in production appears in the subprocessor inventory, and acceptance evidence can
be queried.

### G9 — Production deployment and operations (24 August–4 September)

#### Control plane and Web

- [ ] One reproducible production host/deployment, reverse proxy, automatic TLS,
      WebSocket forwarding, firewall, non-root app process, and system service.
- [ ] Durable encrypted database volume with WAL-safe backup tooling. Never copy
      a live SQLite database file naively; use SQLite-aware backup/snapshot flow.
- [ ] Daily encrypted off-host backups with retention and restore verification.
- [ ] Health probes, structured logs, request IDs, release version, and deploy
      rollback.
- [ ] CSP, security headers, HTTPS redirects, body/upload limits, timeouts, and
      trusted proxy configuration.
- [ ] Separate development, staging/Stripe sandbox, and production secrets/data.
- [ ] CI gates: typecheck, unit tests, builds, worker tests, image contract,
      integration smoke, migration test, and secret scan.

#### Monitoring and support

- [ ] Synthetic journey: landing → signup/verification → organization → beta or
      paid entitlement → provision → chat → Console → restart → persistence.
- [ ] Alerts: control-plane readiness, 5xx/error rate, auth failures, queue age,
      worker unavailable/capacity, disk/quota pressure, runtime startup failures,
      backup failure, email bounce, webhook failure, and payment failure.
- [ ] Status page with control plane, authentication, workspaces, and model
      provider components.
- [ ] Support workflow with severity, owner, response target, and workspace ID;
      never ask customers to email secrets or provider tokens.
- [ ] Runbooks for deploy rollback, worker drain, stuck job, lost worker, full
      disk, corrupt database, restore, Stripe outage, email outage, and breach.

**Acceptance:** staging is rebuilt from documentation, production is deployed
from a tagged release, and a second person could follow the rollback/restore
runbooks.

### G10 — Marketing and beta recruitment (start now; launch 5–11 September)

Do not buy broad ads before activation and retention are measurable. The first
month needs conversations and proof, not impressions.

#### Positioning

Lead with the defensible distinction highlighted by the Grok Bot announcement:

> **Give any AI its own computer. Keep control of the runtime.**

- Provider-neutral rather than tied to one model vendor.
- A real, inspectable Linux workspace.
- Delegate in Chat; take over the exact same work in Console.
- Local Nebula Agent and managed Nubols Cloud share the runtime model.
- Organization-controlled access, capabilities, usage, and cost.

Avoid leading with “always-on AI teammate” alone; large vendors now use nearly
the same category language. Demonstrate ownership, portability, inspectability,
and handoff.

#### Assets

- [ ] 90-second product video: deploy PostgreSQL, drop/analyze CSV, inspect/take
      over in Console, and a short fun Minecraft-server ending. Do not imply
      public server exposure unless the product securely supports it.
- [ ] Three 15–25 second cuts for social media.
- [ ] Architecture/security page and concise “Why Nubols” page.
- [ ] Real docs for signup, first Operator, Chat, Console, files, capabilities,
      limits, data deletion, and troubleshooting.
- [ ] One founder post explaining why Operators need computers and why the runtime
      should remain model-independent.
- [ ] Comparison page based only on verifiable claims; no accusations that xAI
      copied Nubols.

#### Channels

- [ ] Reserve consistent Nubols handles on X, LinkedIn, YouTube, GitHub, and the
      communities where the founder will genuinely participate.
- [ ] Weekly cadence: one product clip, one technical/build note, one customer
      workflow, and direct replies/conversations.
- [ ] Personally recruit 30 qualified prospects; interview 15; onboard 5–10.
- [ ] Use warm founder outreach and small technical communities first. Publish to
      Hacker News/Product Hunt only when onboarding survives strangers.
- [ ] Add a short waitlist/design-partner form with role, team size, workflow,
      model provider, security needs, and willingness to meet. Do not request
      sensitive company data.
- [ ] Use first-party, privacy-reviewed analytics for landing → signup → verified
      → entitled → workspace ready → first successful turn → day-7 active.
- [ ] Paid ads remain off until at least 20 qualified activations reveal a repeatable
      audience and message. If tested later, cap a small experiment and define
      one conversion before spending.

#### Beta success metrics

| Metric | One-month target |
|---|---:|
| Qualified design-partner conversations | 15 |
| Organizations onboarded | 5–10 |
| Verification completion | >= 80% |
| Entitlement → workspace ready | >= 90% |
| Median workspace provisioning | establish baseline, then < 3 min target |
| First successful agent turn after workspace ready | >= 80% |
| Week-1 organizations returning in week 2 | >= 50% |
| Restore drills completed | 1 control plane + 1 workspace |
| Cross-organization access incidents | 0 |
| Unexplained billing/access mismatches | 0 |

**Acceptance:** five organizations can independently reach a useful result, at
least three return the next week, and every failure is observable and supportable.

## 4. Four-week schedule

### Week 1 — 11–17 August: closed validation, identity, brand, architecture freeze

1. Prepare the synthetic closed demo and private evidence tracker.
2. Contact 30 qualified prospects; begin ten discovery calls and five demos.
3. Freeze one-member/one-Operator contract and concurrency limits.
4. Wire Nubols DNS/staging URLs and complete the rebrand map.
5. Implement transactional email, verification, reset, and invitations.
6. Design billing/entitlement and worker-registry migrations and contracts.

**Week gate:** verified invited user reaches staging; legal formation is in
preparation but not filed; at least five qualified discovery calls are complete;
schema/API designs for billing and workers are reviewed.

### Week 2 — 18–24 August: billing and worker pool

1. Stripe sandbox Checkout, portal, signed webhooks, local projection, and beta
   entitlements.
2. Worker registry, per-workspace assignment, health polling, capacity
   reservations, and deterministic scheduler.
3. Deploy the second worker host and run cross-host integration tests.
4. Add global and per-worker provisioning kill switches.
5. Draft Terms, Privacy, DPA, AUP, and subprocessors with counsel.

**Week gate:** two test organizations provision on different workers; webhook
replay cannot duplicate seats or access; no browser-visible worker secret.

### Week 3 — 25–31 August: metrics, recovery, compliance, hardening

1. Usage/compute/audit events and real dashboard minimum.
2. Organization/member authorization tests and CSV export.
3. Backups, restore drills, monitoring, alerts, rate limits, quotas, and abuse
   controls.
4. Finish legal pages, clickwrap/version evidence, retention, deletion request,
   and incident runbooks.
5. Full staging synthetic journey and adversarial security review.

**Week gate:** no fake dashboard data; restore succeeds; no open critical
security issue; legal pages and support routes are complete.

### Week 4 — 1–11 September: production, pilot, evidence, launch

1. Complete company/Stripe live verification or choose free invite-only beta.
2. Production deploy, DNS cutover, email deliverability, EUR live smoke/refund.
3. Onboard two friendly organizations first; observe for 48 hours.
4. Fix only launch blockers; freeze schema and infrastructure changes 48 hours
   before wider invites.
5. Publish demo, docs, founder story, and invite the remaining cohort in waves.
6. Daily review of queue, worker capacity, usage cost, support, and activation.

**Final gate:** all P0 gates are green and the first two organizations have
completed useful work without founder database edits.

## 5. Work priority if time slips

Cut in this order:

1. Fancy dashboard charts; keep correct totals and CSV.
2. Second cloud provider UI; keep two statically registered workers.
3. Paid beta; use expiring manual beta entitlements if company/Stripe is late.
4. Public launch campaign; onboard fewer design partners manually.
5. Nonessential landing animation/content.

Never cut:

- Email ownership verification and account recovery.
- Entitlement checks before provisioning/access.
- Worker isolation, resource limits, and private credentials.
- Backup restore proof.
- Legal identity/terms/privacy before charging.
- Billing webhook idempotency.
- Cross-organization authorization tests.
- Abuse controls and operational kill switches.

## 6. Immediate next actions (next 48 hours)

1. Read `docs/closed-demo-validation.md` and select the first customer segment.
2. Prepare the synthetic project/CSV demo locally and the private evidence
   tracker. Do not purchase hosting until the documented purchase gate passes.
3. Build a list of 30 qualified prospects and schedule the first five discovery
   calls. Ask for feedback on their current workflow, not a purchase.
4. Review the employment/IP section of `docs/company-formation-brief-es.md` now;
   defer incorporation filings until the closed-demo validation gate passes.
5. Create a Nubols-owned password manager/vault and email admin account.
6. Configure `nubols.com` DNS, `app` staging, and transactional sending domain.
7. Write and approve database migrations for entitlements, worker registry,
   workspace assignment, Stripe events, usage events, and audit events.
8. Implement email verification first; it is a dependency for safe invitations,
   billing identity, and workspace provisioning.
9. Keep strong prospects as non-binding design-partner candidates; do not accept
   payment or production data until the company and beta gates are ready.

### Next local engineering slice — 23 August reconciliation

Continue locally without purchasing infrastructure in this order:

1. [x] Add the append-only `audit_event` persistence and authorization boundary,
   beginning with organization membership/access-code changes and Operator
   lifecycle requests. Completed locally on 23 August; the remaining event
   families stay explicitly open in G6.
2. Complete the honest G6 dashboard minimum from persisted events; do not add
   synthetic operator-health or task-completion figures.
3. Implement verified email, password recovery, and invitation delivery behind
   a provider interface that can use a local test transport before DNS/email
   service purchase.
4. Add the worker registry and deterministic placement contracts with two local
   worker fixtures before renting a second host.
5. Implement and adversarially test the nested-container quota/isolation
   contract before any public service publication work.

## 7. Source checklist

Official/current references used to prepare this plan:

- Spain PAE/CIRCE and DUE: <https://paeelectronico.es/>
- DUE guide for an S.L. and current minimum-capital rules:
  <https://paeelectronico.es/Documents/Formacion/SociedadResponsabilidadLimitada/Gu%C3%ADa_cumplimentaci%C3%B3n_DUE_SRL.pdf>
- Spanish Tax Agency company obligations:
  <https://sede.agenciatributaria.gob.es/Sede/empresas.html>
- Corporate Income Tax rate for qualifying new entities:
  <https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-sociedades-2025/capitulo-06-liquidacion-is-determinacion-tributaria/cuota-integra-casilla-00562/tipo-gravamen/tipos-gravamen-vigentes.html>
- ROI/VIES for intra-EU operations:
  <https://sede.agenciatributaria.gob.es/Sede/iva/iva-operaciones-comercio-exterior/identificacion-realizar-operaciones-otros-empresarios-ue.html>
- EU B2C VAT One-Stop Shop:
  <https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/cuestiones-generales.html>
- Current VERI*FACTU timetable:
  <https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes.html?faqId=2e0c77fe52572910VgnVCM100000dc381e0aRCRD>
- Social Security control/administrator criteria:
  <https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/Afiliacion/10548/32825/625?changeLanguage=es>
- AEPD guidance for SMEs and GDPR documentation:
  <https://www.aepd.es/derechos-y-deberes/cumple-tus-deberes/directrices-de-aplicacion/pymes>
- AEPD personal-data breach guidance:
  <https://www.aepd.es/es/media/guias/guia-brechas-seguridad.pdf>
- Better Auth email verification and password reset:
  <https://better-auth.com/docs/concepts/email>
- Better Auth organization invitations:
  <https://better-auth.com/docs/beta/plugins/organization>
- Better Auth production rate limiting:
  <https://better-auth.com/docs/concepts/rate-limit>
- Stripe-hosted billing portal:
  <https://docs.stripe.com/customer-management>
- Stripe portal/webhook integration:
  <https://docs.stripe.com/customer-management/integrate-customer-portal>
- Stripe Tax in Checkout and subscriptions:
  <https://docs.stripe.com/payments/checkout/taxes>
- Stripe tax IDs on invoices:
  <https://docs.stripe.com/invoicing/taxes/account-tax-ids>
- Stripe integration/PCI guidance:
  <https://docs.stripe.com/security/guide>
- Email domain authentication overview:
  <https://www.cloudflare.com/learning/email-security/dmarc-dkim-spf/>

Re-check legal, tax, Stripe, and vendor requirements immediately before launch;
dates, product behavior, and official guidance can change.
