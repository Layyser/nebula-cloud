## Overview

Nubols gives every member of your organization an **Operator**: your own AI teammate — a private Linux computer with one or more Nebula agents working inside it. You delegate work in Chat, take over directly in Console when you want hands-on control, and manage people and usage from one dashboard.

This page is the shortest path from a new account to a first completed task.

## Before you begin

- An account (email and password sign-up).
- Membership in an organization. Invited by someone? Ask for their join code — it looks like `NBL-XXXXXXXXXXXX-XXXXXXXXXXXX`.
- Self-hosting for the first time? The bootstrap account created at installation becomes the first organization's owner.

## Meet your operator

Opening the app provisions your personal Operator automatically:

1. Sign in and pick your active organization.
2. The workspace moves through **resolving → provisioning → starting**.
3. When it reports **ready**, your Operator is live on its own Linux machine.

First provisioning can take a few minutes. Later visits are ready almost immediately, because the persistent home directory already exists. Every member gets exactly one personal workspace.

## Working by chat

The chat view talks to the agent runtime inside your workspace:

- Send a goal; the agent plans, runs tools, and streams its steps as they happen — thinking, tool calls, and results are all visible.
- Every conversation is a session: history survives restarts, and you can switch between sessions without losing context.
- Session controls let you change agent profile, model, reasoning effort, or security mode for that conversation only.
- An in-flight turn can be cancelled at any time.

## Taking over in Console

Open Terminal to attach to the same machine your Operator works on:

- A real terminal session with the same files, processes, and tools.
- Backed by `tmux`, so long jobs keep running through reloads and network drops.
- Resize-aware, so editors and dashboards behave.

## Next steps

- [Core concepts](/docs?topic=concepts) — operators, workspaces, agents, and sessions in depth.
- [Capabilities](/docs?topic=capabilities) — teach your Operator with skills, MCPs, rules, and hooks.
- [Cloud workspaces](/docs?topic=cloud) — lifecycle, storage, and resource guarantees.
- [Runtime API](/docs?topic=runtime-api) — integrate Nubols with your own tooling.
