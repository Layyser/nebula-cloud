#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${NUBOLS_CLOUD_DIR:-/opt/nubols/current/nebula-cloud}"
SERVICE="${NUBOLS_CLOUD_SERVICE:-nubols-cloud.service}"
BUN_BIN="${NUBOLS_BUN_BIN:-/usr/local/bin/bun}"
HEALTH_URL="${NUBOLS_CLOUD_HEALTH_URL:-http://127.0.0.1:7790/health/ready}"

usage() {
  cat <<'EOF'
Usage: scripts/update-cloud-web.sh

Pull and build the Cloud Web bundle, restart Nubols Cloud, and verify its
control-plane health endpoint. The worker is deliberately not restarted.

Environment overrides:
  NUBOLS_CLOUD_DIR       Cloud checkout (default: /opt/nubols/current/nebula-cloud)
  NUBOLS_CLOUD_SERVICE   systemd unit (default: nubols-cloud.service)
  NUBOLS_BUN_BIN         Bun executable (default: /usr/local/bin/bun)
  NUBOLS_CLOUD_HEALTH_URL readiness URL (default: http://127.0.0.1:7790/health/ready)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  usage >&2
  exit 2
fi

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "Cloud checkout not found: $REPO_DIR" >&2
  exit 1
fi

if [[ ! -x "$BUN_BIN" ]]; then
  echo "Bun executable not found or not executable: $BUN_BIN" >&2
  exit 1
fi

cd "$REPO_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to update a dirty checkout: $REPO_DIR" >&2
  exit 1
fi

git pull --ff-only
"$BUN_BIN" install --frozen-lockfile
"$BUN_BIN" run build:web

sudo systemctl restart "$SERVICE"

for attempt in {1..20}; do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
    echo "Cloud Web updated and $SERVICE is healthy."
    echo "nebula-worker.service was not restarted."
    exit 0
  fi
  sleep 1
done

echo "Cloud service did not become healthy: $HEALTH_URL" >&2
sudo systemctl --no-pager --full status "$SERVICE" || true
exit 1
