#!/usr/bin/env bash
#
# Launch piclaw — self-hosted PWA web workspace driving Pi.
# Idempotent: replaces any prior piclaw container before starting.
#
#   bash scripts/start.sh
#
# After it reports up, open http://localhost:8080 and type /login
# in the chat to configure your LLM provider.

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

for arg in "$@"; do
	case "$arg" in
		-h|--help) grep '^#' "$0" | sed -E 's/^# ?//' ; exit 0 ;;
		*) fail "Unknown argument: $arg" ;;
	esac
done

# ---------------------------------------------------------------------------
# config
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CONTAINER_NAME="piclaw"
WEB_PORT="${PICLAW_WEB_PORT:-8080}"
IMAGE="ghcr.io/rcarmo/piclaw:latest"
HOME_DIR="${REPO_ROOT}/home"

# Load .env if present (overrides for AGENTS_TEAM_VAULT_PATH etc.).
if [[ -f "$REPO_ROOT/.env" ]]; then
	set -a; source "$REPO_ROOT/.env"; set +a
fi

# ---------------------------------------------------------------------------
# 1. Migration cleanup — remove legacy shim / open-webui state
# ---------------------------------------------------------------------------

if [[ -f /tmp/pi-rpc-shim.pid ]]; then
	info "cleaning up legacy shim PID file…"
	OLD_PID=$(cat /tmp/pi-rpc-shim.pid)
	kill "$OLD_PID" 2>/dev/null || true
	rm -f /tmp/pi-rpc-shim.pid
fi
if lsof -ti :9090 >/dev/null 2>&1; then
	warn "process on legacy shim port :9090; killing"
	kill $(lsof -ti :9090) 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 2. Docker preflight
# ---------------------------------------------------------------------------

have docker || fail "Docker required. Install Docker Desktop (macOS) or dockerd (Linux), then re-run scripts/setup.sh."
docker info >/dev/null 2>&1 || fail "Docker installed but daemon not running. Start Docker Desktop / dockerd and retry."

# Legacy open-webui container, if any, is cleaned up here too.
if docker ps -aq -f "name=^open-webui$" 2>/dev/null | grep -q .; then
	info "removing legacy open-webui container…"
	docker rm -f open-webui >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------------------
# 3. Stop any prior piclaw container and start a fresh one
# ---------------------------------------------------------------------------

if docker ps -aq -f "name=^${CONTAINER_NAME}$" 2>/dev/null | grep -q .; then
	info "removing previous piclaw container…"
	docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

# Belt-and-braces: error out if something else holds the port.
if lsof -iTCP:${WEB_PORT} -sTCP:LISTEN >/dev/null 2>&1; then
	fail "Port ${WEB_PORT} is busy. Stop whatever is listening, or set PICLAW_WEB_PORT=<other> in .env."
fi

mkdir -p "$HOME_DIR"

info "starting piclaw…"
docker run -d \
	--init \
	--name "$CONTAINER_NAME" \
	--restart unless-stopped \
	-p "127.0.0.1:${WEB_PORT}:8080" \
	-e PICLAW_WEB_PORT=8080 \
	-v "${HOME_DIR}:/config" \
	-v "${REPO_ROOT}:/workspace" \
	"$IMAGE" >/dev/null

# ---------------------------------------------------------------------------
# 4. Wait for readiness
# ---------------------------------------------------------------------------

UP=false
for _ in $(seq 1 30); do
	if curl -fs "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; then
		UP=true
		break
	fi
	sleep 1
done

if [[ "$UP" == "true" ]]; then
	ok "piclaw listening on http://localhost:${WEB_PORT}"
else
	warn "piclaw did not respond on :${WEB_PORT} within 30s. It may still be starting."
	warn "  Logs:   docker logs -f ${CONTAINER_NAME}"
	warn "  Status: docker ps -a -f name=^${CONTAINER_NAME}\$"
fi

cat <<EOF

  • piclaw:    http://localhost:${WEB_PORT}
  • workspace: /workspace  ← bound to ${REPO_ROOT}
  • config:    /config     ← bound to ${HOME_DIR} (Pi auth, models)
  • Stop:      bash scripts/stop.sh
  • Logs:      docker logs -f ${CONTAINER_NAME}

First-time setup:
  1. Open http://localhost:${WEB_PORT}
  2. Type /login in the chat to configure your LLM provider
  3. Pi inside the container auto-discovers .pi/agents from /workspace

EOF
