# Published HTTP services

The beta publication path exposes an HTTP process that is already listening in
a managed workspace. It does not provide Docker-in-Docker, start a service, or
publish a Worker/host port.

Inside a workspace:

```text
nubols expose 3000
nubols expose api 3000
nubols exposed
nubols unexpose api
```

The default service name is `app`. Names contain at most 32 lowercase letters,
numbers, and internal hyphens. Ports must be unprivileged; the Nebula Runtime
API port 7777 is always reserved.

## Trust and routing boundary

The Worker injects the workspace ID, Cloud origin, rotating Runtime API token,
and authoritative command instructions. The CLI sends only the service name
and target port. Cloud verifies that token against the named workspace, stores
durable `published_service` desired state, creates an opaque 144-bit slug, and
records publish/revoke audit events. It accepts no Worker ID, container
address, host address, host port, or network selector from the workspace.

Public requests currently use the same-origin path:

```text
https://app.nubols.com/p/<opaque-slug>
```

Cloud resolves an active slug to its workspace and port. Its authenticated
Worker client forwards the request to the Worker's private service endpoint;
the Worker inspects the exact ready workspace and derives its current private
container address. Revocation removes the slug from routing immediately.

Application Authorization and Cookie headers are preserved, but Cloud's Worker
credential travels separately and is removed before the application receives
the request. Internal and hop-by-hop response headers are removed while
application status, body, redirects, and cookies are preserved.

## Deployment

Set the Worker to the externally reachable HTTPS Cloud origin:

```text
NEBULA_WORKER_WORKSPACE_CONTROL_URL=https://app.nubols.com
```

The public reverse proxy must send both `/api/*` and `/p/*` to the control
plane. Vite proxies `/p/*` in local web development, but a container cannot use
the host's `localhost`; use a trusted HTTPS development origin if testing the
workspace command end to end.

Changing the Worker control URL changes runtime contract version 4. Replace
existing workspace compute so it receives the CLI environment and current
workspace image; persistent `/home/nebula` data is preserved.

## Deliberate first-slice limits

- HTTP only; WebSocket upgrades, CONNECT, and TRACE are rejected.
- Five active publications per workspace.
- 32 MiB maximum request body.
- No wildcard hostname, raw TCP/Minecraft/database publication, TTL, or
  per-service authentication policy yet.
- No global bandwidth/rate controls yet; those remain required before broad
  public availability.

