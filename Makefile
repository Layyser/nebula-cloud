COMPONENTS ?= cloud
ROLLOUT ?= on-restart
WORKSPACES ?=
BUN ?= /home/jorge/.bun/bin/bun

.PHONY: local-update local-rollout local-plan
local-update:
	$(BUN) scripts/update-local.ts --components "$(COMPONENTS)" --rollout "$(ROLLOUT)" --workspaces "$(WORKSPACES)"
local-rollout:
	$(BUN) scripts/update-local.ts --components rollout --rollout force --workspaces "$(WORKSPACES)"
local-plan:
	$(BUN) scripts/update-local.ts --components "$(COMPONENTS)" --rollout "$(ROLLOUT)" --workspaces "$(WORKSPACES)" --dry-run
