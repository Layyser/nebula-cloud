# Nubols pre-server execution plan

This is the focused backlog that can be completed before renting the first
public Nubols server. The full product and launch contract remains in
`plan.md`; this file orders the local engineering work and keeps the boundary
between locally provable behavior and production-host evidence explicit.

## Completion rule

A local item is complete only when its implementation, negative-path tests,
and relevant repository validation pass. Production-dependent items are not
complete merely because they work through localhost, synthetic DNS, or a
development certificate. Every host-sensitive security test must be repeated
on the eventual production kernel.

## P0 — complete before server purchase

### 1. Worker containment stress suite

- [x] Prove a workspace fork bomb is stopped by its PID envelope and does not
      affect another workspace or the Worker API. The real-Docker pressure
      fixture reached `pids.max`, observed the kernel rejection counter, and
      kept both workspaces healthy on 30 August.
- [x] Prove workspace memory pressure is contained by the workspace cgroup and
      does not kill the Worker or another workspace. The fixture observed a
      cgroup OOM kill while the pressured workspace and peer stayed ready.
- [x] Prove workspace disk exhaustion is stopped by its XFS project quota and
      does not consume another workspace's allocation. The loopback-XFS probe
      exhausted one project while a peer project retained independent capacity.
- [x] Exercise image/build-cache pressure without allowing workspace-controlled
      data to exhaust unbounded host storage. Builds and caches are confined to
      the XFS-quota-controlled home; all world-writable system paths are bounded
      tmpfs mounts charged to the memory cgroup, and workspaces have no Docker
      socket or image/build-cache capability. The live `/tmp` exhaustion probe
      reached `ENOSPC` without affecting its peer.
- [x] Prove bounded workspace and browser logs cannot exhaust host storage. All
      Worker-managed containers retain at most three 10 MiB JSON log files; a
      live workspace rotated away an old marker after 36 MiB of output without
      affecting its peer.
- [x] Prove open-file limits are applied inside the workspace. All
      Worker-managed containers now receive a 4,096 soft/hard `nofile` limit;
      the live pressure fixture reached `EMFILE` and both workspaces stayed
      ready.
- [x] Prove restart persistence preserves the workspace home while replacing
      compute. The existing lifecycle smoke preserves files, Console state,
      sessions, and an installed Python environment across replacement.
- [x] Prove runtime/container crashes reconcile safely without creating a
      second workspace or losing persistent home data. Automatic process restart
      and explicit container-destruction reconciliation are covered by the live
      lifecycle fixture.
- [x] Record which checks are portable and which must be repeated on the
      production kernel, Docker version, filesystem, and cgroup configuration.
      Local evidence and production limitations are recorded in the Worker's
      `docs/workspace-isolation-validation.md`.

### 2. Operational kill switches

- [x] Add a global provisioning pause that rejects new assignments without
      damaging existing workspaces. The durable control still resolves existing
      assignments and survives a control-plane restart.
- [x] Add a global workspace-start pause that leaves already-running workspaces
      untouched unless an operator explicitly stops them. Queued jobs stay
      queued without consuming attempts and restart requests fail closed.
- [x] Verify per-worker disable and drain behavior through the administration
      API and add any missing emergency-stop action. `drain` preserves existing
      assignments while rejecting placement; `disable` is the stronger
      worker-specific scheduling stop.
- [x] Add a global publication pause and immediate per-organization/service
      revocation path. Organization-wide revocation atomically removes all
      routes, closes TCP listeners, and terminates active TCP tunnels; the
      service-specific path remains available through `nubols stop`.
- [x] Audit every kill-switch change with actor, target, result, and bounded
      metadata. Global controls and worker/organization emergency actions use
      append-only platform audit tables with mutation guards.

### 3. Publication limits and abuse controls

- [x] Enforce per-organization and per-workspace published-service limits.
      The defaults are five active routes per workspace and twenty per
      organization, both deployment-configurable. Revoked and expired routes
      release quota, and quota rejection has a stable API error code.
- [x] Enforce global, per-worker, per-organization, and per-route connection
      limits for HTTP and raw TCP. Both protocols share the same configured
      limiter, HTTP capacity is held until the response body closes, and TCP
      capacity is held for the complete tunnel lifetime.
- [x] Add bounded bandwidth accounting and rejection behavior. Both transfer
      directions for HTTP and TCP consume configurable global, worker,
      organization, and route fixed-window budgets. Known oversized uploads
      receive `429`; live streams and tunnels are terminated at the boundary.
      The current counter store is intentionally single-process and documented
      as needing a shared atomic backend before horizontal control-plane scale.
- [x] Reconcile expiry and revocation without waiting for a process restart.
      HTTP lookup already rejects expired state per request; a periodic TCP
      desired-state reconciler now activates missed routes and unbinds revoked
      or expired listeners, closing their active tunnels in the process.
- [x] Block workspace egress to cloud metadata endpoints and private control
      networks. The Worker's opt-in strict production mode installs host-owned
      `DOCKER-USER` rules before reconciliation and fails startup when it cannot;
      a control endpoint needs an explicit exact CIDR/port exception.
- [x] Block SMTP abuse, scanning, reflection/amplification traffic, and other
      prohibited outbound patterns without blocking required model APIs. The
      same policy leaves public HTTP/HTTPS/QUIC and embedded DNS available,
      rejects SMTP and common reflection ports, and rate-limits outbound SYNs.
      Live validation is explicitly repeated on the production host.
- [ ] Define and test the stricter database-publication contract: TLS,
      application-native generated credentials, bounded expiry, connection
      limits, and optional source-IP allowlists.
- [x] Prove local HTTP, database, and Minecraft/raw-TCP publication against the
      same ownership and revocation contracts used in production. Two clean
      `demo:prove` cycles passed with public/private HTTP, PostgreSQL
      SSL/startup negotiation, a Minecraft server-list ping, listing,
      entitlement/ownership checks, revocation, and guarded teardown.

### 4. Invitations and email diagnostics

- [x] Add the `/invite` acceptance route and deterministic pending, accepted,
      expired, already-used, wrong-account, and error states. Acceptance selects
      the invited organization and returns to the app.
- [x] Require the signed-in email address to match the invitation recipient.
      Better Auth enforces it during acceptance, and the status endpoint reveals
      invitation details only after the same case-insensitive match.
- [x] Remove stale UI copy claiming invitation delivery is not connected when a
      transactional sender is configured. The organization UI now reports that
      the invitation was sent and the user documentation describes the flow.
- [x] Add an `email_delivery` diagnostic table that stores provider IDs and
      status but never message bodies. Recipient addresses are represented only
      by a keyed hash; subjects, bodies, and one-time links are never persisted.
- [x] Verify signed transactional-provider webhooks for delivered, delayed,
      bounced, complained, and suppressed events. Resend/Svix signatures and
      timestamps are checked against the raw bounded body before projection.
- [x] Suppress unsafe retries after a permanent bounce or complaint. Terminal
      bounce, complaint, and suppression state prevents a later provider call
      for the same keyed recipient.
- [x] Add dedicated expired/already-used verification and reset-link states.
      Verification callbacks now land on a purpose-built result view, while
      invalid reset tokens replace the password form with a safe fresh-link
      action instead of exposing a generic provider error.
- [x] Add per-IP and per-address limits for signup, login, reset, resend, and
      invitations while preserving non-enumerating recovery responses. The
      durable fixed-window buckets retain only keyed hashes; recovery and
      verification resend return the same success shape after suppression, and
      forwarded addresses are trusted only from an explicitly enabled local
      reverse proxy.

### 5. Audit, usage, retention, and deletion

- [ ] Complete audit coverage for authentication, invitations, role changes,
      provisioning lifecycle, Console opens, publication, billing, and deletion.
- [x] Define UTC storage, organization-local display, aggregation windows, and
      delayed-event behavior. `docs/beta-data-lifecycle.md` fixes UTC storage
      and daily attribution, separates event/receipt time, and requires honest
      estimated/delayed presentation.
- [ ] Define and enforce beta retention for detailed usage, audit, application
      logs, contact requests, and workspace deletion.
- [ ] Add organization usage CSV export and billing/invoice export contracts.
      The bounded, admin-authorized, formula-safe usage CSV is implemented;
      invoice export intentionally waits for complete Stripe invoice projection
      rather than synthesizing financial documents from estimated usage.
- [x] Add log-redaction tests for prompts, tokens, authorization headers,
      provider credentials, worker addresses, workspace paths, and Console data.
      Structured error paths now pass through a bounded redactor, startup logs
      omit database and listener addresses, and bootstrap output omits email.
- [ ] Add account export/deletion and organization export/deletion requests with
      a reviewed delayed workspace-destruction workflow.

### 6. Recovery, security review, and operations

- [x] Add a SQLite-aware control-plane backup command. `backup:control-plane`
      validates the live source, creates a consistent `VACUUM INTO` snapshot,
      validates it again, applies private permissions, and emits a versioned
      SHA-256/migration manifest for off-host transfer and restore evidence.
- [x] Add a workspace-volume backup fixture and encrypted off-host-compatible
      archive format. The Worker now builds `nebula-workspace-backup`, which
      streams tar/gzip directly through chunked AES-256-GCM, emits a private
      SHA-256 manifest, and rejects wrong keys, tampering, unsafe paths,
      symlink traversal, special files, and non-empty restore destinations.
- [x] Restore the control plane and a workspace into an isolated local
      environment and retain machine-readable evidence. `recovery:drill`
      performs both synthetic restores and emits a versioned JSON result; the
      first passing local record is retained with its dirty-tree and
      production-host limitations stated explicitly.
- [x] Define honest beta RPO/RTO and the data that each target covers. The
      private-beta engineering targets are 6h/8h for control-plane state and
      24h/24h for workspace homes, with disposable compute and in-flight state
      explicitly excluded and no external SLA before timed production drills.
- [x] Threat-model browser, control plane, Worker, container, model provider,
      publication ingress, and malicious-member boundaries. The model records
      assets, controls, residual risks, abuse assumptions, and release evidence
      across every named boundary.
- [ ] Run dependency, secret, image, and host-configuration scans. Local Bun
      and reachable Go findings are clean after remediation, and the narrow
      tracked-secret scan found zero candidates. Image scanning is unavailable
      locally and host scanning correctly waits for the production server, so
      this combined gate remains open.
- [x] Add CI gates for all four repositories, image contracts, migrations,
      integration smoke tests, and secret scanning. Each repository now has a
      native test/build/secret workflow; Worker additionally runs contracts,
      integration tests, reachable-Go/fs scans, builds the real agent-backed
      workspace image, and blocks on high/critical image findings.
- [x] Write runbooks for rollback, worker drain/loss, stuck jobs, full disk,
      corrupt database, restore, email outage, Stripe outage, and breach. Each
      path uses the durable controls and forbids unsafe empty-workspace or
      manual-state shortcuts.
- [x] Prepare reproducible reverse-proxy, service, firewall, environment, and
      rollback configuration without claiming it has been production-proven.
      The strict Nginx/systemd/nftables/env bundle is under `deploy/`, with
      placeholders and host-validation/rollback limitations explicit.

## P1 — valuable before the server, but not required for the free demo

### 7. Stripe sandbox completion

- [ ] Create the sandbox product and recurring seat price.
- [ ] Create one Stripe Customer per organization.
- [ ] Implement hosted Checkout and the Customer Portal.
- [ ] Complete successful-checkout, invoice paid/failed, subscription lifecycle,
      customer, and tax-detail event coverage.
- [ ] Test success, SCA, decline, delayed payment, duplicate/reordered webhook,
      cancellation, refund, and tax-ID updates through Stripe test mode.
- [ ] Keep paid access disabled until company, tax, invoice, and live-account
      requirements are complete.

### 8. Demo and validation preparation

- [x] Select AI-native software agencies and small SaaS engineering teams as the
      initial customer hypothesis.
- [x] Prepare the first list of 30 founder-reachable prospects in
      `companies-plan.md`.
- [x] Complete the repeatable synthetic technical proof through
      `bun run demo:prove`.
- [ ] Turn the proof into one rehearsed 12-minute founder demo with a strict
      synthetic-data boundary and recovery path.
- [ ] Create the private outreach evidence tracker.
- [ ] Prepare the architecture/security page, concise Why Nubols page, first-use
      documentation, and an honest comparison page.
- [ ] Prepare the 90-second product video and short cuts only after the demo flow
      and publication claims are stable.

### 9. Legal and external-account preparation

- [ ] Review the founder's employment, confidentiality, moonlighting, and IP
      obligations before outreach references the employer.
- [ ] Prepare draft Terms, Privacy, DPA, AUP, AI disclosure, retention schedule,
      subprocessor inventory, rights procedure, and vulnerability disclosure.
- [ ] Keep company identity, NIF, registry, tax, invoice, and counsel-approved
      fields explicitly incomplete until incorporation and review.
- [ ] Finish mailbox aliases, hardware-backed MFA, recovery codes, SPF, DKIM,
      DMARC, and transactional-domain configuration independently of the server.

## Requires the real server or public infrastructure

- [ ] Deploy `app.nubols.com` with the real reverse proxy, secure cookies,
      trusted proxies, HTTPS, WebSocket forwarding, and security headers.
- [ ] Configure wildcard DNS and certificate automation for
      `*.apps.nubols.com`.
- [ ] Expose the allocated raw-TCP ingress for `*.tcp.nubols.com` and add
      protocol-specific SRV records where useful.
- [ ] Connect real hosts through WireGuard/private networking and keep Worker
      APIs off the public internet.
- [ ] Register two real workers, deploy digest-pinned images, and run canary
      workspaces on each.
- [ ] Repeat the complete isolation and exhaustion suite on the production
      kernel, Docker, cgroup, filesystem, and storage configuration.
- [ ] Prove HTTPS API, database, and Minecraft/raw-TCP publication from an
      unrelated public network, including restart, expiry, revocation, wrong
      target, credential rotation, worker drain, and outage behavior.
- [ ] Enable encrypted production volumes and daily encrypted off-host backups;
      complete and record a production restore drill.
- [ ] Enable production monitoring, alerts, status communication, synthetic
      journeys, and deploy rollback evidence.
- [ ] Run real Gmail, Outlook, and Apple/iCloud deliverability tests after DNS
      authentication is active.

## Current execution order

1. Worker containment stress suite.
2. Operational kill switches.
3. Publication quotas and abuse controls.
4. Invitation acceptance and email diagnostics.
5. Audit, retention, deletion, and exports.
6. Local backup/restore and operational runbooks.
7. Stripe sandbox and demo assets while waiting for infrastructure.
