# Nebula Cloud UI baseline

These references render the real Cloud components with deterministic,
development-only fixtures. They do not require the control plane or a running
operator workspace.

## Start the preview server

From `/home/jorge/nebula-cloud`:

```sh
/home/jorge/.bun/bin/bun run --cwd apps/web dev -- --host 0.0.0.0 --port 4190
```

Wait until `http://localhost:4190/` responds before capturing references.

## Preview URLs

| State | URL |
| --- | --- |
| Login | `http://localhost:4190/?preview=login` |
| Organization setup | `http://localhost:4190/?preview=organization` |
| Workspace startup | `http://localhost:4190/?preview=startup` |
| Dashboard | `http://localhost:4190/?preview=dashboard` |
| Terminal | `http://localhost:4190/?preview=terminal` |
| Settings | `http://localhost:4190/?preview=settings` |

## Capture specification

- Capture each URL at widths `375`, `768`, `1024`, `1280`, and `1440` px.
- Keep the viewport height at `900` px.
- Capture the viewport, not the full page.
- Wait `1300` ms after navigation before capture; wait `1600` ms for Terminal.
- Save as JPEG using `<preview>-<width>.jpg`, for example
  `dashboard-1024.jpg`.
- Confirm the rendered body is non-empty before saving the image.

This produces 30 references: six states at five widths.

## Known fixture limitation

The deterministic Terminal preview displays plain text without ANSI colors.
Production terminal sessions do render colors; the baseline difference is
intentional and should not be treated as a product regression.
