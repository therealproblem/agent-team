#!/usr/bin/env bash
#
# news-cron.sh — refresh the daily news JSON store (.pi/state/news.json) by
# calling pi --no-session against the news-ingest extension's
# `refresh_all_topics` tool. Designed for `cron` / `launchd`.
#
# What it does:
#   - cd to the agents-team repo root (resolved relative to this script)
#   - source nvm so the cron PATH picks up the user's pinned Node + `pi`
#   - run `pi --no-session -p "..."` against `refresh_all_topics`
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

cd "${REPO_ROOT}"

# Make `pi` resolvable in cron's stripped PATH. nvm is the common case;
# fall back to the system PATH if nvm isn't installed.
if [ -s "${HOME}/.nvm/nvm.sh" ]; then
	# shellcheck disable=SC1091
	. "${HOME}/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi
export PATH="${HOME}/.nvm/versions/node/$(node -v 2>/dev/null || echo none)/bin:${PATH:-/usr/local/bin:/usr/bin:/bin}"

{
	echo "===== $(date -Iseconds) ====="
	pi --no-session -p "Use the news-ingest extension. Call refresh_all_topics with window 'today' and count_per_topic 20. One tool call. Reply with a one-line summary."
	echo
} >> "${LOG_FILE}" 2>&1
