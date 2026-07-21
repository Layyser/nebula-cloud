# Nebula Cloud

Commercial organization shell for Nebula operators. This repository owns the
public landing, organization experience, and the future control-plane backend.
It consumes the organization-agnostic runtime workspace from
`@nebula/runtime-ui`.

## Current template

The initial application includes:

- The Nebula commercial landing
- An organization dashboard shell
- Operator listing and a mock deployed operator
- Placeholder organization, governance, usage, and billing routes
- The shared runtime workspace mounted for the demo operator
- A cloud transport targeting `/api/workspaces/demo/runtime`

Authentication, persistence, provisioning, billing, and the runtime gateway
are deliberately not implemented yet. Placeholder screens make those ownership
boundaries explicit instead of simulating production behavior.

## Run locally

The runtime UI is linked from the adjacent `nebula-frontend` repository:

```bash
bun install
bun run dev
```

The development routes are:

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

The operator workspace expects a future control plane to proxy its runtime at
`/api/workspaces/demo/runtime`. The browser must never receive the container's
private address or runtime token.

## Backend breakpoint

The future backend belongs in `apps/control-plane` or a separately deployed
service within this repository. It will own:

- Organizations, memberships, roles, and authentication
- Operator records and lifecycle requests
- Shared agent and capability artifacts
- Billing, plans, quotas, usage aggregation, and audit history
- Short-lived browser sessions and runtime gateway authorization
- Worker scheduling records and private runtime addresses

It must not duplicate the model loop, tools, sessions, or agent engine from
Nebula Core.

## Runtime routing

```text
Browser
  -> /api/workspaces/:workspaceId/runtime/*
  -> authenticated cloud gateway
  -> private workspace address
  -> nebula --serve
```

Console traffic will use a separate worker-owned PTY endpoint:

```text
/api/workspaces/:workspaceId/console
```

## Shared UI development

For now, `@nebula/runtime-ui` is a local file dependency. This keeps both
applications independently buildable while the interface is evolving. Once
the boundary stabilizes, publish versioned `@nebula/runtime-ui`,
`@nebula/runtime-client`, and `@nebula/ui` packages rather than copying source
or using a git submodule.
