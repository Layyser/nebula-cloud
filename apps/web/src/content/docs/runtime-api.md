## Overview

The Runtime API is the local HTTP interface exposed by `nebula --serve`. The terminal UI, web app, Desktop, and Cloud all speak it, so anything you can do in the interface you can script here. JSON bodies throughout; streaming turns use server-sent events (SSE).

## Authentication

A bearer token is generated automatically on first start and stored with owner-only permissions as `http-token` inside the data directory. Send it on every request:

```text
Authorization: Bearer <token>
```

Browser access is limited to explicitly allowed origins (`http_allowed_origins` in configuration).

## Health and metadata

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health/ready` | Readiness probe |
| GET | `/version` | Build and version info |
| GET | `/models` | Model catalog with availability flags |
| GET | `/chats` | List sessions |
| GET | `/agents` | Agent profiles plus effective defaults |
| GET | `/capabilities` | Installed skills, rules, commands, hooks, MCPs, tools |

## Sending turns

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/chat/{name}` | Send a message; response streams SSE events |
| POST | `/chat/{name}/cancel` | Gracefully stop the in-flight turn |
| POST | `/chat/{name}/input` | Answer an interactive question mid-turn |
| GET | `/chat/{name}/stream` | Rejoin or replay an in-flight turn from a cursor |
| GET | `/chat/{name}/events` | SSE bus for hook-triggered turns |

A turn's stream emits typed events — `text`, `thinking`, `tool_call`, `tool_result`, `user_input`, `error`, `status` — and terminates with a `data: [DONE]` sentinel.

On the very first message of a fresh session you may also pin its configuration in the same request: `agent`, `agent_md`, `security_mode`, `reasoning_effort`, or `model`.

## Session management

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/chat/{name}` | Full history for one session |
| DELETE | `/chat/{name}` | Delete a session (idempotent) |
| GET | `/chat/{name}/session` | Effective resolved state, including where each value came from |
| GET | `/chat/{name}/system-prompt` | The exact system prompt and tool list in use |

## Per-session controls

All controls are plain PUTs that apply without restarting the conversation:

| Path | Body | Purpose |
| --- | --- | --- |
| `/chat/{name}/model` | `{ "model": ... }` | Switch model (`default` clears) |
| `/chat/{name}/effort` | `{ "effort": ... }` | Reasoning effort override |
| `/chat/{name}/security-mode` | `{ "mode": ... }` | `default`, `sandbox`, or `full` |
| `/chat/{name}/cwd` | working directory | Change project root |
| `/chat/{name}/hooks` | `{ "paused": bool }` | Pause/resume hook triggers |
| `/chat/{name}/agent` | agent name or Markdown | Inspect, set, or reset the profile |

## Agents and capabilities

| Method | Path | Purpose |
| --- | --- | --- |
| PUT | `/agents/{name}` | Save an agent profile (Markdown body) |
| PUT | `/capabilities/skills/{name}` | Create or replace a skill |
| PUT | `/capabilities/rules/{name}` | Create or replace a rule |
| PUT | `/capabilities/commands/{name}` | Create or replace a command |
| PUT | `/capabilities/hooks/{name}` | Create or update a hook trigger |
| DELETE | `/capabilities/…/{name}` | Remove any capability by kind |
| GET · POST | `/mcps` | Read or upsert MCP server entries |
| DELETE | `/mcps/{name}` | Remove an MCP server |

## Change ledger

Workspace changes are journaled privately — reverting never touches your own repository metadata:

```text
GET  /changes?chat={name}
GET  /changes/{id}
POST /changes/{id}/revert
POST /changes/{id}/unrevert
```

## Going through Nebula Cloud

In Cloud you never call the runtime directly. Browsers call `/api/workspaces/{workspaceId}/runtime/*` with only their session cookie; the control plane verifies membership, injects a short-lived bearer token upstream, and strips credentials from the response. Runtime addresses and tokens never reach the client — see [Security](/docs?topic=security).
