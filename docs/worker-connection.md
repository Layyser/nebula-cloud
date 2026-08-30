# Cloud-to-worker connection

CLOUD-06 connects the organization-aware control plane to the
organization-neutral Nebula Worker lifecycle API.

## Boundary

```text
authenticated member request
  -> SQLite provisioning_job
  -> leased control-plane processor
  -> authenticated nebula-worker desired-state API
  -> Docker workspace
```

The control plane owns authorization, durable jobs, retries, and product
workspace state. The worker owns XFS quota allocation, Docker lifecycle,
resource enforcement, private networking, runtime credentials, and readiness.
Neither service moves agent execution or tool behavior out of the Nebula
runtime binary.

## Configuration

The control plane reads:

```text
NEBULA_WORKER_URL
NEBULA_WORKER_TOKEN
NEBULA_WORKER_ID
NEBULA_WORKER_CREDENTIAL_KEY_ID
NEBULA_WORKER_CREDENTIALS_FILE
NEBULA_WORKSPACE_IMAGE
```

`NEBULA_WORKER_URL` and `NEBULA_WORKER_TOKEN` must be configured together.
The token is a private service credential and must never be exposed to the
browser. The worker image defaults to `nebula-workspace:dev` for local
development.

The legacy URL/token pair now seeds a durable `worker_host` registry entry.
Cloud stores only the credential key ID with that host; the secret remains in
the process environment. Additional workers resolve their key IDs from a
root-readable JSON object supplied through `NEBULA_WORKER_CREDENTIALS_FILE`:

```json
{
  "worker-fsn1-a-token": "a-random-secret-containing-at-least-32-characters",
  "worker-hel1-a-token": "a-different-random-secret-containing-at-least-32-characters"
}
```

The file is read once at startup. Rotate it atomically and restart the control
plane; never commit it or place its values in the database. A deployment secret
manager may materialize the same file. Additional capacity, polling, timeout,
and placement settings are listed in `apps/control-plane/.env.example`.

## Authenticated fleet health

The control plane polls every registered host through the HMAC-authenticated
`GET /internal/v1/status` endpoint. The worker reports readiness and aggregate
total/reserved memory, CPU, disk, and workspace slots from durable desired
state. Cloud rejects a worker whose reported ceilings differ from its
registered ceilings, persists a bounded 1,000-sample history per host, and
emits structured `worker_unavailable`, `worker_recovered`, and
`worker_heartbeat_stale` events. Failed connections do not advance the last
authenticated heartbeat.

Forward those JSON events from the service journal to the production alerting
sink. Health polling is defense in depth and does not replace private worker
networking or the canary checks required before beta.

## Fleet administration

Worker registration and lifecycle changes use the internal operational API,
not organization-admin sessions. Configure a separate deployment secret in
`NEBULA_PLATFORM_ADMIN_TOKEN`, keep the endpoint on the private control-plane
network, and send the secret as a bearer credential.

```bash
curl --fail --request POST http://127.0.0.1:7790/internal/v1/workers \
  --header "Authorization: Bearer $NEBULA_PLATFORM_ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{
    "id": "worker-fsn1-a",
    "name": "FSN1 worker A",
    "provider": "hetzner",
    "region": "fsn1",
    "baseURL": "https://worker-fsn1-a.internal:7780",
    "credentialKeyId": "worker-fsn1-a-token",
    "capacity": {
      "memoryBytes": 68719476736,
      "cpuMillis": 16000,
      "diskBytes": 536870912000,
      "workspaceSlots": 12
    }
  }'
```

Registration is unschedulable by default. After private connectivity and the
credential key have been verified, resume the host explicitly:

```bash
curl --fail --request PATCH \
  http://127.0.0.1:7790/internal/v1/workers/worker-fsn1-a \
  --header "Authorization: Bearer $NEBULA_PLATFORM_ADMIN_TOKEN" \
  --header "X-Nebula-Admin-Actor: admin@nubols.com" \
  --header 'Content-Type: application/json' \
  --data '{"action":"resume","reason":"Private connectivity and credentials verified"}'
```

The same endpoint accepts `drain`, `disable`, and `enable`. Draining rejects new
placements without moving or deleting assigned workspaces. Enabling leaves a
host unschedulable until it is explicitly resumed. Every lifecycle action
requires the actor header and a 1–256 character reason and appends a bounded,
immutable platform audit event. A configuration patch may
change the name, provider, region, URL, credential key reference, or capacity;
capacity cannot be reduced below existing reservations. List redacted registry
state with `GET /internal/v1/workers`. Worker secrets are never accepted by or
returned from these APIs.

## Platform emergency controls

The control plane stores three independent emergency controls in SQLite:

- `provisioning` rejects creation of new personal workspace assignments while
  continuing to resolve assignments that already exist.
- `workspace_start` rejects new starts and restarts. Already-ready workspaces
  and their runtime traffic remain available, and queued jobs remain queued
  without consuming an attempt until the control is resumed.
- `publication` rejects new publication updates and fails HTTP and new raw-TCP
  connections closed. Publication records are retained so service-specific
  revocation and a later controlled resume remain possible.

Controls survive control-plane restarts. Every mutation appends the actor,
control name, previous and requested state, result, bounded reason, and time to
`platform_control_audit_event`. The audit table rejects updates and deletes.
The API uses `NEBULA_PLATFORM_ADMIN_TOKEN` on the same private administration
network as fleet operations. Mutations also require an explicit
`X-Nebula-Admin-Actor` value and a 1–256 character reason.

```bash
curl --fail http://127.0.0.1:7790/internal/v1/platform-controls \
  --header "Authorization: Bearer $NEBULA_PLATFORM_ADMIN_TOKEN"

curl --fail --request PATCH \
  http://127.0.0.1:7790/internal/v1/platform-controls/workspace_start \
  --header "Authorization: Bearer $NEBULA_PLATFORM_ADMIN_TOKEN" \
  --header "X-Nebula-Admin-Actor: admin@nubols.com" \
  --header "Content-Type: application/json" \
  --data '{"paused":true,"reason":"Investigating worker instability"}'
```

Resume by sending the same request with `"paused":false` and a reason that
identifies the evidence used to reopen the operation. The three valid control
names are `provisioning`, `workspace_start`, and `publication`.

Worker lifecycle operations and organization-wide publication revocations are
recorded separately in the append-only `platform_operation_audit_event` table
with actor, action, target, result, bounded metadata, and timestamp.

## Processing guarantees

- SQLite leases allow only one processor to own a job at a time.
- Placement atomically reserves memory, CPU, disk, and one workspace slot on a
  recently healthy, schedulable host before the worker is called.
- Least-loaded placement is deterministic, draining hosts reject new
  assignments, and existing assignments remain sticky during transient health
  failures.
- Expired leases are reclaimed after process failure.
- Worker mutation keys derive from the durable Cloud job ID, so retries do not
  duplicate storage or compute.
- Retryable worker failures use bounded exponential backoff.
- Successful completion stores the worker workspace ID and marks the product
  workspace `ready` in the same database transaction.
- Terminal failure persists a stable code and sanitized message.

## Local host

A developer computer can be a worker host. The tested WSL setup uses:

```text
Worker API:       127.0.0.1:7780
State:            /home/jorge/.local/state/nebula-worker
Persistent data:  /home/jorge/.local/share/nebula-worker/workspaces
Storage:          sparse XFS image mounted with prjquota
Compute:          local Docker Engine
```

The worker runs as a root-owned system service because it must apply XFS
project quotas, assign the persistent tree to the container UID, and manage
Docker. Its API remains bound to loopback and requires a bearer token. The
Cloud control plane may remain an unprivileged user service.

The authenticated reverse proxy now consumes this connection. See
[`runtime-gateway.md`](runtime-gateway.md).
