# Nebula Cloud

Commercial organization shell and control plane for Nebula. This repository
owns the public landing, authentication boundary, organizations, workspace
provisioning, governance, usage, and billing. It does not contain the agent
engine or container implementation.

## Repository layout

```text
nebula-cloud/
|-- apps/
|   |-- web/              commercial landing and organization Web UI
|   `-- control-plane/    private Bun HTTP service
|-- packages/
|   |-- auth/             Better Auth configuration and migrations
|   |-- contracts/        shared cloud HTTP contracts
|   `-- database/         SQLite connection and Nebula migrations
|-- pricing.md
`-- package.json          Bun workspace orchestration
```

The Web application continues to consume `@nebula/runtime-ui` from the adjacent
`/home/jorge/nebula-frontend` checkout. Runtime chat, sessions, agents,
capabilities, and tool presentation are shared; they are not copied into this
repository.

## Current implementation

`apps/web` includes:

- The latest commercial Nebula landing from before the standalone/cloud split
- Email/password sign-up and sign-in backed by Better Auth
- Session-protected cloud routes and explicit sign-out
- Organization creation, selection, memberships, roles, and invitations
- Membership-scoped personal workspace resolution with no browser fallback ID
- The shared runtime workspace as the authenticated application root
- The exact standalone New Session, Agents, Capabilities, Search, and
  workspace-grouped Sessions UI
- A host-provided Dashboard inside the shared runtime shell
- Authenticated user and organization identity in the shared sidebar footer

`apps/control-plane` is deliberately small:

- A separately buildable Bun process
- Liveness, readiness, and versioned status endpoints
- SQLite initialization before the process becomes ready
- Better Auth HTTP routes mounted under `/api/auth/*`
- Authenticated personal-workspace resolution under `/api/workspaces/personal`
- Durable ensure-running jobs under
  `/api/workspaces/personal/ensure-running`
- An authenticated Nebula Worker client and durable provisioning processor
  that drives queued personal workspaces to `ready`
- An authenticated streaming Runtime API gateway that resolves private
  container access server-side
- No fake billing or production gateway behavior

`packages/auth` configures Better Auth with Bun's built-in SQLite connection and
the organization plugin. Better Auth owns its user, session, account,
verification, organization, membership, and invitation migrations. The auth
HTTP routes and user-facing login and organization flow are implemented. Email
delivery for invitations and enterprise SSO remain intentionally deferred.

`packages/database` owns Nebula's `workspace` and `provisioning_job` tables plus
a tiny migration journal. One membership can own one workspace, and database
guards require that workspace to belong to the same organization as the
membership. Durable provisioning jobs deduplicate ensure-running requests and
support leases, retries, and restart recovery without Redis. Runtime instances,
credentials, usage, and audit tables remain deferred until their owning
features exist. See [`docs/database.md`](docs/database.md) and
[`docs/provisioning-jobs.md`](docs/provisioning-jobs.md). The worker connection,
retry boundary, and local-host setup are documented in
[`docs/worker-connection.md`](docs/worker-connection.md).
The browser-to-runtime security and streaming boundary is documented in
[`docs/runtime-gateway.md`](docs/runtime-gateway.md).

## Development

Install all workspace dependencies from the repository root:

```bash
bun install
```

Run the Web application:

```bash
cp apps/web/.env.example apps/web/.env
bun run dev:web
```

Run the control plane in a second terminal:

```bash
cp apps/control-plane/.env.example apps/control-plane/.env
bun run dev:control-plane
```

To enable real provisioning, configure the ignored control-plane `.env`:

```text
NEBULA_WORKER_URL=http://127.0.0.1:7780
NEBULA_WORKER_TOKEN=<same private service token as nebula-worker>
NEBULA_WORKSPACE_IMAGE=nebula-workspace:dev
```

If the URL and token are absent, the control plane remains usable for
authentication and workspace metadata but does not consume provisioning jobs.

For local development, add `NEBULA_BOOTSTRAP_NAME`,
`NEBULA_BOOTSTRAP_EMAIL`, and `NEBULA_BOOTSTRAP_PASSWORD` to the ignored
control-plane `.env`, then create or verify that account with:

```bash
bun run --cwd apps/control-plane bootstrap
```

Validate the complete workspace:

```bash
bun test
bun run build
```

The Web routes remain:

```text
/                                  commercial landing
/login                             sign in or create an account
/app                               personal Operator and shared runtime UI
```

In local development, Vite forwards the public Cloud route to the real control
plane gateway:

```text
/api/workspaces/:workspaceId/runtime/*
  -> http://127.0.0.1:7790
  -> private workspace Runtime API
```

Vite does not read a Nebula runtime token or connect to port 7777. Better Auth
cookies reach the control plane, which verifies workspace ownership and active
organization membership before retrieving private runtime access from the
worker.

The control-plane scaffold listens on `127.0.0.1:7790` by default:

```text
GET /health/live
GET /health/ready
GET /internal/v1/status
ALL /api/auth/*                    Better Auth handler
POST /api/workspaces/personal     Resolve the signed-in member's workspace
POST /api/workspaces/personal/ensure-running
                                  Durably request a ready workspace
ALL /api/workspaces/:id/runtime/* Authenticated Runtime API gateway
```

Its default development database is
`apps/control-plane/data/nebula-cloud.sqlite`. Set
`NEBULA_CLOUD_DATABASE_PATH` to an explicit persistent path in deployment.
`BETTER_AUTH_SECRET` is required and must contain at least 32 characters.
`NEBULA_CLOUD_TRUSTED_ORIGINS` is a comma-separated allowlist for browser
origins. The development default accepts Vite on `localhost:5173` and
`127.0.0.1:5173`.

## Authentication scope

CLOUD-03 establishes the basic cloud identity boundary:

- Email/password account creation and sign-in
- Cookie-backed sessions
- Protected `/app` routes
- Organization creation and active-organization selection
- Owner, admin, and member roles managed by Better Auth
- Membership and pending-invitation views

CLOUD-04 builds on that boundary: after an active organization is selected,
the Web application asks the control plane for the authenticated membership's
personal workspace. The database creates it once and returns the same stable ID
thereafter. The shared Runtime UI is not mounted until that resolution
succeeds.

CLOUD-05 persists idempotent ensure-running jobs. CLOUD-06 runs a lease-based
processor in the control plane, authenticates every desired-state request to
`nebula-worker`, uses stable per-job worker idempotency keys, retries transient
failures with bounded exponential backoff, and atomically records the final
workspace state. The browser never receives the worker token.

Creating an invitation currently records it in SQLite but does not send email.
Transactional email, invitation acceptance screens, password recovery, email
verification, rate limiting, legal acceptance, and enterprise SSO are required
before a public launch. They are deliberately not simulated in the frontend.

## Security boundary

The browser sends authenticated requests to the control plane:

```text
Browser
  -> /api/workspaces/:workspaceId/runtime/*
  -> authenticated cloud gateway
  -> private workspace address
  -> nebula --serve
```

The browser never receives worker service credentials, runtime bearer tokens,
container addresses, Docker access, or host paths. The gateway retrieves
private runtime material from `nebula-worker`, replaces browser credentials
with the runtime bearer token server-side, and streams the sanitized response.

Console traffic remains a separate worker-owned PTY route:

```text
/api/workspaces/:workspaceId/console
```

## Ownership boundaries

- `nebula-cloud` owns commercial and organization business logic.
- `nebula-frontend` owns reusable, organization-neutral runtime UI.
- `agentic` owns the standalone Nebula binary and Runtime API.
- `nebula-worker` owns containers, persistent workspace storage, resource
  isolation, and Console PTYs.

The control plane may request desired workspace state from the worker. It must
not duplicate model execution, tools, sessions, agent configuration, or Docker
lifecycle code.
