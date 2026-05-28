# Authentication for agents-team Server

## Overview

The agents-team artifact server supports optional token-based authentication for application pages and protected artifact index pages while keeping individual published artifacts (`/v/<slug>` HTML renders and `/p/<slug>.pdf` PDF exports) publicly accessible.

## Configuration

### Enable Authentication

1. Generate a secure token:
   ```bash
   openssl rand -hex 32
   ```

2. Add to `.env`:
   ```bash
   AGENTS_TEAM_AUTH_TOKEN=your-generated-token-here
   ```

3. Restart the server:
   ```bash
   cd .pi/server
   pnpm build  # if needed
   pnpm start
   ```

### Disable Authentication

Leave `AGENTS_TEAM_AUTH_TOKEN` unset or empty in `.env`. This is the default behavior — safe for localhost-only usage.

## Usage

### For Browsers

Add the token as a query parameter for easy bookmarking:

```
http://localhost:8080/projects?auth=your-token-here
```

### For API Clients

Include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer your-token-here" \
  http://localhost:8080/projects
```

### For Scripts / Automation

Either method works. The header is more secure (doesn't appear in logs), but the query param is more convenient for one-off links.

## Public Routes (No Auth Required)

These routes are always accessible without authentication:

- `/v/*` — HTML renders from `render-html` skill, except `/v/list`
- `/p/*` — PDF exports from `export` skill, except `/p/list`
- `/_next/*` — Next.js framework assets (JS, CSS)
- `/favicon.ico` — static assets

Why? Published artifacts use URL possession as access control — the URLs are long-lived, shareable, and contain unique identifiers. The `/v/list` and `/p/list` index pages enumerate artifacts, so they are protected like application pages.

## Security Notes

1. **Token storage**: Never commit the token to git. It lives in `.env` (gitignored).
2. **Token rotation**: Generate a new token and update `.env` to rotate.
3. **HTTPS recommended**: When exposing via `AGENTS_TEAM_SERVER_PUBLIC_URL`, use a tunnel with HTTPS (e.g., Cloudflare Tunnel) to prevent token interception.
4. **Query param caution**: Tokens in query strings appear in browser history and server logs. Use the `Authorization` header for sensitive contexts.

## Implementation

The authentication gate is implemented in `.pi/server/middleware.ts` as Next.js middleware. The middleware:

1. Checks if the request matches a public route prefix
2. If not, checks if `AGENTS_TEAM_AUTH_TOKEN` is set
3. If auth is enabled, validates the token from header OR query param
4. Returns 401 Unauthorized for invalid/missing tokens

The matcher config optimizes performance by skipping middleware for known-public paths.

## Troubleshooting

### "address already in use" when starting server

Port 8080 is already bound. Find and kill the existing process:

```bash
lsof -ti:8080 | xargs kill -9
```

### 401 on public routes (`/v/*`, `/p/*`)

This should not happen. If it does, check:
- Middleware logic in `.pi/server/middleware.ts`
- Matcher config (`export const config`)
- Server build output (Next.js version, route list)

### Auth not enforced when token is set

1. Verify `.env` was loaded (check `process.env.AGENTS_TEAM_AUTH_TOKEN` in middleware)
2. Rebuild the server (`pnpm build`)
3. Check the build output for "ƒ Proxy (Middleware)" line

### Next.js 16 "middleware \u2192 proxy" deprecation warning

This is cosmetic. The warning indicates Next.js 16 prefers the name `proxy.ts` over `middleware.ts`, but both work identically. We're keeping `middleware.ts` for now until the ecosystem fully adopts the new convention.

To migrate (optional):
```bash
npx @next/codemod@canary middleware-to-proxy .
```

## Future Enhancements

- [ ] Session-based auth (cookies) for browser clients
- [ ] Role-based access (admin vs viewer)
- [ ] Rate limiting per token
- [ ] Token expiration / refresh
- [ ] Audit log for auth failures
