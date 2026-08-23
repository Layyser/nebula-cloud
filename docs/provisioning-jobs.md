# Provisioning jobs

CLOUD-05 adds a durable SQLite work queue between authenticated product
requests and infrastructure changes. HTTP handlers record desired state; they
do not run Docker operations inline.

## Ensure running

The authenticated operation is:

```text
POST /api/workspaces/personal/ensure-running
Content-Type: application/json

{"organizationId":"..."}
```

The control plane validates the Better Auth session and organization
membership, resolves the member's one personal workspace, and performs one of
two actions:

- A ready workspace returns immediately with no job.
- Any other workspace is moved to `provisioning` and receives one active
  `ensure_running` job.

Repeated requests return the existing queued or running job. A partial unique
index enforces one active operation per workspace in SQLite, not only in
application memory.

## Job lifecycle

```text
queued -> running -> succeeded
   ^         |
   |         +-> queued       retryable failure
   |         |
   +---------+                expired lease recovery

running -> failed             terminal failure
```

A processor claims a job with an owner ID and an expiration time. Claiming
increments the durable attempt count. If the process stops before completing
the work, another processor may reclaim the job after the lease expires.

Completing a job requires the current lease owner:

- Success marks the job `succeeded` and the workspace `ready`.
- A retryable failure clears the lease, records a bounded diagnostic, and
  schedules the same job for a future time.
- A terminal failure marks both the job and workspace `failed`.

Historical succeeded and failed jobs remain available for diagnosis. Only
queued and running jobs participate in active-job deduplication.

## Ownership boundary

The processor that runs today claims available jobs and drives the worker
lifecycle API end to end:

1. Claims an available job.
2. Calls the authenticated worker lifecycle API.
3. Observes worker state and runtime readiness.
4. Completes or reschedules the job.

The job row contains product IDs and bounded error information. It must never
store worker credentials, runtime bearer tokens, container addresses, host
paths, or Docker identifiers.

