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
NEBULA_WORKSPACE_IMAGE
```

`NEBULA_WORKER_URL` and `NEBULA_WORKER_TOKEN` must be configured together.
The token is a private service credential and must never be exposed to the
browser. The worker image defaults to `nebula-workspace:dev` for local
development.

## Processing guarantees

- SQLite leases allow only one processor to own a job at a time.
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
