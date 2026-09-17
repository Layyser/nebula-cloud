COMPONENTS ?= cloud
ROLLOUT ?= on-restart
WORKSPACES ?=
BUN ?= /home/jorge/.bun/bin/bun
GO ?= $(shell command -v go 2>/dev/null || printf /home/jorge/.local/go/bin/go)

.PHONY: local-update local-rollout local-plan
local-update:
	$(BUN) scripts/update-local.ts --components "$(COMPONENTS)" --rollout "$(ROLLOUT)" --workspaces "$(WORKSPACES)"
local-rollout:
	$(BUN) scripts/update-local.ts --components rollout --rollout force --workspaces "$(WORKSPACES)"
local-plan:
	$(BUN) scripts/update-local.ts --components "$(COMPONENTS)" --rollout "$(ROLLOUT)" --workspaces "$(WORKSPACES)" --dry-run

# Production publishes exact committed revisions; never modifies the live checkout.
.PHONY: release-check prod-deploy prod-release prod-prepare
prod-prepare:
	test -d /etc/nubols
	dpkg -s build-essential libcurl4-openssl-dev libssl-dev >/dev/null 2>&1 || (sudo -n apt-get update && sudo -n env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get install -y --no-install-recommends build-essential libcurl4-openssl-dev libssl-dev)
release-check:
	$(MAKE) -C ../nebula-agent -j2 test nebula
	cd ../nebula-frontend && $(BUN) test && $(BUN) run build
	$(MAKE) -C ../nebula-worker GO="$(GO)" test integration image-contract browser-image-contract build
	$(BUN) test
	$(BUN) run build
prod-deploy:
	$(BUN) scripts/deploy-production.ts "$(ROLLOUT)" "$(WORKSPACES)"
prod-release:
	bash scripts/deploy-release.sh "$(ROLLOUT)" "$(WORKSPACES)"
