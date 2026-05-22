#!/usr/bin/env bash
#
# Phase: Stop the server holding our port
#
# Re-running setup rebuilds .pi/server/.next/. If a `next start` is live
# during that rebuild, its in-memory build manifest still points at the
# previous CSS/JS hashes — Next will keep serving HTML that references
# files we just overwrote, producing 500s on every static asset until the
# server is restarted. Target the process bound to AGENTS_TEAM_SERVER_PORT
# (default 8080) by port rather than pgrep'ing all `node`/`next` processes,
# so unrelated node servers and Pi sessions on this machine are left alone.
# Skips this script's own ancestors so it doesn't suicide when invoked from
# inside a Pi session. Idempotent: silent when nothing's listening.

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

SERVER_PORT="${AGENTS_TEAM_SERVER_PORT:-8080}"

if have lsof; then
	# Collect PIDs we must NOT kill: this shell + its full ancestor chain.
	# Covers the case where pi forks bash forks setup.sh — killing pi would
	# kill the script driving the rebuild.
	SELF_PIDS=" $$ "
	_anc="${PPID:-0}"
	while [[ "$_anc" != "0" && "$_anc" != "1" && -n "$_anc" ]]; do
		SELF_PIDS="${SELF_PIDS}${_anc} "
		_anc="$(ps -o ppid= -p "$_anc" 2>/dev/null | tr -d ' ' || true)"
	done

	# `lsof -ti tcp:<port>` prints one PID per line for anything listening
	# on (or connected to) that TCP port. -t = terse / PID-only output.
	PORT_PIDS="$(lsof -ti tcp:"$SERVER_PORT" 2>/dev/null || true)"
	if [[ -z "$PORT_PIDS" ]]; then
		ok "nothing listening on port ${SERVER_PORT}"
	else
		victims=()
		for p in $PORT_PIDS; do
			[[ "$SELF_PIDS" == *" $p "* ]] && continue
			victims+=("$p")
		done

		if (( ${#victims[@]} == 0 )); then
			ok "port ${SERVER_PORT} held only by this script's ancestors — leaving alone"
		else
			info "stopping server on port ${SERVER_PORT} (pids: ${victims[*]})"
			kill "${victims[@]}" 2>/dev/null || true
			# Give them a moment to exit gracefully before SIGKILL.
			sleep 1
			for p in "${victims[@]}"; do
				kill -0 "$p" 2>/dev/null && kill -9 "$p" 2>/dev/null || true
			done
			ok "stopped server on port ${SERVER_PORT}"
		fi
	fi
else
	warn "lsof not found — skipping port-based shutdown. Stop whatever's bound to port ${SERVER_PORT} manually before re-running, or .pi/server/.next/ may end up out of sync with the live process."
fi
