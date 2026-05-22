---
description: Engineer inner skill. Use to stop, rebuild, and restart the local Next.js / Nextra server when code or content changes require a fresh production build.
---

# Rebuild Server

Use when the local Next.js / Nextra server (`.pi/server/`) needs to be rebuilt and restarted — typically after editing server code, server components, MDX transformations, or build-time configuration that won't hot-reload.

## When to use

- After changes to `.pi/server/app/`, `.pi/server/components/`, `.pi/server/lib/`, or other server-side code.
- After editing `.pi/server/next.config.mjs`, `.pi/server/tsconfig.json`, or other build-time config.
- After MDX content changes if rendering appears stale (though content under `.pi/server/content/` should auto-rebuild on request in production mode).
- When the server's `/v/` or `/p/` routes return 404 despite the `.mdx` file existing.

**Skip** if you're only editing vault markdown (`.md` files under `vault/`) — those aren't served by the Next.js app.

## How to rebuild

The rebuild-server capability is implemented as extension-private helpers in `.pi/extensions/server/index.ts` (`killServer`, `rebuildServer`, `bringUp`). Skills cannot call extension-private functions directly, so the operational path is a bash sequence:

```bash
# 1. Kill the running server process (if any)
pkill -f "next.*start.*8080" || true

# 2. Rebuild the production build
cd .pi/server && npm run build

# 3. Restart the server
# (pi's server extension will auto-spawn on next session_start, or spawn manually:)
cd .pi/server && node node_modules/next/dist/bin/next start -p 8080 > ../.pi/state/server.log 2>&1 &
```

Alternatively, if Pi is still running, the simplest path is to **restart Pi** (`/reload` or `/quit` + restart) — the `server` extension's `session_start` hook will detect the fresh `.next/` build and spawn the server automatically.

## Production vs dev mode

- **Production** (`next start`, default): serves pre-built artifacts from `.next/`. Fast cold start, but changes require a rebuild.
- **Dev** (`next dev`, opt-in): hot reload, compile-on-demand. Set `AGENTS_TEAM_SERVER_MODE=dev` before starting Pi to use dev mode. Rebuilds are automatic on file save.

If you're iterating on server code frequently, dev mode is faster. For one-off fixes or final checks, production rebuild is fine.

## Troubleshooting

- **Server won't start after rebuild:** Check `.pi/state/server.log` for spawn errors. Common causes: port 8080 already bound, missing `node_modules/`, syntax error in server code.
- **Rebuild fails:** `cd .pi/server && npm run build` directly to see the error. Usually a TypeScript error, missing dependency, or invalid Next.js config.
- **Routes still 404 after rebuild:** Verify the `.mdx` file exists at `.pi/server/content/v/<slug>.mdx` or `.pi/server/content/p/<slug>/index.mdx`. If it's there, check the file compiles (no syntax errors in the MDX). If it's missing, the `render-html` skill may have been skipped or errored — check the card outcome.

## See also

- `.pi/extensions/server/index.ts` — server lifecycle extension (start, stop, rebuild logic).
- `.pi/skills/render-html/SKILL.md` — writes `.mdx` files the server routes to.
- `.pi/skills/devops/SKILL.md` — general infra/deployment patterns.
