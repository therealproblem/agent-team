#!/usr/bin/env bash
#
# Phase: Install news-cron crontab entry

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

find_repo_root
detect_platform

if have crontab; then
	NEWS_CRON_SCRIPT="${REPO_ROOT}/scripts/news-cron.sh"
	NEWS_CRON_LINE="0 7 * * * ${NEWS_CRON_SCRIPT}"
	# `crontab -l` exits non-zero when no crontab exists yet — treat that as
	# empty rather than aborting under `set -e`.
	CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
	if printf '%s\n' "$CURRENT_CRONTAB" | grep -Fq "$NEWS_CRON_SCRIPT"; then
		ok "news-cron entry already in crontab"
	else
		info "installing daily news-cron entry (07:00 local time)…"
		# Preserve existing entries; append the new line. Capture stderr so we
		# can surface macOS TCC errors with a helpful hint instead of crashing
		# the whole setup run.
		CRON_INSTALL_ERR="$(
			printf '%s\n%s\n' "$CURRENT_CRONTAB" "$NEWS_CRON_LINE" \
				| sed '/^$/d' \
				| crontab - 2>&1
		)" || CRON_INSTALL_FAILED=1
		if [[ "${CRON_INSTALL_FAILED:-0}" -eq 1 ]]; then
			warn "news-cron install failed: ${CRON_INSTALL_ERR:-unknown error}"
			if [[ "$OS" == "Darwin" ]] && [[ "$CRON_INSTALL_ERR" == *"Operation not permitted"* ]]; then
				warn "On macOS, grant Full Disk Access to your terminal app (System Settings → Privacy & Security → Full Disk Access), then re-run scripts/setup.sh — or install the line manually:"
				warn "  (crontab -l 2>/dev/null; echo \"${NEWS_CRON_LINE}\") | crontab -"
			fi
		else
			ok "news-cron installed — refresh runs daily at 07:00 (log: /tmp/agents-team-news-cron.log)"
		fi
	fi
else
	warn "crontab not found — skipping news-cron install. Run scripts/news-cron.sh manually or install cron."
fi
