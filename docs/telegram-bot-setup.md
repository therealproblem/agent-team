# Telegram Bot Setup

## Environment Variables

The Telegram bot extension requires two environment variables:

### Required for API access

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

Get this from [@BotFather](https://t.me/BotFather) on Telegram.

### Required to start polling (primary process only)

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

All these processes load `.env` and inherit `TELEGRAM_BOT_TOKEN`. Without the `TELEGRAM_BOT_PRIMARY` guard, **each process would start its own Telegram `getUpdates` polling loop**, causing Telegram to reject all but one with a 409 Conflict error.

The guard ensures only the primary interactive Pi session polls Telegram. Other processes inherit the token (so tools like `board_add_comment` can call the Telegram API to send notifications) but skip polling.

## Setup

### 1. Add the token to `.env`

Run this in your Pi session:

```
/telegram-connect
```

Follow the prompts to paste your bot token. The command writes `TELEGRAM_BOT_TOKEN=...` to `.env`.

### 2. Set TELEGRAM_BOT_PRIMARY before launching Pi

**Option A: Inline for one session**

```bash
TELEGRAM_BOT_PRIMARY=1 pi
```

**Option B: Shell alias (recommended)**

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias pi='TELEGRAM_BOT_PRIMARY=1 command pi'
```

Then `pi` always sets the flag.

**Option C: tmux launch wrapper**

If you always run Pi inside a specific tmux session:

```bash
tmux new-session -A -s pi "env TELEGRAM_BOT_PRIMARY=1 pi"
```

### 3. Verify

After starting Pi with `TELEGRAM_BOT_PRIMARY=1`, check the footer:

```
| TG ●
```

- **`TG ●`** — bot is connected and polling
- **`TG ✗`** — connection failed (check token, network)
- **No TG cell** — either no token set, or `TELEGRAM_BOT_PRIMARY` not set

### 4. Allow your chat(s)

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

### "getUpdates conflict — another process is likely polling"

**Symptom:** Pi shows `| TG ✗` and logs:

```
telegram-bot: getUpdates still conflicting after Xs — another process is likely polling with the same TELEGRAM_BOT_TOKEN
```

**Cause:** Multiple Pi processes are trying to poll. Common reasons:

1. `TELEGRAM_BOT_PRIMARY=1` is set globally (in `.env` or shell profile) instead of only for the main Pi launch.
2. You have multiple Pi sessions running (check `ps aux | grep pi`).
3. A crashed Pi left a stale long-poll lock on Telegram's side (rare; waits 50-70s to clear).

**Fix:**

1. Kill all Pi processes: `pkill -9 pi`
2. Remove `TELEGRAM_BOT_PRIMARY` from `.env` if present.
3. Restart Pi with `TELEGRAM_BOT_PRIMARY=1 pi` (or via the alias).

### Bot doesn't respond to messages

**Check:**

1. Is `| TG ●` shown in Pi's footer? If not, the bot isn't polling.
2. Is your chat ID in `TELEGRAM_ALLOWED_CHATS`? (Run `/start` in Telegram to see your ID.)
3. Is Pi idle (not mid-turn)? The bot queues messages if Pi is busy.

### 409 on session swap (/new, /reload)

**Expected behavior:** When Pi swaps sessions, the old module's loop stops and the new module's loop starts. Telegram may hold the old lock for 50-70 seconds. During that window, the new loop retries with exponential backoff and surfaces one quiet notice. This is normal and self-healing.

If 409s persist past 2 minutes, kill all Pi processes and restart clean.

## Advanced: webhook mode (not currently supported)

This extension uses long-polling (`getUpdates`). Webhook mode would require:

- Public HTTPS endpoint
- `setWebhook` call instead of `getUpdates` loop
- Next.js API route to receive POSTs from Telegram

Long-polling is simpler for local-first dev and doesn't require exposing Pi to the internet.
