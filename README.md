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
|   |-- auth/             Better Auth boundary (implementation in CLOUD-03)
|   |-- contracts/        shared cloud HTTP contracts
|   `-- database/         PostgreSQL boundary (implementation in CLOUD-02)
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
- Organization dashboard and Operator templates
- Placeholder organization, governance, usage, and billing screens
- The shared runtime workspace with the cloud transport

`apps/control-plane` is deliberately small:

- A separately buildable Bun process
- Liveness, readiness, and versioned status endpoints
- No fake login, organization, billing, provisioning, or gateway behavior

`packages/auth` and `packages/database` only define dependency boundaries.
Better Auth starts in CLOUD-03 and PostgreSQL starts in CLOUD-02.

## Development

Install all workspace dependencies from the repository root:

```bash
bun install
```

Run the Web application:

```bash
cp apps/web/.env.example apps/web/.env
bun run dev
```

Run the control-plane scaffold separately:

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
/app                               organization dashboard
/app/operators                     deployed operators
/app/operators/demo/workspace      shared Nebula runtime UI
/app/organization                  organization backend placeholder
/app/governance                    governance placeholder
/app/usage                         usage placeholder
/app/billing                       billing placeholder
```

The control-plane scaffold listens on `127.0.0.1:7790` by default:

```text
GET /health/live
GET /health/ready
GET /internal/v1/status
```

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
