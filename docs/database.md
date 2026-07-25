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

`workspace.member_id` is unique, enforcing one personal workspace per
organization membership. Database insert and update guards additionally require
`workspace.organization_id` to match the organization on that Better Auth
membership, preventing a membership from being paired with another
organization even if application validation is bypassed.

The authenticated `POST /api/workspaces/personal` operation validates the
caller's membership and resolves the row inside an immediate SQLite
transaction. Repeated requests, page reloads, and duplicate attempts return the
same workspace identity. They cannot create a second personal workspace.

The table stores only durable product identity and desired lifecycle state.
Worker credentials, runtime instances, usage, and audit events will receive
tables only when those features are implemented. Provisioning jobs are the
first lifecycle records: they persist an idempotent `ensure_running` operation,
claim leases, retry timing, attempts, and bounded failure details. See
[`provisioning-jobs.md`](provisioning-jobs.md).

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
