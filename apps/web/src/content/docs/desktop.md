## Overview

Two ready-made frontends drive the Runtime API: a browser app and a native Windows desktop app. Both are built from one shared component library, so chat, session management, agent editing, capability managers, and settings behave identically everywhere. If neither fits, build your own client against the same [Runtime API](/docs?topic=runtime-api).

## Standalone web app

Point the web UI at any running `nebula --serve`:

- In development, the dev server proxies `/api` to your local runtime.
- Includes chat with streamed responses, a session switcher, an agent profile editor, managers for all capability kinds (skills, MCPs, rules, commands, hooks), runtime settings (provider, model, keys, base URL, security mode), and appearance controls.

## Nubols Desktop for Windows

A portable Windows application:

- Ships its own copy of the runtime — no separate install step, no system services.
- Portable folder layout: keep the executable, bundled runtime, and workspace folder together on any drive.
- Talks to its bundled runtime over localhost only.

## How connections work

| Mode | Authentication | Transport |
| --- | --- | --- |
| Local | Bearer token minted by the runtime | Direct HTTP + server-sent events to localhost |
| Cloud | Your Nubols session cookie | Streams through the control-plane gateway |

The shared transport layer handles streaming responses, automatic reconnection after interruptions, idle detection, and cancellation. In Cloud mode the browser never receives runtime tokens or internal addresses — see [Security](/docs?topic=security).
