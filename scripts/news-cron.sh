#!/usr/bin/env bash
#
# news-cron.sh — refresh the daily news JSON store (.pi/state/news.json) by
# calling pi --no-session against the news-ingest extension's
# `refresh_all_topics` tool, then build a top-3-per-topic digest and push
# it to Telegram via the `telegram_send` tool. Designed for `cron` /
# `launchd`.
#
# What it does:
#   - cd to the agents-team repo root (resolved relative to this script)
#   - source nvm so the cron PATH picks up the user's pinned Node + `pi`
#   - source the project .env so TELEGRAM_ALLOWED_CHATS is visible here
#   - export TELEGRAM_REPLY_CHAT_ID = first allowed chat (skip if unset)
#   - run pi against refresh_all_topics → daily_digest → telegram_send
#   - log stdout/stderr to /tmp/agents-team-news-cron.log (rotated by tmpcleaner)
#
# Crontab line (run hourly between 06:00 and 21:00, local time):
#   0 6-21 * * * /Users/joseph/Documents/Projects/agents-team/scripts/news-cron.sh
#
# Or run once per morning at 07:00:
#   0 7 * * * /Users/joseph/Documents/Projects/agents-team/scripts/news-cron.sh
#
# Install:
#   crontab -l 2>/dev/null | { cat; echo "0 7 * * * $(pwd)/scripts/news-cron.sh"; } | crontab -
#
# Verify:
#   crontab -l
#   tail -f /tmp/agents-team-news-cron.log
#
# Note: cron on macOS needs Full Disk Access for /usr/sbin/cron in
# System Settings → Privacy & Security → Full Disk Access if it's going to
# touch files in protected locations (it doesn't here — the repo and .pi/
# state are in your home dir — but if you see "Operation not permitted",
# that's the cause).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="/tmp/agents-team-news-cron.log"

# Belt-and-braces opt-out: the tmux-host extension already skips re-exec when
# it sees `--no-session` in argv, but cron has no TTY so a future change that
# drops the flag must never accidentally try to spawn tmux. Sentinel is read
# at module-load time by .pi/extensions/tmux-host/index.ts.
export AGENTS_TEAM_NO_TMUX_REEXEC=1

cd "${REPO_ROOT}"

# Make `pi` resolvable in cron's stripped PATH. nvm is the common case;
# fall back to the system PATH if nvm isn't installed.
if [ -s "${HOME}/.nvm/nvm.sh" ]; then
	# shellcheck disable=SC1091
	. "${HOME}/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi
export PATH="${HOME}/.nvm/versions/node/$(node -v 2>/dev/null || echo none)/bin:${PATH:-/usr/local/bin:/usr/bin:/bin}"

# Load the project .env into this shell so we can route the digest to the
# right Telegram chat. Pi itself loads .env again at boot — this only
# matters for the chat-id picking below.
if [ -f .env ]; then
	set -a
	# shellcheck disable=SC1091
	. ./.env
	set +a
fi

# Pick the first allowlisted chat as the digest target. Same convention
# the PM-reply coordinator uses. Multi-user setups can override by setting
# TELEGRAM_REPLY_CHAT_ID directly in .env. When neither is set, the
# `telegram_send` tool no-ops cleanly — the cron stays idempotent on
# machines without Telegram configured.
if [ -z "${TELEGRAM_REPLY_CHAT_ID:-}" ] && [ -n "${TELEGRAM_ALLOWED_CHATS:-}" ]; then
	first_chat="${TELEGRAM_ALLOWED_CHATS%%,*}"
	first_chat="${first_chat#"${first_chat%%[![:space:]]*}"}"
	first_chat="${first_chat%"${first_chat##*[![:space:]]}"}"
	export TELEGRAM_REPLY_CHAT_ID="${first_chat}"
fi

read -r -d '' NEWS_CRON_PROMPT <<'PROMPT' || true
Use the news-ingest extension to refresh the store, build today's digest, and push it to Telegram.

Steps (call each tool exactly once, in order):
1. refresh_all_topics with window "today" and count_per_topic 20.
2. daily_digest with count 3.
3. telegram_send — pass the EXACT text returned by daily_digest as `text`, with no edits, no commentary, no summary. Omit `chat_id`; the env carries it. If telegram_send returns "(skipped)", that's fine — there's no chat configured.

Reply with a one-line summary of what was sent.
PROMPT

{
	echo "===== $(date -Iseconds) ====="
	pi --no-session -p "${NEWS_CRON_PROMPT}"
	echo
} >> "${LOG_FILE}" 2>&1
