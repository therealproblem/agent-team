#!/usr/bin/env bash
#
# Bootstrap a fresh machine to run this agents-team project under aoe.
# Idempotent: safe to re-run. Skips anything already installed/configured.
#
#   bash scripts/setup.sh             # install + register + launch dashboard
#   bash scripts/setup.sh --no-launch # install + register, don't start serve
#
# Targets macOS today. Linux is partially supported via apt/dnf fallback for
# tmux; pi/aoe install steps work on Linux too. Other platforms bail out.

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

LAUNCH=true
for arg in "$@"; do
	case "$arg" in
		--no-launch) LAUNCH=false ;;
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

# tmux config: ensure extended-keys is on (aoe needs it for modified Enter).
TMUX_CONF="${HOME}/.tmux.conf"
if [[ -f "$TMUX_CONF" ]] && grep -q "extended-keys" "$TMUX_CONF"; then
	ok "~/.tmux.conf already has extended-keys"
else
	info "appending extended-keys to ~/.tmux.conf"
	{
		echo ""
		echo "# Required by agent-of-empires (aoe). Reports modified Enter etc. correctly."
		echo "set -g extended-keys on"
	} >> "$TMUX_CONF"
	ok "~/.tmux.conf updated"
fi

# Apply to any running tmux server so we don't have to kill sessions.
if tmux info >/dev/null 2>&1; then
	tmux set -g extended-keys on >/dev/null 2>&1 || true
	ok "applied extended-keys to running tmux server"
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
# 5. aoe (the web dashboard)
# ---------------------------------------------------------------------------

if have aoe; then
	ok "aoe already installed ($(aoe --version 2>/dev/null || echo unknown))"
else
	info "installing aoe via official script…"
	curl -fsSL https://raw.githubusercontent.com/njbrake/agent-of-empires/main/scripts/install.sh | bash
	# The installer puts aoe in ~/.local/bin; make sure it's reachable from this shell.
	export PATH="${HOME}/.local/bin:${PATH}"
	have aoe || fail "aoe install completed but binary not found on PATH. Add ~/.local/bin to PATH and re-run."
	ok "aoe installed"
fi

# Sanity check: aoe sees pi as installed. Strip ANSI escapes before grepping.
if ! aoe agents 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -qE "pi[[:space:]]+installed"; then
	warn "aoe agents doesn't recognize pi as installed. Run 'aoe agents' to inspect."
fi

# ---------------------------------------------------------------------------
# 6. Register this project as an aoe session (idempotent)
# ---------------------------------------------------------------------------

PROJECT_TITLE="agents-team"
if aoe list 2>/dev/null | grep -q "$PROJECT_TITLE"; then
	ok "aoe session '$PROJECT_TITLE' already registered"
else
	info "registering '$PROJECT_TITLE' session with aoe…"
	aoe add --cmd pi --title "$PROJECT_TITLE" "$REPO_ROOT" >/dev/null
	ok "session registered"
fi

# ---------------------------------------------------------------------------
# 7. .env from .env.example (preserves existing .env)
# ---------------------------------------------------------------------------

ENV_FILE="${REPO_ROOT}/.env"
ENV_EXAMPLE="${REPO_ROOT}/.env.example"

if [[ -f "$ENV_FILE" ]]; then
	ok ".env already present (not overwriting)"
else
	[[ -f "$ENV_EXAMPLE" ]] || fail ".env.example missing — repo state unexpected."
	info "creating .env from template with a fresh passphrase…"
	# Generate a 32-char alnum passphrase (avoids shell-escaping headaches).
	PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
	# macOS sed and GNU sed differ on -i; use a portable form.
	cp "$ENV_EXAMPLE" "$ENV_FILE"
	# Replace the placeholder line; works on both macOS and GNU sed.
	if [[ "$OS" == "Darwin" ]]; then
		sed -i '' "s|^AOE_SERVE_PASSPHRASE=.*|AOE_SERVE_PASSPHRASE=${PASS}|" "$ENV_FILE"
	else
		sed -i "s|^AOE_SERVE_PASSPHRASE=.*|AOE_SERVE_PASSPHRASE=${PASS}|" "$ENV_FILE"
	fi
	chmod 600 "$ENV_FILE"
	ok ".env created with a fresh passphrase"
fi

# ---------------------------------------------------------------------------
# 8. Launch the dashboard (or print instructions)
# ---------------------------------------------------------------------------

if [[ "$LAUNCH" == "true" ]]; then
	info "loading .env and launching aoe serve as daemon…"
	# shellcheck source=/dev/null
	set -a; source "$ENV_FILE"; set +a
	# Stop any existing daemon so we don't end up with two instances.
	aoe serve --stop >/dev/null 2>&1 || true
	aoe serve --daemon >/dev/null
	ok "dashboard running at http://127.0.0.1:8080"
	info "passphrase is in $ENV_FILE (env var AOE_SERVE_PASSPHRASE)"
	info "to stop: aoe serve --stop"
else
	info "skipping launch (--no-launch passed)."
	cat <<EOF

To start the dashboard manually:

  set -a; source .env; set +a
  aoe serve
  # → http://127.0.0.1:8080

The passphrase is in $ENV_FILE.

EOF
fi
