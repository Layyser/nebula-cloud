# Nebula system repository guide

This file is intentionally identical in `nebula-agent`, `nebula-frontend`,
`nebula-worker`, and `nebula-cloud`. It describes the system boundary and the
current local release/update procedure. Repository-specific detail belongs in
that repository's `README.md` and `docs/`.

## Repository map

| Repository | Local checkout | GitHub repository | Owns |
| --- | --- | --- | --- |
| `nebula-agent` | `/home/jorge/nebula-agent` | `Layyser/nebula-agent` | The C++ `nebula` binary: model protocols/providers, agent loop, sessions, tools, capabilities, hooks, built-in TUI, local security, and the organization-neutral Runtime API exposed by `nebula --serve`. |
| `nebula-frontend` | `/home/jorge/nebula-frontend` | `Layyser/nebula-frontend` | The standalone Web/Tauri app and reusable `@nebula/runtime-ui` package: chat, sessions, agents, capabilities, shared sidebar, runtime settings, and transport interfaces. |
| `nebula-worker` | `/home/jorge/nebula-worker` | `Layyser/nebula-worker` | Workspace infrastructure: image construction, containers, persistent homes, resource/isolation policy, runtime supervision, lifecycle reconciliation, and Console PTYs. |
| `nebula-cloud` | `/home/jorge/nebula-cloud` | `Layyser/nebula-cloud` | The commercial product: landing/login, Better Auth, organizations, memberships, dashboard/usage, billing/governance, control plane, authenticated runtime/console gateways, and workspace lifecycle orchestration. |

The executable remains named `nebula`; the repository that builds it is
`nebula-agent`. “Operator” is product language for a member plus their
persistent workspace. An agent is a runtime configuration, not an Operator.

## Dependency direction

```text
nebula-cloud
  ├── consumes @nebula/runtime-ui produced by nebula-frontend
  └── calls nebula-worker through its authenticated internal API

nebula-worker
  └── builds nebula-agent into the immutable workspace image

nebula-frontend
  └── talks to nebula-agent through the Runtime API

nebula-agent
  └── depends on none of the other three repositories
```

Keep these boundaries strict:

- Put model execution, tools, sessions, runtime configuration, and neutral HTTP
  endpoints in `nebula-agent`.
- Put reusable runtime UI in `nebula-frontend`; never copy it into Cloud.
- Put organizations, identity, billing, usage aggregation, and gateways in
  `nebula-cloud`.
- Put Docker/Kubernetes, volumes, quotas, private networking, image/runtime
  lifecycle, and PTYs in `nebula-worker`.
- Browsers never receive worker credentials, runtime tokens, container
  addresses, or container-engine access.
- The worker never owns users, organizations, billing, or agent behavior.

## Validate each repository

Run commands inside WSL. Validate the owner repository and every downstream
consumer affected by a change.

```bash
# Agent binary and Runtime API
cd /home/jorge/nebula-agent
make -j2 test

# Shared runtime UI and standalone app
cd /home/jorge/nebula-frontend
/home/jorge/.bun/bin/bun test
/home/jorge/.bun/bin/bun run build

# Worker
cd /home/jorge/nebula-worker
make test
make integration
make image-contract
make browser-image-contract
make build

# Cloud Web, control plane, and shared packages
cd /home/jorge/nebula-cloud
/home/jorge/.bun/bin/bun test
/home/jorge/.bun/bin/bun run build
```

## Propagate a new nebula-agent version into Cloud

The worker image compiles `nebula-agent` through a BuildKit named context.
Building the binary alone does not change an existing workspace container.

```bash
cd /home/jorge/nebula-agent
make -j2 test
make -j2 nebula

VERSION="$(git rev-parse --short HEAD)"
cd /home/jorge/nebula-worker
NEBULA_CORE_DIR=/home/jorge/nebula-agent \
NEBULA_WORKSPACE_IMAGE="nebula-workspace:$VERSION" \
NEBULA_IMAGE_VERSION="$VERSION" \
make workspace-image

docker image inspect "nebula-workspace:$VERSION" >/dev/null
```

Then set the control plane's ignored environment file to the immutable tag:

```text
NEBULA_WORKSPACE_IMAGE=nebula-workspace:<agent-commit>
```

Restart the local control plane after changing its environment:

```bash
systemctl --user restart nebula-cloud-control-plane
systemctl --user status nebula-cloud-control-plane --no-pager
```

New workspaces now use the new image. Existing workspaces do **not**: restarting
a container keeps its old image. They require the worker's replacement
operation, which preserves `/home/nebula` while replacing compute. The worker
already implements that operation, but Cloud does not yet expose a fleet
release/rollout command. Until that command exists, do not claim an agent
release is fully deployed merely because the image was built or the container
was restarted.

### Local workspace rollout

Local development pins the mutable `nebula-workspace:dev` tag in the worker and
control plane. Rebuilding the image under that same tag leaves the worker's
desired spec hash unchanged, so its replacement operation (`force=false`)
short-circuits and restarting the container or the worker keeps the old image.

`nebula-worker/scripts/rollout-workspace.sh` rebuilds the agent and the image,
then forces a replacement for the target workspaces through the worker's
restart operation (`force=true`), preserving each workspace's persistent
`/home/nebula` data volume while replacing compute:

```bash
cd /home/jorge/nebula-worker
./scripts/rollout-workspace.sh --all            # every worker workspace
./scripts/rollout-workspace.sh <workspace-id>   # a specific workspace
```

The script signs requests with `NEBULA_WORKER_TOKEN` (falling back to
`nebula-worker/.env`) and verifies each replacement container runs the freshly
built image. Override the image tag with `NEBULA_WORKSPACE_IMAGE` when rolling
out an immutable, versioned tag instead.

## Propagate nebula-frontend into nebula-cloud

Cloud consumes an immutable tarball of `@nebula/runtime-ui`, not the sibling
source tree. Bump the package version in
`/home/jorge/nebula-frontend/package.json`, then run:

```bash
cd /home/jorge/nebula-frontend
/home/jorge/.bun/bin/bun test
/home/jorge/.bun/bin/bun run build
/home/jorge/.bun/bin/bun pm pack --destination /home/jorge/nebula-cloud/vendor

VERSION="$(
  /home/jorge/.bun/bin/bun -e \
  "console.log(require('/home/jorge/nebula-frontend/package.json').version)"
)"
cd /home/jorge/nebula-cloud
/home/jorge/.bun/bin/bun add \
  --cwd apps/web \
  "@nebula/runtime-ui@file:../../vendor/nebula-runtime-ui-$VERSION.tgz"
sha256sum "vendor/nebula-runtime-ui-$VERSION.tgz" >> vendor/SHA256SUMS
/home/jorge/.bun/bin/bun install
/home/jorge/.bun/bin/bun test
/home/jorge/.bun/bin/bun run build
```

Keep one checksum line per archive. Commit the frontend version bump in
`nebula-frontend`; commit the new archive, dependency path, lockfile, and
checksum in `nebula-cloud`. For a deployed Cloud Web process, deploy/restart
that process after the Cloud build succeeds.

## Propagate a new nebula-worker version into Cloud

Cloud does not import a worker package. It talks to the separately running
worker API, so deploy the worker executable and restart that service:

```bash
cd /home/jorge/nebula-worker
make test
make integration
make image-contract
make browser-image-contract
make build
sudo systemctl restart nebula-worker
sudo systemctl status nebula-worker --no-pager
curl --fail http://127.0.0.1:7780/health/ready
```

If a worker API contract changes, update the Cloud worker client in the same
release, run both repositories' tests, deploy the worker first when the change
is backward-compatible, then restart the Cloud control plane:

```bash
cd /home/jorge/nebula-cloud
/home/jorge/.bun/bin/bun test
/home/jorge/.bun/bin/bun run build
systemctl --user restart nebula-cloud-control-plane
```

Do not restart the worker merely to roll out a new agent image: worker process
versions and workspace image versions are independent.

## Full local-system refresh

Use this after compatible changes across all four repositories:

```bash
cd /home/jorge/nebula-agent && make -j2 test
cd /home/jorge/nebula-frontend \
  && /home/jorge/.bun/bin/bun test \
  && /home/jorge/.bun/bin/bun run build
cd /home/jorge/nebula-worker && make test && make integration && make build
cd /home/jorge/nebula-cloud \
  && /home/jorge/.bun/bin/bun test \
  && /home/jorge/.bun/bin/bun run build

sudo systemctl restart nebula-worker
systemctl --user restart nebula-cloud-control-plane
curl --fail http://127.0.0.1:7780/health/ready
curl --fail http://127.0.0.1:7790/health/ready
```

This refreshes processes but does not implicitly repack the frontend tarball or
replace existing workspace containers; use the dedicated procedures above for
those artifacts.

## Git and release discipline

- These are four independent Git histories. Commit and tag each repository
  independently.
- Never commit credentials, local `.env` files, runtime tokens, SQLite data,
  workspace homes, or generated build directories.
- Pin cross-repository artifacts by immutable package version, image tag, and
  source revision; do not rely on mutable `latest` in production.
- Preserve backward compatibility across Runtime API, worker API, Cloud
  gateways, and `@nebula/runtime-ui` or update producer and consumer together.
- User changes in a dirty working tree are authoritative; do not reset or
  overwrite unrelated edits.
