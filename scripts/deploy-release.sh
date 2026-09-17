#!/usr/bin/env bash
set -Eeuo pipefail
cloud=$(pwd -P)
release=$(dirname "$cloud")
[[ "$cloud" =~ ^/opt/nubols/releases/release-[0-9]+-[a-f0-9]{12}/nebula-cloud$ ]] || { echo 'Run only from a staged production release' >&2; exit 2; }
rollout=${1:-on-restart}
workspaces=${2:-}
[[ "$rollout" == on-restart || "$rollout" == force ]] || exit 2
[[ "$rollout" != force || -n "$workspaces" ]] || exit 2
[[ "$rollout" != on-restart || -z "$workspaces" ]] || exit 2
if [[ -n "$workspaces" ]]; then
    read -ra targets <<< "$workspaces"
    for target in "${targets[@]}"; do
        [[ "$target" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 2
        [[ "$target" != --all || ${#targets[@]} == 1 ]] || exit 2
    done
fi
previous=$(readlink -f /opt/nubols/current)
agent_revision=$(git -C "$release/nebula-agent" rev-parse --short=12 HEAD)
image="nebula-workspace:$agent_revision"
if [[ ${3:-} != activate ]]; then
    make release-check BUN=/usr/local/bin/bun GO=/usr/local/bin/go
    sudo -n env NEBULA_CORE_DIR="$release/nebula-agent" NEBULA_WORKSPACE_IMAGE="$image" NEBULA_IMAGE_VERSION="$agent_revision" make -C "$release/nebula-worker" workspace-image
    sudo -n env NEBULA_WORKSPACE_IMAGE="$image" make -C "$release/nebula-worker" image-smoke
    sudo -n bash "$cloud/scripts/deploy-release.sh" "$rollout" "$workspaces" activate "$previous"
    exit
fi
[[ $EUID == 0 ]] || exit 2
exec 9>/run/lock/nubols-deploy.lock
flock -n 9 || { echo 'Another activation is running' >&2; exit 1; }
[[ "$previous" == "${4:-}" ]] || { echo 'Active release changed during build; retry deployment' >&2; exit 1; }
backup="/var/backups/nubols/$(basename "$release")"
mkdir -p /var/backups/nubols
mkdir -m 700 "$backup"
cp -p /etc/nubols/cloud.env "$backup/cloud.env"
cp -p /etc/nginx/sites-available/nubols.conf "$backup/nginx.conf"
python3 - "$backup/database.sqlite" <<'PY'
import sqlite3, sys
with sqlite3.connect('/var/lib/nubols-cloud/nebula-cloud.sqlite') as source, sqlite3.connect(sys.argv[1]) as target:
    source.backup(target)
PY
snapshot() { docker ps --no-trunc --filter label=io.nebula.workspace.id --format '{{.ID}} {{.Image}}' | sort; }
snapshot > "$backup/runtimes-before"
rollback() {
    echo 'Activation failed; restoring previous processes/configuration. Database backup retained (no automatic schema downgrade).' >&2
    cp -p "$backup/cloud.env" /etc/nubols/cloud.env
    cp -p "$backup/nginx.conf" /etc/nginx/sites-available/nubols.conf
    ln -s "$previous" /opt/nubols/current.rollback
    mv -Tf /opt/nubols/current.rollback /opt/nubols/current
    systemctl restart nebula-worker nubols-cloud || true
    nginx -t && systemctl reload nginx || true
}
trap rollback ERR
python3 - "$cloud" "$image" <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location('environment', sys.argv[1] + '/deploy/scripts/configure-worker-environment.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.upsert(module.DEFAULT_CLOUD_ENV, {'NEBULA_WORKSPACE_IMAGE': sys.argv[2]})
PY
ln -s "$release" /opt/nubols/current.next
mv -Tf /opt/nubols/current.next /opt/nubols/current
install -m 644 "$cloud/deploy/nginx/nubols.conf" /etc/nginx/sites-available/nubols.conf
nginx -t
systemctl restart nebula-worker
curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 1 http://127.0.0.1:7780/health/ready
systemctl restart nubols-cloud
curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 1 http://127.0.0.1:7790/health/ready
systemctl reload nginx
curl --fail --silent --show-error https://nubols.com/robots.txt >/dev/null
curl --fail --silent --show-error https://nubols.com/llms.txt >/dev/null
[[ $(curl --silent --output /dev/null --write-out '%{http_code}' https://nubols.com/deployment-404-check) == 404 ]]
if [[ "$rollout" == force ]]; then
    # Root-owned token remains on the server, never in command output or SSH payload.
    set -a
    source /etc/nubols/worker.env
    set +a
    env SKIP_AGENT_BUILD=1 SKIP_IMAGE_BUILD=1 NEBULA_WORKSPACE_IMAGE="$image" bash "$release/nebula-worker/scripts/rollout-workspace.sh" "${targets[@]}"
else
    snapshot > "$backup/runtimes-after"
    cmp "$backup/runtimes-before" "$backup/runtimes-after"
fi
trap - ERR
echo "Release activated. Image: $image; rollout: $rollout. Browser image pin unchanged."
