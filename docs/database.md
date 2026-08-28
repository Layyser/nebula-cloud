# SQLite persistence

Nebula Cloud starts with one SQLite database opened through Bun's built-in
`bun:sqlite` driver. This is intentionally simpler than operating PostgreSQL
before the product has enough traffic or data to require it.

## Ownership

Better Auth owns and migrates:

- `user`
- `session`
- `account`
- `verification`
- `organization`
- `member`
- `invitation`

The Better Auth organization plugin is enabled from the beginning so Nebula
does not create a competing organization or membership schema. Authentication
routes, login UI, sessions, organization selection, memberships, and invitation
records are implemented in CLOUD-03. Invitation email delivery remains
deferred; creating an invitation currently persists the Better Auth record.

Nebula owns:

- `nebula_migration`
- `workspace`
- `provisioning_job`
- `usage_event` (migrations 0005–0008)
- `organization_join_code` and `organization_member_state` (migration 0009)
- `audit_event`, `contact_request`, worker placement, and published-service state
- `entitlement` (migration 0018)
- `billing_customer`, `subscription`, and `stripe_event` (migration 0019)

`workspace.member_id` is unique, enforcing one personal workspace per
organization membership. Database insert and update guards additionally require
`workspace.organization_id` to match the organization on that Better Auth
membership, preventing a membership from being paired with another
organization even if application validation is bypassed.

The authenticated `POST /api/workspaces/personal` operation validates the
caller's membership and resolves the row inside an immediate SQLite
transaction. Repeated requests, page reloads, and duplicate attempts return the
same workspace identity. They cannot create a second personal workspace.

The tables store durable product identity, desired lifecycle state, usage
metering, organization governance, and provider-neutral billing authorization.
Worker credentials and runtime instances remain outside this database.
Provisioning jobs persist an idempotent `ensure_running` operation, claim
leases, retry timing, attempts, and bounded failure details. See
[`provisioning-jobs.md`](provisioning-jobs.md).

## Billing projection

Stripe is never queried during an Operator authorization request. A future
signed webhook adapter will verify and normalize a Stripe event, then pass it to
the database projection boundary. That boundary:

1. inserts the immutable Stripe event ID before applying business state;
2. deduplicates completed deliveries and allows failed deliveries to retry;
3. updates customer and subscription snapshots atomically; and
4. ignores an older snapshot using the event creation time and event ID as a
   deterministic tie-breaker.

The public `POST /api/webhooks/stripe` adapter exists only when
`STRIPE_WEBHOOK_SECRET` is configured. It preserves the raw body, caps it at
256 KiB, verifies Stripe's signature with the official Node SDK, and reveals no
verification details to the sender. The currently projected event set is:

- `customer.created` and `customer.updated`;
- `checkout.session.completed`; and
- `customer.subscription.created`, `.updated`, and `.deleted`;
- `invoice.paid` and `invoice.payment_failed`.

Customer, Checkout, or Subscription metadata must carry
`nubols_organization_id` until an existing Stripe customer mapping can resolve
the organization. Nubols subscriptions require exactly one Stripe Price, and
its quantity becomes the local `entitled_seats` snapshot.

Owners and admins explicitly assign the projected subscription quantity through
`PUT /api/organizations/:organizationId/entitlements/operator/:membershipId`
and remove an assignment with `DELETE` on the same route. A quantity reduction
below the current assignment count is rejected instead of silently choosing a
member to suspend.

The first `invoice.payment_failed` event starts one fixed 14-day grace period
for every assigned paid seat. Later failed retry events update the invoice
cursor but never extend that deadline. `invoice.paid` clears grace and restores
assigned seats when the subscription itself is active or trialing. At the grace
deadline the entitlement's effective end time blocks provisioning, Runtime,
Console, and HTTP/TCP publication access; workspace data is not deleted.

The inbox intentionally stores bounded processing metadata instead of the raw
webhook payload. Nubols only returns webhook success after projection; a crash
or failure therefore relies on Stripe redelivery (or an explicit resend) to
provide the signed payload again.

Stripe requires signature verification against the unmodified request body,
and documents subscription lifecycle events as asynchronous webhook signals:
[webhook signatures](https://docs.stripe.com/webhooks/signature) and
[subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).

## Runtime settings

The database package enables:

```text
foreign_keys = ON
busy_timeout = 5000
journal_mode = WAL        for file-backed databases
```

The control plane applies Better Auth migrations first, followed by Nebula
migrations, before it begins listening. Migrations are safe to run repeatedly.

## Configuration

```text
NEBULA_CLOUD_DATABASE_PATH=./data/nebula-cloud.sqlite
BETTER_AUTH_SECRET=<at least 32 random characters>
BETTER_AUTH_URL=http://127.0.0.1:7790
NEBULA_CLOUD_TRUSTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

Generate a production secret with:

```bash
openssl rand -base64 32
```

SQLite is a deployment choice for the first version, not a contract exposed to
the browser or worker. A future migration can replace the database package
without changing Nebula Core or `nebula-worker`.
