# Authenticated runtime gateway

The Cloud browser accesses Nebula only through:

```text
/api/workspaces/:workspaceId/runtime/*
```

The control plane resolves the private runtime and never exposes its address or
credentials to browser code.

## Authorization

Every request requires:

1. A valid Better Auth session.
2. A selected active organization.
3. A current database membership matching that user and organization.
4. The workspace owner, or an organization `admin`/`owner` role.
5. A workspace in `ready` state with a worker workspace identifier.

Membership and role are resolved for every request rather than copied into a
long-lived gateway session. Removing a member therefore revokes both Runtime
and Console access immediately. Missing, foreign, removed, unauthorized,
cross-organization, and guessed workspace IDs all resolve as
`workspace_not_found` without contacting the worker, avoiding a workspace-ID
enumeration oracle.

Administrative access is deliberately limited to Better Auth's `admin` and
`owner` organization roles. A regular member cannot access another member's
workspace, even within the same organization.

An absent, expired, or invalid Better Auth session token returns `401` before
workspace resolution, worker access, or private credential lookup. The same
precondition protects the Console WebSocket upgrade path.

## Credential boundary

```text
browser Cookie
  -> Cloud authorization
  -> worker service token
  -> private runtime address + runtime token
  -> Runtime API
```

Cloud session cookies, browser authorization headers, origin headers, proxy
headers, and browser `sec-*` headers are not forwarded to the runtime. The
gateway injects the worker-issued runtime bearer token. Runtime cookies,
authentication challenges, server headers, private CORS headers, and transfer
hop headers are not returned to the browser.

Cloud never transmits the long-lived worker signing secret. Each worker HTTP or
Console WebSocket request receives a 60-second HMAC credential bound to its
method and path. The private runtime address and generation-scoped runtime token
exist only in the control-plane request and are never serialized into a browser
response. Replacing a runtime rotates its token; the previous generation is no
longer reachable.

## Streaming and cancellation

The gateway does not buffer Runtime API bodies. It forwards each upstream
`ReadableStream` chunk as it arrives, preserving SSE token, tool, tool-result,
status, and completion ordering. There is no gateway wall-clock timeout, so
long-running turns and tools remain connected.

A gateway-owned abort signal spans worker lookup and the private runtime fetch.
Browser request cancellation aborts both stages. Once response headers have
been returned, cancelling the browser response also cancels the upstream body
and aborts its fetch explicitly, rather than depending on runtime-specific
stream garbage collection.

Reconnect requests to `/chat/:name/stream`, their query string, and
`Last-Event-ID` header pass through unchanged. Runtime termination after a
partial response becomes a downstream stream error; it is not converted into a
misleading successful completion.
