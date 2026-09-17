#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# == 7 && "$1" =~ ^release-[0-9]+-[a-f0-9]{12}$ ]] || exit 2
release="/opt/nubols/releases/$1"
rollout=$2
workspaces=$3
shift 3
sudo -n mkdir "$release" # refuse to reuse/overwrite a release
sudo -n chown "$(id -u):$(id -g)" "$release"
repos=(agent frontend worker cloud)
for name in "${repos[@]}"; do
    [[ "$1" =~ ^[a-f0-9]{40}$ ]] || exit 2
    git clone --quiet "https://github.com/Layyser/nebula-$name.git" "$release/nebula-$name"
    git -C "$release/nebula-$name" checkout --quiet --detach "$1"
    shift
done
cd "$release/nebula-frontend"
/usr/local/bin/bun install --frozen-lockfile
cd "$release/nebula-cloud"
/usr/local/bin/bun install --frozen-lockfile
make prod-release BUN=/usr/local/bin/bun GO=/usr/local/bin/go ROLLOUT="$rollout" WORKSPACES="$workspaces"
