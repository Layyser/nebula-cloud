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

The gateway does not buffer Runtime API bodies. It passes request bodies
upstream and returns the upstream `ReadableStream` directly, preserving SSE
token and tool-event timing. The browser request signal is also used for the
worker lookup and runtime fetch, so cancellation and client disconnects abort
upstream work.

The local end-to-end proof received the first `/runs/events` SSE snapshot
through the authenticated Cloud URL before the long-lived stream closed.
GATEWAY-02 retains the broader validation matrix for active turns,
reconnection, runtime termination, and long-running tool requests.
