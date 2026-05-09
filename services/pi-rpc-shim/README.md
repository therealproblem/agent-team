# pi-rpc-shim

OpenAI-compatible HTTP shim that drives the Pi coding agent via its built-in `RpcClient`. Plug into any OpenAI-compat chat UI to get a web frontend over Pi.

## Architecture

```
Browser/PWA → Open WebUI (Docker) → POST /v1/chat/completions
                                       │
                                       ▼
                              pi-rpc-shim (this server)
                                       │
                                       ▼  (RpcClient → JSON-RPC over stdio)
                                pi --mode rpc
                                       │
                                       ▼
                          .pi/{agents,skills,extensions}
```

Each chat conversation maps to a persistent Pi `RpcClient` instance. Idle clients are reaped after 30 minutes (configurable). Tool calls are surfaced as collapsed italic markdown placeholders in the streamed response so the user can see what the agent is doing.

The shim is **frontend-agnostic**: any OpenAI-compatible chat UI works (Open WebUI, LibreChat, AnythingLLM, etc.). Tested with Open WebUI.

## Run the shim

From the agents-team repo root:

```bash
cd services/pi-rpc-shim
npm install
npm start
```

Default bind: `http://127.0.0.1:9090` (localhost-only).

## Hook up Open WebUI (PWA-capable)

1. **Run Open WebUI:**
   ```bash
   docker run -d -p 8080:8080 \
     --add-host=host.docker.internal:host-gateway \
     -v open-webui:/app/backend/data \
     --name open-webui --restart always \
     ghcr.io/open-webui/open-webui:main
   ```
2. Open `http://localhost:8080` in your browser. Create an account (it's local-only data — first user is admin).
3. **Settings → Admin → Connections → OpenAI API**:
   - **API Base URL**: `http://host.docker.internal:9090/v1`
     - Linux without Docker Desktop: use `172.17.0.1` instead, or whatever resolves to your host (`docker network inspect bridge`)
   - **API Key**: anything (the shim ignores it). e.g. `not-required`
4. Click **Verify** — should show `pi-distributor` as an available model.
5. Start a new chat, pick **pi-distributor** as the model, and you're talking to Pi.

### Install as PWA on phone / desktop

Open WebUI ships PWA support out of the box.

- **iOS Safari:** Share → "Add to Home Screen"
- **Android Chrome:** ⋮ → "Install app"
- **Desktop Chrome / Edge:** address-bar install icon

Once installed, it launches in standalone mode (no browser chrome). Push notifications and offline behavior are limited by the host browser's PWA capabilities, but the chat UI feels native.

## Test the shim without a UI (curl)

Health:

```bash
curl http://127.0.0.1:9090/health
```

Streaming chat completion:

```bash
curl -N http://127.0.0.1:9090/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'X-Conversation-ID: test-1' \
  -d '{
    "model": "pi-distributor",
    "stream": true,
    "messages": [
      { "role": "user", "content": "List the agents in .pi/agents/, briefly." }
    ]
  }'
```

Non-streaming:

```bash
curl http://127.0.0.1:9090/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'X-Conversation-ID: test-1' \
  -d '{
    "model": "pi-distributor",
    "messages": [{ "role": "user", "content": "Say PI-OK." }]
  }'
```

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PI_RPC_SHIM_PORT` | `9090` | HTTP listen port |
| `PI_RPC_SHIM_HOST` | `127.0.0.1` | Bind address. Set to `0.0.0.0` to expose on LAN — only do this behind a trusted network and add auth at the proxy layer. |
| `AGENTS_TEAM_ROOT` | `process.cwd()` | Project root Pi will use. Pi auto-discovers agents/skills/extensions from `.pi/` under this path. |
| `PI_RPC_SHIM_IDLE_MIN` | `30` | Minutes before idle session is stopped and reaped. |

## Known limitations (v1)

- **Conversation ID detection** is best-effort: header `X-Conversation-ID` or `X-LibreChat-Conversation-ID`, then body `conversation_id` or `user`, then a fresh UUID. Open WebUI sends a stable conversation ID in `body.user` once configured; first-time users may get a fresh UUID per message until that's locked in.
- **Model selection is ignored**: every request runs through Pi's default model. To use a different model per conversation, extend the shim to call `client.setModel()` on session start.
- **Tool args are surfaced as a one-line hint** (`⚙ bash \`ls -la\``); not full collapsible blocks. Acceptable for v1.
- **No auth.** Bind to `127.0.0.1` (default) and run Open WebUI in trusted Docker networking. Add a reverse proxy with auth before exposing to anything wider.
- **No image input** beyond what the chat UI passes through — Pi tool itself supports images via `client.prompt(message, images)`, not yet wired in the request handler.

## Stack

- Node 20+ (uses `import.meta`, ESM)
- Express 5
- `@earendil-works/pi-coding-agent` (provides `RpcClient`)
- `tsx` for TypeScript execution
