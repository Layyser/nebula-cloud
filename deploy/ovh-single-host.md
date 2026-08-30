# OVH single-host demo deployment

This runbook targets the first Nubols demo host:

- Ubuntu 24.04 on OVHcloud VPS
- 6 vCPUs, 12 GB RAM, 100 GB NVMe
- one Worker and one workspace on the same host
- public address `57.128.182.235`
- Cloudflare authoritative DNS for `nubols.com`

The checked-in environment templates reserve 6 GiB, 4 CPUs, 1,024 PIDs,
and 30 GiB of persistent data for the single workspace. The remaining host
capacity belongs to the OS, Docker, image builds, Nginx, and Cloud.

## 1. DNS

Create these records in Cloudflare. Proxy the website and app records, but keep
the wildcard publication and raw TCP records **DNS only**:

| Type | Name | Target | Cloudflare proxy |
| --- | --- | --- | --- |
| A | `@` | `57.128.182.235` | Proxied |
| CNAME | `www` | `nubols.com` | Proxied |
| A | `app` | `57.128.182.235` | Proxied |
| A | `*.apps` | `57.128.182.235` | DNS only |
| A | `tcp` | `57.128.182.235` | DNS only |

Cloudflare's ordinary HTTP proxy does not proxy the raw TCP range, and its
universal edge certificate does not cover arbitrary names below
`*.apps.nubols.com`. Keep those two records gray-clouded. Set Cloudflare's
SSL/TLS encryption mode to **Full (strict)**; proxied HTTP records will return
an origin-certificate error until the certificate in section 6 is installed.

Create a separate Cloudflare API token restricted to `Zone / DNS / Edit` for
only `nubols.com`. Put it directly on the server for Certbot; never commit it or
paste it into an issue or chat.

## 2. Host packages

Patch and reboot before installing application dependencies:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

Install the base packages after reconnecting:

```bash
sudo apt install -y ca-certificates curl git make nginx nftables openssl \
  unzip xfsprogs certbot python3-certbot-dns-cloudflare
```

Install Docker Engine from Docker's official Ubuntu apt repository, including
the Buildx plugin. Do not use the convenience installer. Verify it before
continuing:

```bash
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker buildx version
```

Install the repository-pinned Bun version:

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.3.10"
sudo install -m 0755 "$HOME/.bun/bin/bun" /usr/local/bin/bun
bun --version
```

Install the Go 1.24 toolchain supplied by Ubuntu Noble. This matches the
Worker's `go.mod` language version and receives Ubuntu security updates:

```bash
sudo apt install -y golang-1.24-go
sudo ln -sfn /usr/lib/go-1.24/bin/go /usr/local/bin/go
go version
```

## 3. Service identity and persistent storage

```bash
sudo useradd --system --home-dir /var/lib/nubols-cloud \
  --shell /usr/sbin/nologin nubols
sudo install -d -m 0750 -o nubols -g nubols /var/lib/nubols-cloud
sudo install -d -m 0700 -o root -g root /var/lib/nebula-worker
sudo install -d -m 0700 -o root -g root /var/lib/nubols-storage
sudo install -d -m 0750 -o root -g root /var/lib/nebula-workspaces
sudo install -d -m 0700 -o root -g root /etc/nubols
```

OVH supplies one root disk, while the Worker fails closed without XFS project
quotas. For this one-month demo, create a bounded 40 GiB sparse XFS filesystem.
Stop if the target file already exists:

```bash
sudo test ! -e /var/lib/nubols-storage/workspaces.xfs
sudo truncate -s 40G /var/lib/nubols-storage/workspaces.xfs
sudo mkfs.xfs -f /var/lib/nubols-storage/workspaces.xfs
```

Add this exact line with `sudoedit /etc/fstab`:

```fstab
/var/lib/nubols-storage/workspaces.xfs /var/lib/nebula-workspaces xfs loop,prjquota,nosuid,nodev 0 0
```

Then mount and prove quota enforcement is active:

```bash
sudo mount /var/lib/nebula-workspaces
findmnt /var/lib/nebula-workspaces
sudo xfs_quota -x -c state /var/lib/nebula-workspaces
```

## 4. Release layout and builds

Clone the four repositories into one immutable release directory so the agent
and Worker remain siblings. The expected layout is:

```text
/opt/nubols/releases/<release>/nebula-agent
/opt/nubols/releases/<release>/nebula-frontend
/opt/nubols/releases/<release>/nebula-worker
/opt/nubols/releases/<release>/nebula-cloud
/opt/nubols/current -> /opt/nubols/releases/<release>
```

### Private-repository Git pulls

The four repositories are private. To make manual `git pull` updates work
without putting a token in a remote URL, install the checked-in credential
helper once and keep the token in a user-owned file on the server:

```bash
sudo install -m 0755 deploy/scripts/nubols-git-credential \
  /usr/local/bin/nubols-git-credential
sudo install -d -m 0700 -o ubuntu -g ubuntu \
  /home/ubuntu/.config/nubols
sudo install -m 0600 -o ubuntu -g ubuntu /dev/null \
  /home/ubuntu/.config/nubols/github.env
sudoedit /home/ubuntu/.config/nubols/github.env
```

Put only this line in that file:

```text
GITHUB_TOKEN=github_pat_REPLACE_WITH_A_FINE_GRAINED_TOKEN
```

Use a fine-grained GitHub token with read-only `Contents` access to the four
Nubols repositories. Configure the helper for manual Git operations:

```bash
sudo git config --system credential.helper /usr/local/bin/nubols-git-credential
git -C /opt/nubols/current/nebula-cloud ls-remote origin HEAD
```

Do not use a tokenized `https://user:token@github.com/...` URL. GitHub tokens
are credentials, not deployment configuration, and must never be committed.

After cloning the intended committed revisions:

```bash
cd /opt/nubols/releases/<release>/nebula-cloud
bun ci
bun test
bun run build

cd /opt/nubols/releases/<release>/nebula-worker
make test
make integration
make image-contract
make browser-image-contract
make build
```

Build the immutable workspace and browser images from the checked-out source
revisions. Both are required: the Worker creates an isolated browser sidecar
for every workspace, and provisioning fails closed if that image is absent.

```bash
AGENT_REVISION=$(git -C /opt/nubols/releases/<release>/nebula-agent rev-parse --short=12 HEAD)
WORKER_REVISION=$(git -C /opt/nubols/releases/<release>/nebula-worker rev-parse --short=12 HEAD)
cd /opt/nubols/releases/<release>/nebula-worker
sudo env PATH="/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin" \
  NEBULA_CORE_DIR=/opt/nubols/releases/<release>/nebula-agent \
  NEBULA_WORKSPACE_IMAGE="nebula-workspace:$AGENT_REVISION" \
  NEBULA_IMAGE_VERSION="$AGENT_REVISION" \
  make workspace-image
sudo docker image inspect "nebula-workspace:$AGENT_REVISION" >/dev/null
sudo env PATH="/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin" \
  NEBULA_BROWSER_IMAGE="nebula-browser:$WORKER_REVISION" \
  NEBULA_BROWSER_IMAGE_VERSION="$WORKER_REVISION" \
  make browser-image
sudo env \
  NEBULA_BROWSER_IMAGE="nebula-browser:$WORKER_REVISION" \
  NEBULA_WORKSPACE_IMAGE="nebula-workspace:$AGENT_REVISION" \
  make browser-image-smoke
sudo docker image inspect "nebula-browser:$WORKER_REVISION" >/dev/null
sudo ln -sfn /opt/nubols/releases/<release> /opt/nubols/current
```

Record both revisions. Set Cloud's `NEBULA_WORKSPACE_IMAGE` to the agent tag
and the Worker's `NEBULA_WORKER_BROWSER_IMAGE` to the browser tag; both tags
must resolve to local Docker images before starting the services.

## 5. Secrets and application environments

Copy the templates, then edit them directly on the server:

```bash
sudo install -m 0600 -o root -g root \
  /opt/nubols/current/nebula-cloud/deploy/env/cloud.env.example \
  /etc/nubols/cloud.env
sudo install -m 0600 -o root -g root \
  /opt/nubols/current/nebula-cloud/deploy/env/worker.env.example \
  /etc/nubols/worker.env
sudoedit /etc/nubols/cloud.env
sudoedit /etc/nubols/worker.env
```

Replace every placeholder. Generate independent secrets with
`openssl rand -base64 48`. The same `NEBULA_WORKER_TOKEN` must be present in
both files. Set `NEBULA_WORKSPACE_IMAGE` to the immutable agent tag. Never add
real secrets to either checked-in example. Set
`NEBULA_WORKER_BROWSER_IMAGE` to the immutable Worker revision built in the
previous section.

For later browser-image rollouts, use the checked-in helper to update the
root-owned environment without echoing credentials. Add `--rotate-token` only
when rotating the shared Cloud-to-Worker credential; it updates both files to
the same newly generated value without printing it:

```bash
sudo python3 /opt/nubols/current/nebula-cloud/deploy/scripts/configure-worker-environment.py \
  --browser-image "nebula-browser:$WORKER_REVISION"
sudo systemctl restart nebula-worker nubols-cloud
```

Production startup intentionally requires a verified Resend sending domain,
API key, and signed webhook secret. Configure the webhook destination as:

```text
https://app.nubols.com/api/webhooks/resend
```

The registration allowlist is enforced server-side and contains only
`beta@nubols.com`.

## 6. Wildcard TLS

Store the restricted Cloudflare token with `sudoedit`:

```bash
sudo install -d -m 0700 /etc/letsencrypt/secrets
sudoedit /etc/letsencrypt/secrets/cloudflare.ini
sudo chmod 0600 /etc/letsencrypt/secrets/cloudflare.ini
```

The file contains one line:

```ini
dns_cloudflare_api_token = REPLACE_WITH_RESTRICTED_TOKEN
```

Issue one certificate covering the website, app, TCP hostname, and nested
publication hostnames:

```bash
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/secrets/cloudflare.ini \
  --cert-name nubols.com \
  -d nubols.com -d '*.nubols.com' -d '*.apps.nubols.com'
sudo certbot renew --dry-run
```

## 7. Services and ingress

```bash
cd /opt/nubols/current/nebula-cloud
sudo install -m 0644 deploy/systemd/nebula-worker.service \
  /etc/systemd/system/nebula-worker.service
sudo install -m 0644 deploy/systemd/nubols-cloud.service \
  /etc/systemd/system/nubols-cloud.service
sudo install -m 0644 deploy/nginx/nubols.conf \
  /etc/nginx/sites-available/nubols.conf
sudo ln -sfn /etc/nginx/sites-available/nubols.conf \
  /etc/nginx/sites-enabled/nubols.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl enable --now nebula-worker nubols-cloud nginx certbot.timer
```

Do not apply the firewall without an OVH web Console already open. Validate it,
apply it, and immediately prove a second SSH login still works:

```bash
sudo nft -c -f deploy/firewall/nftables.conf
sudo nft -f deploy/firewall/nftables.conf
```

Only after the second SSH login succeeds, install it persistently:

```bash
sudo install -m 0644 deploy/firewall/nftables.conf /etc/nftables.conf
sudo systemctl enable nftables
```

## 8. Acceptance checks

```bash
curl --fail http://127.0.0.1:7780/health/ready
curl --fail http://127.0.0.1:7790/health/ready
curl --fail https://app.nubols.com/ >/dev/null
sudo docker image inspect "nebula-workspace:$AGENT_REVISION" >/dev/null
sudo docker image inspect "nebula-browser:$WORKER_REVISION" >/dev/null
sudo systemctl --no-pager --full status nebula-worker nubols-cloud nginx
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Create the owner account as `beta@nubols.com`, verify it through the routed
mailbox, create one workspace, and then run the production-host isolation,
HTTPS publication, raw TCP publication, restart-persistence, and backup drills
before sharing the demo externally.

## 9. Updating the Cloud Web bundle

For frontend-only changes, update the Cloud checkout and restart only the
Cloud service. The worker and existing workspace containers do not need to be
restarted because this does not change the worker API or workspace image:

```bash
cd /opt/nubols/current/nebula-cloud
./scripts/update-cloud-web.sh
```

The script refuses to pull over local edits, uses `git pull --ff-only`, installs
the locked dependencies, builds `apps/web`, restarts `nubols-cloud.service`,
and checks `http://127.0.0.1:7790/health/ready`. It never restarts
`nebula-worker.service`.

## 10. Provisioning failure: “Provisioning paused”

If the app shows:

```text
Provisioning paused
Provisioning failed. Retry to schedule a fresh attempt.
```

check the Worker logs and Docker images before restarting application services:

```bash
sudo journalctl -u nebula-worker --since=-15min --no-pager
sudo docker image inspect "${NEBULA_WORKER_BROWSER_IMAGE}" >/dev/null
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

The most important failure mode is a missing browser sidecar image. The
workspace image alone is insufficient: every workspace also gets a private
`nebula-browser` sidecar. The Worker fails closed when that image is absent;
older Worker responses may misleadingly surface this as `workspace_not_found`
in Cloud.

Recover it by building and pinning the browser image, then restarting the
Worker and Cloud services so they read the updated environment:

```bash
WORKER_REVISION=$(git -C /opt/nubols/current/nebula-worker rev-parse --short=12 HEAD)
cd /opt/nubols/current/nebula-worker
sudo env NEBULA_BROWSER_IMAGE="nebula-browser:$WORKER_REVISION" \
  NEBULA_BROWSER_IMAGE_VERSION="$WORKER_REVISION" make browser-image
sudo python3 /opt/nubols/current/nebula-cloud/deploy/scripts/configure-worker-environment.py \
  --browser-image "nebula-browser:$WORKER_REVISION"
sudo systemctl restart nebula-worker nubols-cloud
curl --fail http://127.0.0.1:7780/health/ready
curl --fail http://127.0.0.1:7790/health/ready
```

Confirm that both `nebula-runtime-*` and `nebula-browser-*` are healthy. A
previously paused Cloud job may need one **Try again** click after the repair;
do not delete the workspace or its persistent volume. If the image exists and
the failure persists, inspect the Worker log entry immediately following the
new retry before changing quotas, firewall rules, or the database.
