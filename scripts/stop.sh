#!/usr/bin/env bash
#
# Stop pi-rpc-shim and Open WebUI cleanly.
# Idempotent: safe to re-run when nothing is running.
#
# Open WebUI's container is stopped (not removed); the open-webui Docker
# volume is preserved so user accounts / settings survive.
#
#   bash scripts/stop.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

C_RESET='\033[0m'
C_BLUE='\033[34m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'

info() { printf "${C_BLUE}[info]${C_RESET}  %s\n" "$*"; }
ok()   { printf "${C_GREEN}[ok]${C_RESET}    %s\n" "$*"; }
warn() { printf "${C_YELLOW}[warn]${C_RESET}  %s\n" "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

SHIM_PID_FILE="/tmp/pi-rpc-shim.pid"
SHIM_PORT=9090
WEBUI_NAME="open-webui"

# ---------------------------------------------------------------------------
# 1. shim
# ---------------------------------------------------------------------------

SHIM_KILLED=false

if [[ -f "$SHIM_PID_FILE" ]]; then
	PID=$(cat "$SHIM_PID_FILE")
	if kill -0 "$PID" 2>/dev/null; then
		info "stopping shim (pid $PID)…"
		kill "$PID" 2>/dev/null || true
		SHIM_KILLED=true
	fi
	rm -f "$SHIM_PID_FILE"
fi

# Fallback: kill anything lingering on the shim port (covers lost PID file
# or detached child processes).
if lsof -ti :$SHIM_PORT >/dev/null 2>&1; then
	info "killing stray process on :$SHIM_PORT…"
	kill $(lsof -ti :$SHIM_PORT) 2>/dev/null || true
	sleep 1
	if lsof -ti :$SHIM_PORT >/dev/null 2>&1; then
		warn "process on :$SHIM_PORT still alive; forcing"
		kill -9 $(lsof -ti :$SHIM_PORT) 2>/dev/null || true
	fi
	SHIM_KILLED=true
fi

if [[ "$SHIM_KILLED" == "true" ]]; then
	ok "shim stopped"
else
	ok "shim was not running"
fi

# ---------------------------------------------------------------------------
# 2. Open WebUI
# ---------------------------------------------------------------------------

if have docker && docker info >/dev/null 2>&1; then
	if docker ps -q -f "name=^${WEBUI_NAME}$" 2>/dev/null | grep -q .; then
		info "stopping Open WebUI container…"
		docker stop "$WEBUI_NAME" >/dev/null
		ok "Open WebUI stopped (container preserved, data volume kept)"
	else
		ok "Open WebUI was not running"
	fi
else
	# Either Docker isn't installed or the daemon is down — nothing to stop here.
	ok "Docker not available; nothing more to stop"
fi

ok "all stopped"
