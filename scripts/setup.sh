#!/usr/bin/env bash
#
# Bootstrap a fresh machine to run this agents-team project.
# Idempotent: safe to re-run. Skips anything already installed/configured.
#
#   bash scripts/setup.sh
#
# Targets macOS today. Linux is partially supported via apt/dnf fallback for
# tmux; the Pi install step works on Linux too. Other platforms bail out.

set -euo pipefail

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

C_RESET='\033[0m'
C_BLUE='\033[34m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'
C_RED='\033[31m'

info()  { printf "${C_BLUE}[info]${C_RESET}  %s\n" "$*"; }
ok()    { printf "${C_GREEN}[ok]${C_RESET}    %s\n" "$*"; }
warn()  { printf "${C_YELLOW}[warn]${C_RESET}  %s\n" "$*" >&2; }
fail()  { printf "${C_RED}[fail]${C_RESET}  %s\n" "$*" >&2; exit 1; }

have()  { command -v "$1" >/dev/null 2>&1; }

for arg in "$@"; do
	case "$arg" in
		-h|--help)
			grep '^#' "$0" | sed -E 's/^# ?//' ; exit 0 ;;
		*)
			fail "Unknown argument: $arg"
			;;
	esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
info "repo: $REPO_ROOT"

# ---------------------------------------------------------------------------
# 1. platform check
# ---------------------------------------------------------------------------

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
	Darwin) info "platform: macOS ($ARCH)" ;;
	Linux)  info "platform: Linux ($ARCH) — partial support (tmux via apt/dnf)" ;;
	*) fail "Unsupported OS: $OS. Run on macOS or Linux." ;;
esac

# ---------------------------------------------------------------------------
# 2. tmux
# ---------------------------------------------------------------------------

if have tmux; then
	ok "tmux already installed ($(tmux -V))"
else
	info "installing tmux…"
	if [[ "$OS" == "Darwin" ]]; then
		have brew || fail "Homebrew is required on macOS but missing. Install from https://brew.sh first."
		brew install tmux
	elif have apt-get; then
		sudo apt-get update && sudo apt-get install -y tmux
	elif have dnf; then
		sudo dnf install -y tmux
	elif have pacman; then
		sudo pacman -S --noconfirm tmux
	else
		fail "Don't know how to install tmux on this system. Install manually and re-run."
	fi
	ok "tmux installed ($(tmux -V))"
fi

# tmux config: ensure Pi-friendly key handling.
#   extended-keys on           -- reports modified Enter etc. correctly
#   extended-keys-format csi-u -- csi-u modifier-key encoding (default xterm
#                                  format drops some modifier+key combinations
#                                  that Pi relies on)
TMUX_CONF="${HOME}/.tmux.conf"

# format: key|value|comment
declare -a TMUX_SETTINGS=(
	"extended-keys|on|Reports modified Enter / Shift+Enter etc. to terminal apps."
	"extended-keys-format|csi-u|Required by Pi. Uses csi-u modifier-key encoding."
)

ensure_tmux_setting() {
	local key="$1" value="$2" comment="$3"
	# Match `set -g <key>` exactly — trailing whitespace prevents matching
	# longer keys with the same prefix (e.g. extended-keys vs extended-keys-format).
	if [[ -f "$TMUX_CONF" ]] && grep -qE "^[[:space:]]*set[[:space:]]+-g[[:space:]]+${key}[[:space:]]" "$TMUX_CONF"; then
		ok "~/.tmux.conf already sets ${key}"
	else
		info "appending '${key} ${value}' to ~/.tmux.conf"
		{
			echo ""
			echo "# ${comment}"
			echo "set -g ${key} ${value}"
		} >> "$TMUX_CONF"
		ok "~/.tmux.conf updated with ${key}"
	fi
}

for entry in "${TMUX_SETTINGS[@]}"; do
	IFS='|' read -r key value comment <<< "$entry"
	ensure_tmux_setting "$key" "$value" "$comment"
done

# Apply to any running tmux server so we don't have to kill sessions.
if tmux info >/dev/null 2>&1; then
	for entry in "${TMUX_SETTINGS[@]}"; do
		IFS='|' read -r key value _comment <<< "$entry"
		tmux set -g "$key" "$value" >/dev/null 2>&1 || true
	done
	ok "applied tmux settings to running server"
fi

# ---------------------------------------------------------------------------
# 3. Node + npm (prerequisite for Pi)
# ---------------------------------------------------------------------------

if ! have node; then
	fail "Node.js is required (≥20). Install via nvm (https://github.com/nvm-sh/nvm) or your package manager, then re-run."
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if (( NODE_MAJOR < 20 )); then
	fail "Node.js ≥ 20 required. You have $(node -v). Upgrade and re-run."
fi
ok "Node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------------------
# 4. Pi (the agent runtime)
# ---------------------------------------------------------------------------

if have pi; then
	# pi --version writes to stderr; capture both streams.
	ok "pi already installed ($(pi --version 2>&1 || echo unknown))"
else
	info "installing @earendil-works/pi-coding-agent globally…"
	npm install -g @earendil-works/pi-coding-agent
	ok "pi installed ($(pi --version 2>&1))"
fi

# ---------------------------------------------------------------------------
# 5. .env scaffold (preserves existing .env)
# ---------------------------------------------------------------------------

ENV_FILE="${REPO_ROOT}/.env"
ENV_EXAMPLE="${REPO_ROOT}/.env.example"

if [[ -f "$ENV_FILE" ]]; then
	ok ".env already present (not overwriting)"
elif [[ -f "$ENV_EXAMPLE" ]]; then
	info "creating .env from template…"
	cp "$ENV_EXAMPLE" "$ENV_FILE"
	chmod 600 "$ENV_FILE"
	ok ".env created — edit it to fill in any project-local secrets"
else
	info "no .env.example found; skipping .env scaffold"
fi

# ---------------------------------------------------------------------------
# 6. Docker + piclaw image (web frontend)
# ---------------------------------------------------------------------------

PICLAW_IMAGE="ghcr.io/rcarmo/piclaw:latest"

if have docker; then
	if docker info >/dev/null 2>&1; then
		ok "Docker installed and running"

		# Migration: clean up any leftover open-webui from the previous frontend.
		if docker ps -aq -f "name=^open-webui$" 2>/dev/null | grep -q .; then
			info "removing legacy open-webui container (replaced by piclaw)…"
			docker rm -f open-webui >/dev/null 2>&1 || true
			ok "legacy container removed"
		fi

		# Pull piclaw so first start.sh is fast.
		if docker images -q "$PICLAW_IMAGE" 2>/dev/null | grep -q .; then
			ok "piclaw image already pulled"
		else
			info "pulling piclaw image (may take a minute)…"
			if docker pull "$PICLAW_IMAGE" >/dev/null 2>&1; then
				ok "piclaw image ready"
			else
				warn "piclaw image pull failed. Re-run setup or pull manually with 'docker pull $PICLAW_IMAGE'."
			fi
		fi
	else
		warn "Docker installed but not running. Start Docker Desktop / dockerd, then re-run setup."
	fi
else
	warn "Docker not installed. piclaw requires Docker — install from https://docker.com (macOS: Docker Desktop). Pi CLI works without Docker if you only want terminal access."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

cat <<EOF

Setup complete. Next steps:

  • Start the web UI:  bash scripts/start.sh    # piclaw on http://localhost:8080
  • Stop:              bash scripts/stop.sh
  • Pi CLI directly:   pi    (from this repo root)

EOF
