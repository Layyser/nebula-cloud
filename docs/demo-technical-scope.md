# Closed-demo technical scope

**Goal:** make Nubols credible enough to validate the customer problem without
building the production company, billing stack, worker fleet, or every roadmap
feature first.

## 1. The rule

Build the smallest real vertical slice behind each claim shown during the demo.
Do not build the complete product behind that slice.

The first closed demo does not need paid infrastructure. Build and rehearse the
complete vertical slice locally first. A real URL becomes useful only after the
workflow is reliable and an external prospect has scheduled a demo or needs a
follow-up environment. It still does not need public signup, Stripe, multiple
cloud providers, a polished organization dashboard, or production-grade
self-service service publication.

## 2. What must be real before customer demos

| Capability | Demo requirement | Not required yet |
|---|---|---|
| Domain and HTTPS | `demo.nubols.com` resolves to the demo deployment with valid TLS | Final production subdomain map, HSTS preload, multi-region failover |
| Authentication | Founder-created demo accounts or one controlled demo account | Public signup, email confirmation, password recovery, invitations |
| Organization | One seeded organization with two synthetic users/roles | Full membership lifecycle, enterprise roles, SSO |
| Operator | One persistent workspace can start, stop, reopen, and retain files | Worker fleet scheduler, migration, automated capacity placement |
| Chat and Console | Both operate against the exact same workspace | Every model/provider and complete mobile UX |
| Files | Upload and analyze one synthetic CSV; return a visible artifact | Production malware pipeline and arbitrary customer files |
| Personal usage | Show actual model turns/tokens for the current synthetic user | Invoicing-grade cost reconciliation and every provider metric |
| Organization usage | Owner sees the real sum and per-user breakdown for seeded users | Complex charts, budgets, exports, chargeback, alerts |
| Shared capability | Publish one capability to the demo organization; second user can discover and use it | Approval workflow, versions, marketplace, cross-organization sharing |
| Public service | Publish and revoke one public HTTP route, one token-protected HTTP route, and one raw TCP route through `nubols` | Custom domains, public databases without protocol-native credentials, unrestricted ports |
| Auditability | Record who published the capability/service and who generated usage | Complete compliance-grade audit explorer and retention controls |

Every unimplemented feature shown in conversation must be called “planned” or
“roadmap”. Do not place it in an apparently live dashboard.

## 3. Features explicitly deferred

- Stripe and paid entitlements.
- Public signup and production customer invitations.
- Multiple worker hosts or cloud providers.
- Nested Docker available to demo users.
- Public databases without protocol-native authentication and an explicit
  founder approval.
- Custom domains and arbitrary user-selected host ports.
- Organization budgets, provider-cost reconciliation, and invoices.
- Complete capability governance, approval, versions, or policy inheritance.
- Production customer data, credentials, private repositories, and workloads.

These are beta/production requirements, not demand-validation requirements.

## 4. Local-first environment and later infrastructure

### Phase A — EUR 0 local validation

Run the complete stack on the existing development machine:

```text
localhost / local test hostname
  ├── Nubols Web/control plane
  ├── one local Nubols Worker
  ├── seeded demo organization and synthetic users
  ├── persistent demo Operator workspace(s)
  └── local HTTP and allocated raw-TCP publication ingress
```

The local demo is enough to implement and verify:

- Chat/Console against the same persistent workspace;
- synthetic CSV upload and generated artifact;
- personal and organization usage read models;
- one organization-shared capability;
- public and private-token HTTP route creation and revocation semantics;
- allocated raw-TCP route creation and revocation semantics;
- cross-organization access denial;
- deterministic reset before every demo.

For the first discovery calls, screen-share this local environment. Do not give
prospects accounts or network access. This costs nothing and keeps unfinished
security boundaries off the public internet.

### Hosting purchase gate

Do not rent a server merely because the architecture will eventually need one.
Purchase hosting only when all of these are true:

1. the local demo completes twice from a clean reset without manual database
   edits or unexplained failures;
2. the founder has rehearsed the 12-minute script with at least two friendly
   technical reviewers;
3. at least one qualified external prospect has a scheduled demo, or a strong
   prospect requests a follow-up environment they can access;
4. the deployed surface has authentication, no production secrets/data, and no
   arbitrary public port exposure;
5. there is a one-command deploy/reset path and a hard EUR 60 monthly ceiling.

Technical status on 29 August 2026:

- Item 1 passed twice from clean state through `bun run demo:prove`.
- Item 4 passed locally with synthetic identities/data, an expiring 14-day beta
  entitlement, Worker-owned quota-enforced compute, and no host-port selection
  available to the workspace.
- The local reset/proof half of item 5 is implemented. The single-host purchase
  remains capped at one CX43-class server plus optional IPv4/backup, below EUR
  60/month.
- Items 2 and 3 are founder/customer actions and remain deliberately open. Do
  not rent the server before those signals exist merely to continue engineering.

The proof command creates an isolated Cloud database and email outbox, uses the
existing root-managed local Worker for the exact demo workspace only, and then
calls the Worker's guarded runtime and persistent-data deletion operations for
that workspace ID:

```bash
cd /home/jorge/nebula-cloud
bun run demo:prove
```

It proves two synthetic users and organization membership, entitlement denial
before a 14-day beta grant, runtime readiness and Chat routing, Console, real
`nubols --help`/`expose`/`ps`/`stop`, public HTTP, private HTTP token enforcement,
PostgreSQL SSL/startup negotiation and a Minecraft server-list ping over two
separate raw-TCP routes, usage aggregation, Contact Sales delivery to the filesystem transport,
and route revocation. Per-cycle JSON evidence is retained under the ignored
`.codex-tmp/demo-evidence/` directory.

For a friendly-reviewer screen-share, run `bun run demo:rehearse`. It performs
the same proof once, leaves the isolated services/workspace running, and writes
mode-`0600` synthetic login details under `.codex-tmp/demo-local/`. Finish with
`bun run demo:down`; this invokes the guarded Worker cleanup before removing the
local credentials and Cloud state.

### Phase B — hosted validation under EUR 60/month

### Recommended validation setup

```text
nubols.com DNS (Cloudflare Free)
  └── demo.nubols.com
        └── one x86 Hetzner Cloud server
              ├── reverse proxy + automatic TLS
              ├── Nubols Web/control plane
              ├── one Nubols Worker
              ├── demo Operator workspace(s)
              └── manually approved HTTP and raw-TCP demo routes
```

Use x86 for the first server because the runtime, container images, and nested
container plans are more likely to assume `amd64`. Do not choose an ARM instance
only to save a few euros before every image is multi-architecture.

A current Hetzner CX43-class shared x86 server provides 8 vCPU, 16 GB RAM, and
160 GB local SSD. Based on the provider's June 2026 price table it is roughly EUR
15.99/month before VAT and IPv4/backup extras. This leaves ample room beneath the
EUR 60 ceiling for backups or temporary scaling. Verify the checkout total before
ordering because location, VAT, IPv4, backups, and current pricing alter it.

Cloudflare authoritative DNS is available on its free plan. The demo does not
need paid Cloudflare, a load balancer, a second server, Stripe, or transactional
email.

### Spend ceiling

- One server only, with a hard provider budget alert.
- No automatic server creation or autoscaling.
- No paid observability platform initially; use system logs and basic health
  checks.
- Add provider snapshots/backups only after verifying that workspace data is
  included and a restore can be performed.
- Record every personally paid domain/server expense and invoice for possible
  treatment as a pre-incorporation expense; ask the gestor before reimbursement.

## 5. Minimum implementation contracts

### Usage events

Record one idempotent event per completed model turn:

```text
usage_event
  event_id UNIQUE
  organization_id
  membership_id
  workspace_id
  session_id
  provider / model
  input_tokens / output_tokens / cached_tokens
  occurred_at
```

Demo endpoints:

- `GET /api/usage/me` — current membership totals and recent sessions.
- `GET /api/organizations/:id/usage` — owner/admin-only totals and per-member
  breakdown.

Do not call an estimate “cost” unless a versioned provider price calculation is
actually implemented. Tokens and model turns are sufficient for validation.

### Shared capability

Add the smallest explicit scope model:

```text
capability
  owner_membership_id
  organization_id
  visibility = private | organization
  published_at / published_by
```

The demo must prove that user A publishes one safe capability and user B in the
same organization can discover and use it. Cross-organization access must fail.

### Published demo services

Use a founder-approved route record rather than arbitrary ports:

```text
published_service
  workspace_id
  slug
  internal_port
  state = active | revoked
  created_by / created_at
```

The HTTP gateway maps one hostname/path to the exact workspace and internal
port. Raw TCP uses an ingress-owned allocated port; the workspace cannot select
the external port. Both routes must be revocable and must not expose the Docker
socket, Worker API, control plane, container address, or arbitrary host ports.

## 6. Build order

1. Seed one local organization and two synthetic members.
2. Prove local Chat, Console, persistence, restart, and synthetic CSV upload end
   to end.
3. Add the minimal usage event and personal/organization read models.
4. Add one organization-published capability and cross-organization denial test.
5. Add locally routed public/private HTTP and raw-TCP demo services and test
   creation, authentication where applicable, listing, and revocation.
6. Use `bun run demo:prove` to restore and prove the local demo twice from known
   state before every hosted-demo release.
7. Run the local closed-demo script with two friendly technical reviewers.
8. Begin discovery calls by screen-sharing the local demo.
9. Only after the hosting purchase gate passes, provision the x86 demo server,
   connect `demo.nubols.com`, and deploy through the same repeatable path.
10. Run one hosted security/smoke review before sharing any URL externally.

## 7. Promotion gate

This deployment remains a founder-operated demo. It must not be promoted into a
customer beta without email ownership, invitations, entitlements, isolation
hardening, backups/restore, legal terms/privacy, abuse controls, and production
operations from `plan.md`.
