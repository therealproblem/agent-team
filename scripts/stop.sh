#!/usr/bin/env bash
#
# Stop piclaw cleanly. Idempotent: safe to re-run when nothing is running.
# Preserves ./home (Pi auth) and ./.piclaw (chat history) so they survive restarts.
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

CONTAINER_NAME="piclaw"
LEGACY_SHIM_PORT=9090
LEGACY_WEBUI_NAME="open-webui"

# ---------------------------------------------------------------------------
# 1. Legacy shim + Open WebUI cleanup (one-time migration; harmless after)
# ---------------------------------------------------------------------------

if [[ -f /tmp/pi-rpc-shim.pid ]]; then
	PID=$(cat /tmp/pi-rpc-shim.pid)
	if kill -0 "$PID" 2>/dev/null; then
		info "stopping legacy shim (pid $PID)…"
		kill "$PID" 2>/dev/null || true
	fi
	rm -f /tmp/pi-rpc-shim.pid
fi
if lsof -ti :${LEGACY_SHIM_PORT} >/dev/null 2>&1; then
	info "killing stray process on :${LEGACY_SHIM_PORT}…"
	kill $(lsof -ti :${LEGACY_SHIM_PORT}) 2>/dev/null || true
	sleep 1
	if lsof -ti :${LEGACY_SHIM_PORT} >/dev/null 2>&1; then
		warn "process on :${LEGACY_SHIM_PORT} still alive; forcing"
		kill -9 $(lsof -ti :${LEGACY_SHIM_PORT}) 2>/dev/null || true
	fi
fi

# ---------------------------------------------------------------------------
# 2. Stop containers
# ---------------------------------------------------------------------------

if have docker && docker info >/dev/null 2>&1; then
	if docker ps -q -f "name=^${LEGACY_WEBUI_NAME}$" 2>/dev/null | grep -q .; then
		info "stopping legacy open-webui container…"
		docker stop "$LEGACY_WEBUI_NAME" >/dev/null 2>&1 || true
	fi

	if docker ps -q -f "name=^${CONTAINER_NAME}$" 2>/dev/null | grep -q .; then
		info "stopping piclaw…"
		docker stop "$CONTAINER_NAME" >/dev/null
		ok "piclaw stopped (data preserved in ./home and ./.piclaw)"
	else
		ok "piclaw was not running"
	fi
else
	ok "Docker not available; nothing more to stop"
fi

ok "all stopped"
