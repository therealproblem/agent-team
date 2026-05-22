#!/usr/bin/env bash
#
# Phase: Install Chrome for PDF export

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

find_repo_root
detect_platform

ENV_FILE="${REPO_ROOT}/.env"

read_env_chrome_path() {
	[[ -f "$ENV_FILE" ]] || return 0
	# Last AGENTS_TEAM_CHROME_PATH=… wins; strip optional surrounding quotes.
	grep -E '^[[:space:]]*AGENTS_TEAM_CHROME_PATH=' "$ENV_FILE" \
		| tail -1 \
		| sed -E 's/^[[:space:]]*AGENTS_TEAM_CHROME_PATH=//; s/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/'
}

resolve_chrome_binary() {
	local candidates=()
	case "$OS" in
		Darwin)
			candidates=(
				"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
				"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
				"/Applications/Chromium.app/Contents/MacOS/Chromium"
			)
			;;
		Linux)
			candidates=(
				"/usr/bin/google-chrome"
				"/usr/bin/chromium"
				"/usr/bin/chromium-browser"
			)
			;;
	esac
	local cand
	for cand in "${candidates[@]}"; do
		if [[ -x "$cand" ]]; then
			printf '%s\n' "$cand"
			return
		fi
	done
}

set_env_chrome_path() {
	local path="$1"
	# Chrome-for-Testing paths contain spaces ("Google Chrome for Testing"),
	# and the server build sources .env into a `set -a` shell. An unquoted value
	# word-splits there and bash tries to exec the second word ("Chrome") as
	# a command, killing the build. Quote with double-quotes and escape any
	# embedded `\` or `"` so the sourced value round-trips intact.
	local escaped="${path//\\/\\\\}"
	escaped="${escaped//\"/\\\"}"
	local line="AGENTS_TEAM_CHROME_PATH=\"${escaped}\""
	if [[ -f "$ENV_FILE" ]] && grep -qE '^[[:space:]]*AGENTS_TEAM_CHROME_PATH=' "$ENV_FILE"; then
		local tmp
		tmp="$(mktemp)"
		awk -v l="$line" '
			/^[[:space:]]*AGENTS_TEAM_CHROME_PATH=/ { print l; replaced=1; next }
			{ print }
			END { if (!replaced) print l }
		' "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
	else
		{
			[[ -s "$ENV_FILE" ]] && echo ""
			echo "# Auto-set by scripts/phases/install-chrome.sh — Chrome installed via @puppeteer/browsers."
			echo "$line"
		} >> "$ENV_FILE"
	fi
	chmod 600 "$ENV_FILE" 2>/dev/null || true
}

CHROME_BIN=""

# 1. Explicit env override wins outright.
if [[ -n "${AGENTS_TEAM_CHROME_PATH:-}" && -x "${AGENTS_TEAM_CHROME_PATH}" ]]; then
	CHROME_BIN="$AGENTS_TEAM_CHROME_PATH"
fi

# 2. Pinned path inside .env (e.g. from a prior puppeteer install).
if [[ -z "$CHROME_BIN" ]]; then
	ENV_CHROME_PATH="$(read_env_chrome_path || true)"
	if [[ -n "$ENV_CHROME_PATH" && -x "$ENV_CHROME_PATH" ]]; then
		CHROME_BIN="$ENV_CHROME_PATH"
	fi
fi

# 3. Standard system locations (mirror resolveChromeBinary).
if [[ -z "$CHROME_BIN" ]]; then
	CHROME_BIN="$(resolve_chrome_binary || true)"
fi

if [[ -n "$CHROME_BIN" ]]; then
	ok "Chrome for PDF export: $CHROME_BIN"
else
	info "no Chrome found — installing Chrome-for-Testing via @puppeteer/browsers…"
	PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-${HOME}/.cache/puppeteer}"
	mkdir -p "$PUPPETEER_CACHE_DIR"
	# Final stdout line is `chrome@<version> <executable-path>` on success.
	# The path may contain spaces ("Google Chrome for Testing"), so split on
	# the first space only — don't use awk '$NF'.
	if INSTALL_OUT="$(npx -y @puppeteer/browsers install chrome@stable --path "$PUPPETEER_CACHE_DIR" 2>&1)"; then
		printf '%s\n' "$INSTALL_OUT" | sed -n '$p' | grep -q '^chrome@' && \
			CHROME_BIN="$(printf '%s\n' "$INSTALL_OUT" | sed -n '$p' | sed -E 's/^[^ ]+ //')"
	else
		warn "@puppeteer/browsers install failed:"
		printf '%s\n' "$INSTALL_OUT" | sed 's/^/    /' >&2
	fi

	if [[ -n "$CHROME_BIN" && -x "$CHROME_BIN" ]]; then
		ok "Chrome installed: $CHROME_BIN"
		# Ensure .env exists so we can pin the path.
		[[ -f "$ENV_FILE" ]] || { : > "$ENV_FILE"; chmod 600 "$ENV_FILE" 2>/dev/null || true; }
		set_env_chrome_path "$CHROME_BIN"
		ok "pinned AGENTS_TEAM_CHROME_PATH in .env"
	else
		warn "Could not install Chrome via @puppeteer/browsers. PDF export will fail until you install Google Chrome / Chromium or set AGENTS_TEAM_CHROME_PATH manually."
	fi
fi
