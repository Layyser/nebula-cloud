# Published HTTP services

The beta publication path exposes an HTTP process that is already listening in
a managed workspace. It does not provide Docker-in-Docker, start a service, or
publish a Worker/host port.

Inside a workspace:

```text
nubols expose 3000
nubols expose api 3000
nubols expose --ttl 1h api 3000
nubols expose --private --ttl 1h api 3000
nubols exposed
nubols unexpose api
```

The default service name is `app`. Names contain at most 32 lowercase letters,
numbers, and internal hyphens. Ports must be unprivileged; the Nebula Runtime
API port 7777 is always reserved.

`nubols expose` is the explicit public action. Publications expire after 24
hours unless `--ttl` selects a duration between 5 minutes and 7 days. An
expired publication is removed from lookup and active listings immediately and
no longer consumes the five-service quota; running the command again extends
it. `nubols expose --private` instead creates a token-protected endpoint and
prints this credential once:

```text
X-Nubols-Publication-Token: <generated-token>
```

Private mode is intended for API clients that can set a request header. The
token is rotated on every private update, never appears in listings or audit
metadata, and is stored only as a SHA-256 hash. The dedicated header is consumed
by Cloud and stripped before the application request reaches the workspace.

## Trust and routing boundary

The Worker injects the workspace ID, Cloud origin, rotating Runtime API token,
and authoritative command instructions. The CLI sends only the service name
and target port. Cloud verifies that token against the named workspace, stores
durable `published_service` desired state, creates an opaque 144-bit slug, and
records visibility, authentication policy, expiry, and publish/revoke audit
events without credentials. It accepts no Worker ID, container
address, host address, host port, or network selector from the workspace.

Without dedicated publication ingress, public requests use the same-origin
compatibility path:

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

When `NEBULA_PUBLISHED_SERVICE_ORIGIN=https://apps.nubols.com` is configured,
new and existing publication summaries instead return:

```text
https://<opaque-slug>.apps.nubols.com
```

The control plane accepts exactly one DNS label below the configured suffix.
The bare suffix and nested labels return 404 and cannot fall through to normal
Cloud API or authentication routes. The opaque slug still resolves through the
same durable ownership and revocation checks; no workspace or Worker selector
is encoded in DNS.

## Deployment

Set the Worker to the externally reachable HTTPS Cloud origin:

```text
NEBULA_WORKER_WORKSPACE_CONTROL_URL=https://app.nubols.com
```

The public reverse proxy must send both `/api/*` and `/p/*` to the control
plane. For dedicated hostnames, wildcard DNS and a wildcard certificate must
send `*.apps.nubols.com` to the same publication handler while preserving the
original Host header. Do not route the wildcard to Worker hosts. Vite proxies
`/p/*` in local web development, but it does not emulate wildcard DNS/TLS; a
container cannot use the host's `localhost`, so use a trusted HTTPS development
origin if testing the workspace command end to end.

Changing the publication instructions changes runtime contract version 5.
Replace existing workspace compute so it receives the current CLI, environment,
and system context; persistent `/home/nebula` data is preserved.

## Deliberate first-slice limits

- HTTP only; WebSocket upgrades, CONNECT, and TRACE are rejected.
- Five active publications per workspace.
- 32 MiB maximum request body.
- The application-layer wildcard hostname contract exists, but DNS, certificate
  issuance, and production ingress deployment are not completed here.
- No raw TCP/Minecraft/database publication yet. Private HTTP publication uses
  a generated header token; browser-oriented organization/session policy is not
  implemented.
- No global bandwidth/rate controls yet; those remain required before broad
  public availability.
