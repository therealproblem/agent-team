#!/usr/bin/env bash
#
# Launch pi-rpc-shim + Open WebUI for browser/PWA access to Pi.
# Idempotent: stops any previous shim instance before starting a new one.
#
#   bash scripts/start.sh             # both shim and Open WebUI
#   bash scripts/start.sh --shim-only # just the shim, no Open WebUI

set -euo pipefail

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

C_RESET='\033[0m'
C_BLUE='\033[34m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'
C_RED='\033[31m'

info() { printf "${C_BLUE}[info]${C_RESET}  %s\n" "$*"; }
ok()   { printf "${C_GREEN}[ok]${C_RESET}    %s\n" "$*"; }
warn() { printf "${C_YELLOW}[warn]${C_RESET}  %s\n" "$*" >&2; }
fail() { printf "${C_RED}[fail]${C_RESET}  %s\n" "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

SHIM_ONLY=false
for arg in "$@"; do
	case "$arg" in
		--shim-only) SHIM_ONLY=true ;;
		-h|--help) grep '^#' "$0" | sed -E 's/^# ?//' ; exit 0 ;;
		*) fail "Unknown argument: $arg" ;;
	esac
done

# ---------------------------------------------------------------------------
# config
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SHIM_DIR="${REPO_ROOT}/services/pi-rpc-shim"
SHIM_PID_FILE="/tmp/pi-rpc-shim.pid"
SHIM_LOG_FILE="/tmp/pi-rpc-shim.log"
SHIM_PORT=9090

WEBUI_NAME="open-webui"
WEBUI_PORT=3000
WEBUI_IMAGE="ghcr.io/open-webui/open-webui:main"

# Load .env if present (overrides for AGENTS_TEAM_VAULT_PATH etc.).
if [[ -f "$REPO_ROOT/.env" ]]; then
	set -a; source "$REPO_ROOT/.env"; set +a
fi

# ---------------------------------------------------------------------------
# 1. shim
# ---------------------------------------------------------------------------

[[ -d "$SHIM_DIR" ]] || fail "services/pi-rpc-shim not found. Run scripts/setup.sh first."
[[ -d "$SHIM_DIR/node_modules" ]] || fail "shim deps missing. Run scripts/setup.sh first."

# Stop any previous shim cleanly.
if [[ -f "$SHIM_PID_FILE" ]]; then
	OLD_PID=$(cat "$SHIM_PID_FILE")
	if kill -0 "$OLD_PID" 2>/dev/null; then
		info "stopping previous shim (pid $OLD_PID)…"
		kill "$OLD_PID" 2>/dev/null || true
		# Give it a moment to release the port.
		for _ in 1 2 3 4 5; do
			lsof -ti :$SHIM_PORT >/dev/null 2>&1 || break
			sleep 0.5
		done
	fi
	rm -f "$SHIM_PID_FILE"
fi

# Belt-and-braces: kill any stray process on the port.
if lsof -ti :$SHIM_PORT >/dev/null 2>&1; then
	warn "port $SHIM_PORT busy after shim stop attempt; killing residual process"
	kill -9 $(lsof -ti :$SHIM_PORT) 2>/dev/null || true
	sleep 1
fi

info "starting pi-rpc-shim…"
(
	cd "$SHIM_DIR"
	AGENTS_TEAM_ROOT="$REPO_ROOT" nohup npm start >"$SHIM_LOG_FILE" 2>&1 &
	echo $! > "$SHIM_PID_FILE"
)
disown 2>/dev/null || true

# Wait up to 10s for the shim to come up.
SHIM_UP=false
for _ in 1 2 3 4 5 6 7 8 9 10; do
	if curl -fs http://127.0.0.1:$SHIM_PORT/health >/dev/null 2>&1; then
		SHIM_UP=true
		break
	fi
	sleep 1
done

if [[ "$SHIM_UP" == "true" ]]; then
	ok "shim listening on http://127.0.0.1:$SHIM_PORT  (pid $(cat $SHIM_PID_FILE), log $SHIM_LOG_FILE)"
else
	tail -10 "$SHIM_LOG_FILE" >&2 || true
	fail "shim failed to start. See $SHIM_LOG_FILE for details."
fi

# ---------------------------------------------------------------------------
# 2. Open WebUI (optional)
# ---------------------------------------------------------------------------

if [[ "$SHIM_ONLY" == "true" ]]; then
	cat <<EOF

Shim-only mode. To use Open WebUI later: run scripts/start.sh without --shim-only.

  • shim:        http://127.0.0.1:$SHIM_PORT
  • shim log:    $SHIM_LOG_FILE
  • Stop:        bash scripts/stop.sh

EOF
	exit 0
fi

if ! have docker; then
	warn "Docker not installed — skipping Open WebUI. The shim is up; you can curl it directly."
	exit 0
fi

if ! docker info >/dev/null 2>&1; then
	warn "Docker not running — start Docker Desktop / dockerd and re-run. Shim is up regardless."
	exit 0
fi

if docker ps -q -f "name=^${WEBUI_NAME}$" 2>/dev/null | grep -q .; then
	ok "Open WebUI already running"
elif docker ps -aq -f "name=^${WEBUI_NAME}$" 2>/dev/null | grep -q .; then
	info "starting existing Open WebUI container…"
	docker start "$WEBUI_NAME" >/dev/null
	ok "Open WebUI started"
else
	info "first launch — creating Open WebUI container…"
	docker run -d \
		-p "$WEBUI_PORT:8080" \
		--add-host=host.docker.internal:host-gateway \
		-v open-webui:/app/backend/data \
		--name "$WEBUI_NAME" \
		--restart unless-stopped \
		"$WEBUI_IMAGE" >/dev/null
	ok "Open WebUI container created"
fi

cat <<EOF

Everything up.

  • Open WebUI:   http://localhost:$WEBUI_PORT
  • shim:         http://127.0.0.1:$SHIM_PORT
  • shim log:     $SHIM_LOG_FILE
  • Stop:         bash scripts/stop.sh

First-time Open WebUI setup:
  1. Open http://localhost:$WEBUI_PORT
  2. Create an account (local — first user is admin)
  3. Settings → Admin → Connections → OpenAI API:
     • API Base URL: http://host.docker.internal:$SHIM_PORT/v1
     • API Key:       not-required (anything works)
  4. Verify, then pick "pi-distributor" as the model in a new chat.

EOF
