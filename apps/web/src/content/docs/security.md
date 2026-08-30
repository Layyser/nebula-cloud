## Overview

Nubols' security posture rests on strict boundaries between browser, control plane, worker, and Nebula runtime. Each layer only ever holds the minimum credential it needs, for as long as it needs it.

## Trust boundaries

```text
Browser ──cookie──▶ Control plane ──signed HMAC──▶ Worker ─▶ Containers
                        │
                        └──short-lived bearer──▶ Runtime API
```

- **Browsers** hold nothing but their own session cookie. No worker tokens, no runtime tokens, no container addresses ever reach client code.
- **Control plane** authenticates users, authorizes per organization, and brokers every runtime or console request.
- **Worker** accepts requests only from the control plane, authenticated with short-lived signed HMAC headers derived from a shared secret that itself never travels.
- **Runtime** accepts requests bearing its own locally minted bearer token.

## Workspace isolation

Each operator runs in its own container:

- Runs as a non-root user with all Linux capabilities dropped and privilege escalation blocked.
- Sits on a private per-workspace network — workspaces cannot see each other.
- Bounded by CPU, memory, process-count, and disk quotas enforced below the container.
- Optional headless-browser sidecars run sandboxed under their own user and seccomp profile.

Inside the runtime, `sandbox` security mode adds kernel-level confinement: shell writes are restricted to the workspace root via Landlock.

## Credentials and tokens

- The runtime's bearer token is generated at first boot, stored owner-only, rotated whenever compute is replaced, and injected per-request by the control plane — never persisted in any browser.
- Worker authentication uses expiring, nonce-signed request headers rather than transmitting the shared secret.
- Provider API keys live in the workspace configuration, scoped to that workspace alone. A Cloud-level organization credential gateway is planned but not enabled in this release.

## Audit trail

Console connections record who connected, from where, and when — connection metadata only, never terminal contents. Workspace diagnostics exposed through the internal API are redacted before anyone sees them: secrets become `[REDACTED]` automatically.

## Responsible disclosure

Found something? Report it to security contacts through the contact page. A dedicated disclosure channel and policy will be published before general availability.
