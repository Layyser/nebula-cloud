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
nubols expose --tcp minecraft 25565
nubols ps
nubols stop api
nubols --help
```

The default service name is `app`. Names contain at most 32 lowercase letters,
numbers, and internal hyphens. Ports must be unprivileged; the Nebula Runtime
API port 7777 is always reserved.

`nubols expose` is the explicit public action. Publications are permanent by
default; `--ttl` may select an expiry between 5 minutes and 7 days. An expired
publication is removed from lookup and active listings immediately and no
longer consumes the five-service quota; running the command again recreates it.
`nubols expose --private` instead creates a token-protected endpoint and
prints this credential once:

```text
X-Nubols-Publication-Token: <generated-token>
```

Private mode is intended for API clients that can set a request header. The
token is rotated on every private update, never appears in listings or audit
metadata, and is stored only as a SHA-256 hash. The dedicated header is consumed
by Cloud and stripped before the application request reaches the workspace.

Raw TCP publication is protocol-neutral and does not inject authentication or
rewrite the byte stream. PostgreSQL, Minecraft, and other applications must
authenticate using their own protocol. Nubols allocates the external TCP port
and routes it through an authenticated Cloud-to-Worker bridge to the exact
workspace port. TCP ingress is disabled unless explicitly enabled in the
control-plane deployment; the first slice applies route, per-route connection,
global connection, and idle-time limits.

The TCP command returns an allocated endpoint such as
`tcp://tcp.nubols.com:20000`; external clients connect to that host and port,
while Nubols forwards to the recorded internal port. DNS does not carry a TCP
port, so protocols that support SRV records may later receive a friendlier
hostname-only connection form.

The publication name (`app`, `api`, and so on) is only a route label. The final
argument is the actual HTTP port inside the current workspace; the application
must listen on `0.0.0.0:PORT`. The CLI does not accept an IP address, hostname,
container selector, or process name. `nubols stop NAME` revokes only that route
and does not terminate the listening process. Stopping a workspace makes its
routes unavailable without deleting them; permanent routes work again after
both the workspace and HTTP server are running, while workspace deletion
removes them.

## Trust and routing boundary

The Worker injects the workspace ID, Cloud origin, rotating Runtime API token,
and authoritative command instructions. The CLI sends only the service name
and target port. Cloud verifies that token against the named workspace, stores
durable `published_service` desired state, creates an opaque 144-bit slug, and
records visibility, authentication policy, optional expiry, and publish/revoke audit
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

The durable `publication` platform control is a fail-closed emergency gate.
While paused, HTTP requests and new raw-TCP connections are rejected and new
publication updates are denied, while listings and explicit service revocation
remain available. Existing records are retained for diagnosis and controlled
recovery. See the emergency controls section in
[`worker-connection.md`](worker-connection.md).

An authenticated platform operator can immediately revoke every publication in
one organization without deleting its workspaces:

```bash
curl --fail --request POST \
  http://127.0.0.1:7790/internal/v1/organizations/ORG_ID/publications/revoke \
  --header "Authorization: Bearer $NEBULA_PLATFORM_ADMIN_TOKEN" \
  --header "X-Nebula-Admin-Actor: admin@nubols.com" \
  --header "Content-Type: application/json" \
  --data '{"reason":"Organization credential compromise"}'
```

The database revocation is atomic across the organization. HTTP resolution
fails immediately; raw-TCP listeners are closed and active tunnels are
terminated. The ordinary `nubols stop NAME` path remains the narrower
service-specific revocation mechanism.

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

Changing the publication instructions changes runtime contract version 7.
Replace existing workspace compute so it receives the current CLI, environment,
and system context; persistent `/home/nebula` data is preserved.

## Deliberate first-slice limits

- HTTP publication requests reject WebSocket upgrades, CONNECT, and TRACE;
  raw TCP uses a separate allocated listener and is protocol passthrough.
- Five active publications per workspace and twenty active publications per
  organization. Only non-expired, non-revoked routes consume quota; expiry or
  revocation releases it. Deployments may tighten these bounds with
  `NEBULA_WORKSPACE_PUBLICATION_LIMIT` and
  `NEBULA_ORGANIZATION_PUBLICATION_LIMIT`.
- HTTP requests and raw TCP tunnels share one in-process connection budget.
  The defaults are 512 globally, 256 per worker, 64 per organization, and 32
  per route. `NEBULA_PUBLICATION_MAX_CONNECTIONS`,
  `NEBULA_PUBLICATION_MAX_CONNECTIONS_PER_WORKER`,
  `NEBULA_PUBLICATION_MAX_CONNECTIONS_PER_ORGANIZATION`, and
  `NEBULA_PUBLICATION_MAX_CONNECTIONS_PER_ROUTE` can tighten them. HTTP
  rejection is a stable `429` response; TCP excess is rejected before opening
  a worker tunnel.
- Upload and download bytes for both protocols share fixed-window bandwidth
  accounting. The default one-minute limits are 2 GiB globally, 1 GiB per
  worker, 256 MiB per organization, and 128 MiB per route. Configure the
  window and scopes with `NEBULA_PUBLICATION_BANDWIDTH_WINDOW_MS`,
  `NEBULA_PUBLICATION_BANDWIDTH_BYTES_PER_WINDOW`,
  `NEBULA_PUBLICATION_BANDWIDTH_BYTES_PER_WORKER_WINDOW`,
  `NEBULA_PUBLICATION_BANDWIDTH_BYTES_PER_ORGANIZATION_WINDOW`, and
  `NEBULA_PUBLICATION_BANDWIDTH_BYTES_PER_ROUTE_WINDOW`. A declared HTTP body
  that cannot fit is rejected with `429`; a chunked HTTP stream or raw TCP
  tunnel crossing a limit is terminated immediately.
- 32 MiB maximum request body.
- The application-layer wildcard hostname contract exists, but DNS, certificate
  issuance, and production ingress deployment are not completed here.
- Raw TCP publication is available only when explicitly enabled in the
  control-plane deployment. It is public protocol passthrough with no Nubols
  token; PostgreSQL, Minecraft, or another service must provide its own
  authentication. Browser-oriented organization/session policy is not
  implemented.
- The control plane reconciles the desired set of active, non-expired TCP
  routes every five seconds by default. Revoked or expired listeners are
  unbound and their active tunnels are closed; missed activations are retried.
  `NEBULA_TCP_PUBLICATION_RECONCILE_INTERVAL_MS` controls this interval.
- The first bandwidth counters are local to one control-plane process. A
  production multi-replica deployment must move the same atomic scopes into a
  shared rate-limit store before adding replicas.
