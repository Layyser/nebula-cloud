#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
worker_root=${NEBULA_DEMO_WORKER_REPO:-/home/jorge/nebula-worker}
bun_bin=${BUN_BIN:-/home/jorge/.bun/bin/bun}
go_bin=${GO_BIN:-/home/jorge/.local/go/bin/go}
demo_root="$repo_root/.codex-tmp/demo-local"
evidence_root="$repo_root/.codex-tmp/demo-evidence"
database_path="$demo_root/cloud.sqlite"
outbox_path="$demo_root/email-outbox"
run_root="$demo_root/run"
cloud_pid_file="$run_root/cloud.pid"
web_pid_file="$run_root/web.pid"
worker_url=http://127.0.0.1:7780
cloud_url=http://127.0.0.1:7791
web_url=http://127.0.0.1:5174
worker_token=${NEBULA_DEMO_WORKER_TOKEN:-$(sed -n 's/^NEBULA_WORKER_TOKEN=//p' "$worker_root/.env" | tail -n 1)}
worker_token=${worker_token#\"}
worker_token=${worker_token%\"}
worker_token=${worker_token#\'}
worker_token=${worker_token%\'}
platform_token=demo-platform-token-0123456789abcdef0123456789abcdef0123456789abcdef
auth_secret=demo-auth-secret-0123456789abcdef0123456789abcdef0123456789abcdef

usage() {
  cat <<'EOF'
Usage: ./scripts/demo-local.sh COMMAND

Commands:
  prepare  Build the isolated Worker and Cloud artifacts.
  reset    Delete only the dedicated demo workspace, database, and process state.
  up       Start isolated Cloud and Web processes on ports 7791/5174 against
           the existing quota-enforcing local Worker on port 7780.
  smoke    Exercise auth, membership, 14-day access, Chat gateway, Console,
           usage, Contact Sales, and nubols HTTP/private/TCP publication lifecycle.
  down     Stop the isolated processes and delete their demo workspace data.
  cycle    Reset, start, smoke-test, and stop one clean demo environment.
  prove    Run two complete cycles from clean state and retain JSON evidence.
  rehearse Reset, prove, and leave one synthetic demo running for screen-share.
  status   Show process and readiness status without changing anything.
EOF
}

assert_layout() {
  [[ "$repo_root" == /home/jorge/nebula-cloud ]] || {
    echo "Refusing to run outside /home/jorge/nebula-cloud" >&2
    exit 1
  }
  [[ "$worker_root" == /home/jorge/nebula-worker ]] || {
    echo "Refusing an unexpected Worker repository: $worker_root" >&2
    exit 1
  }
  [[ "$demo_root" == /home/jorge/nebula-cloud/.codex-tmp/demo-local ]] || exit 1
  [[ ${#worker_token} -ge 32 ]] || {
    echo "The local Worker token could not be loaded." >&2
    exit 1
  }
}

pid_is_running() {
  local pid_file=$1
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid=$(<"$pid_file")
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

stop_pid() {
  local pid_file=$1
  [[ -f "$pid_file" ]] || return 0
  local pid
  pid=$(<"$pid_file")
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in {1..50}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f -- "$pid_file"
}

wait_url() {
  local name=$1
  local url=$2
  local log_file=$3
  for _ in {1..120}; do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "$name did not become ready: $url" >&2
  tail -n 80 "$log_file" >&2 || true
  return 1
}

prepare() {
  assert_layout
  (cd "$worker_root" && make GO="$go_bin" test && make GO="$go_bin" build)
  (cd "$repo_root" && "$bun_bin" run build:control-plane)
}

cleanup_demo_workspaces() {
  [[ -f "$database_path" ]] || return 0
  curl --fail --silent "$worker_url/health/ready" >/dev/null 2>&1 || return 0
  NEBULA_CLOUD_DATABASE_PATH="$database_path" \
  NEBULA_WORKER_URL="$worker_url" \
  NEBULA_WORKER_TOKEN="$worker_token" \
    "$bun_bin" "$repo_root/apps/control-plane/scripts/demo-cleanup.ts"
}

down() {
  assert_layout
  stop_pid "$web_pid_file"
  stop_pid "$cloud_pid_file"
  cleanup_demo_workspaces
}

reset() {
  assert_layout
  down
  local resolved_demo
  resolved_demo=$(realpath -m "$demo_root")
  [[ "$resolved_demo" == /home/jorge/nebula-cloud/.codex-tmp/demo-local ]] || exit 1
  rm -rf -- "$resolved_demo"
  mkdir -p "$run_root"
}

up() {
  assert_layout
  mkdir -p "$run_root" "$outbox_path"
  if pid_is_running "$cloud_pid_file" || pid_is_running "$web_pid_file"; then
    echo "The isolated demo is already running; use status or down first." >&2
    exit 1
  fi
  [[ -f "$repo_root/apps/control-plane/dist/index.js" ]] || {
    echo "Cloud control-plane build is missing; run prepare first." >&2
    exit 1
  }

  curl --fail --silent --show-error "$worker_url/health/ready" >/dev/null || {
    echo "The root-managed local Worker must be ready on $worker_url." >&2
    exit 1
  }

  (
    cd "$repo_root/apps/control-plane"
    nohup env \
      NODE_ENV=development \
      NEBULA_CLOUD_BIND=0.0.0.0 \
      NEBULA_CLOUD_PORT=7791 \
      NEBULA_CLOUD_DATABASE_PATH="$database_path" \
      BETTER_AUTH_URL="$cloud_url" \
      BETTER_AUTH_SECRET="$auth_secret" \
      NEBULA_PUBLIC_APP_URL="$web_url" \
      NEBULA_CLOUD_TRUSTED_ORIGINS="$web_url" \
      NEBULA_EMAIL_TRANSPORT=filesystem \
      NEBULA_EMAIL_OUTBOX_DIR="$outbox_path" \
      NEBULA_CONTACT_TO_EMAIL=beta@nubols.com \
      NEBULA_REQUIRE_EMAIL_VERIFICATION=false \
      NEBULA_ORGANIZATION_CODE_SECRET="$auth_secret" \
      NEBULA_CONTACT_SOURCE_HASH_SECRET="$auth_secret" \
      NEBULA_WORKER_URL="$worker_url" \
      NEBULA_WORKER_TOKEN="$worker_token" \
      NEBULA_WORKER_ID=demo-local-worker \
      NEBULA_WORKER_CREDENTIAL_KEY_ID=demo-local-worker-token \
      NEBULA_WORKSPACE_IMAGE=nebula-workspace:dev \
      NEBULA_PLATFORM_ADMIN_TOKEN="$platform_token" \
      NEBULA_ENTITLEMENTS_REQUIRED=true \
      NEBULA_TCP_INGRESS_ENABLED=true \
      NEBULA_TCP_INGRESS_BIND=127.0.0.1 \
      NEBULA_TCP_INGRESS_HOST=127.0.0.1 \
      NEBULA_TCP_INGRESS_PORT_MIN=23000 \
      NEBULA_TCP_INGRESS_PORT_MAX=23019 \
      "$bun_bin" ./dist/index.js >"$demo_root/cloud.log" 2>&1 &
    echo $! >"$cloud_pid_file"
  )
  wait_url Cloud "$cloud_url/health/ready" "$demo_root/cloud.log"

  (
    cd "$repo_root/apps/web"
    nohup setsid env \
      NEBULA_DEV_CONTROL_PLANE_URL="$cloud_url" \
      VITE_NEBULA_CLOUD_CONTROL_PLANE_URL="$cloud_url" \
      "$bun_bin" ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 >"$demo_root/web.log" 2>&1 &
    echo $! >"$web_pid_file"
  )
  wait_url Web "$web_url" "$demo_root/web.log"
  echo "Isolated demo ready: $web_url"
}

smoke() {
  assert_layout
  pid_is_running "$cloud_pid_file" && pid_is_running "$web_pid_file" \
    && curl --fail --silent "$worker_url/health/ready" >/dev/null || {
    echo "The isolated demo is not fully running; use up first." >&2
    exit 1
  }
  NEBULA_DEMO_BASE_URL="$cloud_url" \
  NEBULA_DEMO_WEB_URL="$web_url" \
  NEBULA_CLOUD_DATABASE_PATH="$database_path" \
  NEBULA_WORKER_URL="$worker_url" \
  NEBULA_WORKER_TOKEN="$worker_token" \
  NEBULA_WORKSPACE_IMAGE=nebula-workspace:dev \
  NEBULA_PLATFORM_ADMIN_TOKEN="$platform_token" \
  NEBULA_DEMO_RUN_ID="${NEBULA_DEMO_RUN_ID:-$(date +%s)}" \
    "$bun_bin" "$repo_root/apps/control-plane/scripts/demo-smoke.ts"
}

status() {
  if curl --fail --silent "$worker_url/health/ready" >/dev/null 2>&1; then
    echo "Worker: ready ($worker_url/health/ready, shared root-managed service)"
  else
    echo "Worker: unavailable ($worker_url/health/ready)"
  fi
  for entry in "Cloud:$cloud_pid_file:$cloud_url/health/ready" \
    "Web:$web_pid_file:$web_url"; do
    IFS=: read -r name pid_file protocol rest <<<"$entry"
    url="$protocol:$rest"
    if pid_is_running "$pid_file"; then
      if curl --fail --silent "$url" >/dev/null 2>&1; then
        echo "$name: ready ($url)"
      else
        echo "$name: running, not ready ($url)"
      fi
    else
      echo "$name: stopped"
    fi
  done
}

cycle() {
  reset
  up
  trap down EXIT
  smoke
  down
  trap - EXIT
}

prove() {
  prepare
  mkdir -p "$evidence_root"
  trap down EXIT
  for cycle_number in 1 2; do
    reset
    up
    NEBULA_DEMO_RUN_ID="$(date +%s)-$cycle_number" smoke \
      | tee "$evidence_root/cycle-$cycle_number.json"
    down
  done
  trap - EXIT
  echo "Two clean cycles passed. Evidence: $evidence_root"
}

rehearse() {
  reset
  up
  if ! NEBULA_DEMO_RUN_ID=rehearsal smoke; then
    down
    return 1
  fi
  umask 077
  printf '%s\n' \
    "URL=$web_url/login" \
    "EMAIL=owner-rehearsal@demo.nubols.test" \
    "PASSWORD=Demo-rehearsal-password!" \
    >"$demo_root/rehearsal-credentials.env"
  echo "Rehearsal demo is running. Credentials: $demo_root/rehearsal-credentials.env"
  echo "Stop and delete its synthetic workspace with: bun run demo:down"
}

case "${1:-}" in
  prepare) prepare ;;
  reset) reset ;;
  up) up ;;
  smoke) smoke ;;
  down) down ;;
  cycle) cycle ;;
  prove) prove ;;
  rehearse) rehearse ;;
  status) status ;;
  -h|--help|help|'') usage ;;
  *) usage >&2; exit 2 ;;
esac
