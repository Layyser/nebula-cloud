## Overview

Nebula separates *where* work happens from *how* the model behaves. The persistent environment is a workspace; the behavior is a configuration. Keeping them apart means you can replace compute without losing data, and change behavior without touching files.

| Concept | In one line |
| --- | --- |
| Operator | Your AI teammate as a whole: a private Linux workspace plus every agent running inside it |
| Workspace | The private Linux machine an operator lives on |
| Agent | A saved runtime configuration applied to sessions |
| Session | One conversation plus its resolved settings and history |
| Capability | A reusable pack of knowledge, integration, automation, or policy |

## Operators

An operator is your AI teammate taken as a whole — the persistent Linux environment together with the agent runtime that works inside it. Agents are just configurations, so one operator can run several agents in parallel: multiple sessions working at once, on the same machine, sharing the same files and tools.

You are not part of the operator; you direct it. You supervise through chat, step in through console whenever you like, and each member owns exactly one personal operator. Organizations contain many.

## Workspaces

A workspace is a dedicated, isolated Linux environment:

- **Persistent home** — files, installed tools, and dotfiles live under a durable home directory that survives restarts and even full compute replacement.
- **Replaceable compute** — the container is disposable hardware; the home volume is durable storage. Restarting swaps one for a fresh copy of the other.
- **Bounded resources** — CPU, memory, process-count, and disk quotas apply per workspace.
- **Private networking** — each workspace sits on its own isolated network segment.

## Agents

An agent is a named configuration profile stored as a single Markdown definition. It pins down:

- default model and reasoning effort,
- per-tool permissions (`allow`, `ask`, or `deny`),
- which skills, rules, commands, MCP servers, and hooks apply,
- a security mode, and an optional persona prompt.

Agents are configurations — not people and not processes. A built-in **Default** profile applies when nothing else is selected, and individual sessions can override knobs (model, effort, security mode, working directory) without editing the profile.

## Sessions

A session is one conversation with its resolved configuration: model overrides, working directory, security mode, loaded capabilities, and metadata like title and status. Sessions persist to disk, so history survives restarts and device switches. Subagents run as short-lived child sessions, nested at most one level deep.

## Capabilities at a glance

| Kind | Purpose |
| --- | --- |
| Agents | Behavior profiles applied to sessions |
| Skills | On-demand instruction packs the agent loads when relevant |
| Commands | Executable templates exposed as slash commands |
| Rules | Always-on instructions folded into every prompt |
| Hooks | Event-driven turns: webhooks, Telegram, schedules, file watches |
| MCPs | External tool servers connected over standard transports |

See [Capabilities](/docs?topic=capabilities) for details on each kind.

## Where configuration lives

Everything an agent needs lives inside the workspace under a hidden `.nebula` directory: configuration, agents, skills, commands, rules, MCP servers, hooks. Configuration merges hierarchically — user-level defaults down to project-level overrides — so teams can share baseline settings while projects specialize. Manage it visually in the app, or programmatically through the [Runtime API](/docs?topic=runtime-api).
