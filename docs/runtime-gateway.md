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
3. A current membership matching that organization.
4. The personal workspace owned by that exact member.
5. A workspace in `ready` state with a worker workspace identifier.

Missing, foreign, removed, cross-organization, and guessed workspace IDs all
resolve as `workspace_not_found` without contacting the worker.

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
