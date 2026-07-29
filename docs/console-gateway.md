# Authenticated Console gateway

Nebula Cloud exposes an interactive terminal without giving the browser a
worker address or service credential:

```text
Browser xterm.js
  -> GET /api/workspaces/:workspaceId/console (WebSocket)
  -> Better Auth session, trusted Origin, active organization
  -> live owner or organization-admin ready workspace lookup
  -> private nebula-worker Console WebSocket
  -> Docker exec PTY as nebula in /home/nebula/workspace
```

The control plane opens the worker connection with its private service token and
an opaque actor identifier. Browser binary frames are forwarded to PTY stdin,
worker binary frames are forwarded to the browser, and JSON text frames carry
terminal resize controls. Terminal contents are never logged.

The gateway rejects unauthenticated sessions, untrusted origins, missing or
removed memberships, missing active organizations, unauthorized, foreign, or
guessed workspace IDs, non-ready workspaces, and invalid terminal dimensions
before exposing a browser socket. Only the workspace owner or a current
organization `admin`/`owner` may connect. The browser never receives a container
address, worker token, runtime token, Docker socket, or host path.

## Development

The Web development server and control plane run on separate ports. Terminal
WebSockets connect directly to the local control plane at port `7790` by default
because Vite is not the production WebSocket boundary. Override that origin
when needed:

```text
VITE_NEBULA_CLOUD_CONTROL_PLANE_URL=http://127.0.0.1:7790
```

Production uses the page's same origin. Its reverse proxy must forward
WebSocket upgrades for `/api/workspaces/:workspaceId/console` to the control
plane.

With the local worker, control plane, and a ready personal workspace running,
the authenticated PTY smoke test uses the ignored bootstrap credentials and
discovers the first organization and personal workspace automatically:

```bash
bun run --cwd apps/control-plane smoke:console
```

The test executes a harmless marker command and verifies that the working
directory is `/home/nebula/workspace`.
