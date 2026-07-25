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
- Organization dashboard and Operator templates
- Placeholder organization, governance, usage, and billing screens
- The shared runtime workspace with the cloud transport

`apps/control-plane` is deliberately small:

- A separately buildable Bun process
- Liveness, readiness, and versioned status endpoints
- SQLite initialization before the process becomes ready
- Better Auth HTTP routes mounted under `/api/auth/*`
- No fake billing, provisioning, or gateway behavior

`packages/auth` configures Better Auth with Bun's built-in SQLite connection and
the organization plugin. Better Auth owns its user, session, account,
verification, organization, membership, and invitation migrations. The auth
HTTP routes and user-facing login and organization flow are implemented. Email
delivery for invitations and enterprise SSO remain intentionally deferred.

`packages/database` adds only Nebula's `workspace` table and a tiny migration
journal. One membership can own one workspace. Runtime instances, provisioning
jobs, credentials, usage, and audit tables remain deferred until their owning
features exist. See [`docs/database.md`](docs/database.md).

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

Validate the complete workspace:

```bash
bun test
bun run build
```

The Web routes remain:

```text
/                                  commercial landing
/login                             sign in or create an account
/app                               organization dashboard
/app/operators                     deployed operators
/app/operators/demo/workspace      shared Nebula runtime UI
/app/organization                  members and invitations
/app/governance                    governance placeholder
/app/usage                         usage placeholder
/app/billing                       billing placeholder
```

The control-plane scaffold listens on `127.0.0.1:7790` by default:

```text
GET /health/live
GET /health/ready
GET /internal/v1/status
ALL /api/auth/*                    Better Auth handler
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

Creating an invitation currently records it in SQLite but does not send email.
Transactional email, invitation acceptance screens, password recovery, email
verification, rate limiting, legal acceptance, and enterprise SSO are required
before a public launch. They are deliberately not simulated in the frontend.

## Security boundary

The browser will eventually send authenticated requests to the control plane:

```text
Browser
  -> /api/workspaces/:workspaceId/runtime/*
  -> authenticated cloud gateway
  -> private workspace address
  -> nebula --serve
```

The browser must never receive worker service credentials, runtime bearer
tokens, container addresses, Docker access, or host paths. The future gateway
will retrieve private runtime material from `nebula-worker` and proxy authorized
traffic server-side.

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
