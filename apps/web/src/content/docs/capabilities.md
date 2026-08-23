## Overview

Capabilities equip agents with reusable knowledge, integrations, automation, and policy. All kinds live inside the workspace, are editable through the app or the [Runtime API](/docs?topic=runtime-api), and take effect without restarting your sessions.

## Agents

An agent profile is a single Markdown file with structured frontmatter:

- **Model behavior** — default model, reasoning effort, temperature, token limits, context handling.
- **Permissions** — per-tool `allow`, `ask`, or `deny`.
- **Selections** — which skills, rules, commands, MCP servers, and hooks apply.
- **Persona** — the body of the file acts as the agent's standing prompt.

Sessions running an explicit agent see only what that agent allows (allow-list semantics); the built-in **Default** profile leaves everything available. Agents are profiles, not processes — many sessions can share one.

## Skills

Markdown packs with a name and description. Names and descriptions are advertised to the model up front; the body loads only when the agent decides it is relevant. Good fits: coding conventions, runbooks, product FAQs.

## Commands

Any executable file becomes a slash command in the terminal UI. The command receives the chat context on standard input; whatever it prints is injected into the conversation and the model continues from there. Ideal for "do this exact sequence" automations.

## Rules

Always-on instruction files, folded into every relevant prompt. Rules are the right place for policies that must hold in every session: tone, guardrails, output formats. Agents may select subsets; otherwise all rules apply.

## Hooks

Hooks start turns from outside the chat box:

| Source | Trigger |
| --- | --- |
| Webhook | An HTTP call to the runtime |
| Telegram | Messages via long polling |
| Schedule | Interval (`every`) or daily time (`at`) |
| File watch | Changes under a watched path |

The rendered hook content arrives as a structured event message and the agent acts on it. Sessions opt in through their agent's hook list; unclaimed hooks fire in the default session only.

## MCP servers

Connect external tool servers over standard transports:

- **stdio** — the runtime spawns the server process locally.
- **HTTP** — connect to a remote endpoint (JSON or SSE responses).

Discovered tools appear alongside built-ins and can be filtered per server with include/exclude lists. Connections establish lazily when a session needs them; configuration changes propagate without losing history. In `sandbox` security mode, stdio servers stay disabled.

## Managing capabilities

Every kind has full create/read/update/delete coverage:

- **In the app**: dedicated managers for each kind under the workspace settings.
- **Over the API**: the `/capabilities` and `/mcps` endpoints accept Markdown or JSON bodies.
- **On disk**: each kind maps to a plain file or entry in the data directory — easy to version with git if you keep your `.nebula` folder under source control.
