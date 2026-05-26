# Telegram Bot Setup

## Environment Variables

The Telegram bot extension requires these environment variables:

### Required for API access

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

Get this from [@BotFather](https://t.me/BotFather) on Telegram.

### Required for webhook delivery

By default, the bot reuses your existing agent server's public URL:

```bash
AGENTS_TEAM_SERVER_PUBLIC_URL=https://your-cloudflare-tunnel.example.com
```

That tunnel must forward to the Next.js server on `127.0.0.1:8080` (the agent server itself). The Next.js server then forwards Telegram updates internally to the local extension receiver on `127.0.0.1:8765`. Pi appends `/api/telegram/webhook/<secret>` automatically when it registers the webhook with Telegram, so set only the base URL.

Use the exact form `https://host.example` — no placeholder host, no duplicated scheme (`https://https://...`), and no literal quote characters around the value.

**Optional override — split hosts.** If you want Telegram to hit a different hostname than the rest of the agent server (e.g. a separate tunnel), set:

```bash
TELEGRAM_WEBHOOK_URL=https://tg.example.com
```

When set, it takes precedence over `AGENTS_TEAM_SERVER_PUBLIC_URL` for webhook registration. The tunnel for that host still has to forward to `127.0.0.1:8080`, not `:8765` — the Next.js server is what serves the `/api/telegram/webhook/<secret>` route.

### Optional local receiver port

```bash
TELEGRAM_WEBHOOK_LOCAL_PORT=8765
```

Only change this if you also need the local Pi webhook receiver to listen on a different port.

### Optional receiver guard (primary process only)

```bash
TELEGRAM_BOT_PRIMARY=1
```

**Critical:** Only set this in the shell that runs your **main interactive Pi session**. Do NOT set it globally in `.env` or your shell profile.

## Why the TELEGRAM_BOT_PRIMARY guard?

The Pi agent can run in multiple modes simultaneously:

1. **Interactive session** — your main `pi` TUI (this is the primary)
2. **`pi --no-session`** — server-side PM replies, cron jobs, smoke tests
3. **Subagent spawns** — engineer, reviewer, research tasks
4. **Tmux worktree sessions** — parallel Pi instances for different branches

All these processes load `.env` and inherit `TELEGRAM_BOT_TOKEN`. The guard ensures only the primary interactive Pi session starts the local webhook receiver and registers the webhook. Other processes inherit the token for one-off Telegram sends but skip receiver ownership.

## Setup

### 1. Add the token to `.env`

Run this in your Pi session:

```
/telegram-connect
```

Follow the prompts to paste your bot token. The command writes `TELEGRAM_BOT_TOKEN=...` to `.env`.

### 2. Add the public webhook URL

If `AGENTS_TEAM_SERVER_PUBLIC_URL` is already set (the tunnel that fronts your agent server on `127.0.0.1:8080`), the bot reuses it — no extra config needed. Otherwise add it to `.env`:

```bash
AGENTS_TEAM_SERVER_PUBLIC_URL=https://your-cloudflare-tunnel.example.com
```

Use a named tunnel for stability. Quick-tunnel URLs rotate, so they require updating `.env` and reconnecting whenever the URL changes. To override with a different hostname just for Telegram, set `TELEGRAM_WEBHOOK_URL` instead — see the section above.

### 3. Set TELEGRAM_BOT_PRIMARY before launching Pi

**Option A: Inline for one session**

```bash
TELEGRAM_BOT_PRIMARY=1 pi
```

**Option B: Shell alias (recommended)**

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias pi='TELEGRAM_BOT_PRIMARY=1 command pi'
```

Then `pi` always sets the flag for the interactive session.

**Option C: tmux launch wrapper**

If you always run Pi inside a specific tmux session:

```bash
tmux new-session -A -s pi "env TELEGRAM_BOT_PRIMARY=1 pi"
```

### 4. Connect or reconnect the webhook

Run:

```
/telegram-connect
```

That command configures the bot, starts the local receiver, and calls Telegram's `setWebhook` using `TELEGRAM_WEBHOOK_URL` when present.

Normal startup stays quiet when the webhook is healthy. If webhook configuration or startup fails, Pi surfaces an actionable error without printing the literal webhook URL, hostname, resolved IPs, or bot token. Run `node scripts/diagnostics/telegram-webhook-url.mjs` for explicit redacted URL/DNS diagnostics.

### 5. Verify

After starting Pi with `TELEGRAM_BOT_PRIMARY=1`, check the footer:

```
| TG ●
```

- **`TG ●`** — bot is connected and the webhook receiver is ready
- **`TG ✗`** — connection failed (check token, webhook URL, tunnel, network)
- **No TG cell** — either no token set, or `TELEGRAM_BOT_PRIMARY` not set

### 6. Allow your chat(s)

After the bot is live, DM it on Telegram:

```
/start
```

The bot replies with your `chat_id`. Add it to `.env`:

```bash
TELEGRAM_ALLOWED_CHATS=-1001234567890,9876543210
```

(Comma-separated for multiple chats. Negative IDs are groups/supergroups; positive are users.)

Then run `/telegram-connect` in Pi again to pick up the change.

## Troubleshooting

### "webhook start failed"

**Check:**

1. Is `TELEGRAM_WEBHOOK_URL` set to a real public `https://` URL with no placeholder host, duplicated scheme, literal quotes, or extra whitespace?
2. If the error says the configured host does not resolve, start/fix the Cloudflare Tunnel first, then rerun `/telegram-connect`. Pi now skips Telegram `setWebhook` until local DNS can resolve the host.
3. Is the Cloudflare Tunnel forwarding to the Pi server route?
4. Is the local receiver port available? The default is `127.0.0.1:8765`.
5. Did you run `/telegram-connect` after changing `.env`? The command re-reads `.env`, but exported shell variables still override file values. If the shell-exported value differs from `.env`, unset the shell export or restart Pi from a clean shell.

To inspect the value locally without exposing it in logs, run:

```bash
node scripts/diagnostics/telegram-webhook-url.mjs
```

To compare the log fingerprint against your local value, compute the same non-reversible hashes locally:

```bash
node - <<'NODE'
const { createHash } = require('node:crypto');
const raw = process.env.TELEGRAM_WEBHOOK_URL || process.env.AGENTS_TEAM_SERVER_PUBLIC_URL || '';
const url = new URL(raw.trim());
const fp = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
console.log({ url_fp: fp(url.origin.toLowerCase()), host_fp: fp(url.hostname.toLowerCase()) });
NODE
```

If the local fingerprint differs from Pi's startup log, Pi is not using the value you think it is; check shell exports, `.env`, and the process you restarted. Do not paste the literal URL or bot token into issue reports.

### Bot doesn't respond to messages

**Check:**

1. Is `| TG ●` shown in Pi's footer? If not, the receiver or webhook registration failed.
2. Is your chat ID in `TELEGRAM_ALLOWED_CHATS`? (Run `/start` in Telegram to see your ID.)
3. Is Pi idle (not mid-turn)? The bot queues messages if Pi is busy.

### 409 after switching from long polling

Telegram allows one delivery mode at a time. Re-running `/telegram-connect` registers the webhook and disables long polling for this bot token.

If conflicts persist, stop other Pi processes using the same bot token, then reconnect from the primary session.
