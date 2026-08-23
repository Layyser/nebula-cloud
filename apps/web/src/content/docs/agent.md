## Overview

Nebula Agent is the standalone core of the system: a single lightweight binary (named `nebula`) containing the agent loop, sessions, tools, capability engine, terminal interface, and local HTTP API. It is organization-neutral — Cloud runs this exact binary inside every workspace, and you can run it locally on your own machine.

## Interfaces

| Interface | Start it with | Notes |
| --- | --- | --- |
| Terminal UI | `nebula` | Keyboard-first chat with slash commands |
| Local HTTP API | `nebula --serve` | Serves on port 7777 by default |
| Web & Desktop | bundled runtimes | The same API underneath |

## Install

The binary builds from source today:

- Requirements: a C++17 compiler, `make`, and development headers for libcurl and OpenSSL.
- Build with `make` in the repository checkout.
- Prebuilt copies ship inside Nebula Desktop and every Cloud workspace image.

## Configuration

Configuration is JSON, merged hierarchically: user-level defaults down through ancestor project directories, innermost value wins. Environment variables override everything (`NEBULA_URL`, `NEBULA_MODEL`, `NEBULA_API_KEY`).

| Setting group | What it controls |
| --- | --- |
| `provider`, `url`, `protocol` | Which endpoint serves model inference |
| `model` | Default model slug for new sessions |
| `api_key` (+ per-provider keys) | Credentials; `$VAR` expansion supported |
| `temperature`, `top_p`, `max_tokens` | Sampling defaults |
| `safe_commands`, `unsafe_commands` | Shell command policy glob prefixes |
| `server.port`, `http_bind`, `http_token`, `http_allowed_origins` | Local HTTP API options |

## Model providers

Three built-in providers plus anything OpenAI-compatible:

| Provider | Authentication | Notes |
| --- | --- | --- |
| Codex | ChatGPT/Codex account OAuth | Device-flow sign-in, no API key |
| TokenRouter | `TOKENROUTER_API_KEY` | Hosted multi-model routing |
| OpenCode Go | `OPENCODE_GO_API_KEY` | Routes per model family |
| Any OpenAI-compatible URL | key from config or env | Point `url` at Ollama, LM Studio, vLLM, … |

Wire protocols implemented today: OpenAI Responses, OpenAI Chat Completions, and Anthropic Messages. Bedrock- and Google-style protocol names are recognized in configuration but not yet usable.

## Security modes

Every session carries one of three security modes:

| Mode | Behavior |
| --- | --- |
| `default` | Tool permissions and shell policy decide what needs approval |
| `sandbox` | Shell commands additionally run under a kernel sandbox that restricts writes to the workspace root; external stdio tool servers are disabled |
| `full` | Guardrails are skipped for trusted environments |

Set it per session, or bake a default into an [agent profile](/docs?topic=capabilities).

## Change tracking

File edits and other workspace changes are journaled to a private ledger inside the data directory. You can list changes per session and revert or reapply them later — without touching your own repository metadata. This powers the change history surfaced in the app and the [Runtime API](/docs?topic=runtime-api).

## On-disk layout

All state lives under one data directory (default `~/.nebula`; relocate with `--nebula-dir`):

```text
.nebula/
  config.json          merged configuration
  chats/               session history and resolved settings
  agents/              agent profiles (default-agent.md too)
  skills/ commands/ instructions/   capability packs
  mcp.json hooks.json  integrations and event triggers
  http-token           local API bearer token (owner-only)
  oauth/               provider OAuth tokens
```

Use `--workspace` to point the agent at a different project root.
