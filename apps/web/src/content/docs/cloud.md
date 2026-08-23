## Overview

Cloud turns the standalone runtime into managed Operators: provisioning, supervision, persistent storage, console access, and usage accounting are handled for you. You interact through chat and console; the platform keeps the machine alive, isolated, and measurable.

## Lifecycle

A workspace moves through a small set of states:

| State | Meaning |
| --- | --- |
| `pending` | Created, waiting to provision |
| `provisioning` | Image and container being prepared |
| `ready` | Runtime healthy and accepting requests |
| `failed` | The last operation failed; retry from the app |

Your operator starts automatically when you open the app. Provisioning runs through a durable background job queue with retries and leases, so transient hiccups on the infrastructure side heal themselves without losing your request.

## Persistent storage

Every workspace owns a durable home directory mounted at `/home/nebula`:

- Survives restarts, compute replacement, and worker upgrades.
- Enforced disk quota — current value is visible under Settings → Operator.
- Removed only by an explicit destructive deletion that requires typed confirmation of the workspace id.

## Replacement and restarts

Restarting an operator **replaces its compute**: a fresh container is staged from the pinned workspace image, health-checked, and swapped in while the home directory carries over unchanged. Files, installed tools, and session history all survive. Runtime credentials rotate on every replacement. Expect a few minutes; the app shows progress.

## Resource profiles

| Resource | Typical allocation |
| --- | --- |
| Memory | 1 GiB reserved, up to 4 GiB |
| CPU | 0.5 reserved, up to 2 cores |
| Processes | Up to 512 concurrent |
| Disk | 5 GiB quota |

Current values for your operator are read-only under Settings → Operator.

## Console access

Terminal opens a real PTY into the workspace through an authenticated gateway:

- Backed by `tmux`, so sessions survive browser reloads and network drops.
- Resizable and color-capable; standard terminal behavior.
- Connections are audited — who connected and when, never keystrokes.

See [Security](/docs?topic=security) for how access is brokered without exposing credentials to the browser.
