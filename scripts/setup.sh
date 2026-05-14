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
# 5. Pi project-local packages (restore from .pi/settings.json)
#
# Pi records project-local extension installs in .pi/settings.json. The
# .pi/npm/ tree is gitignored (regenerable), so on a fresh clone we replay
# each entry through `pi install -l`. Idempotent: pi skips packages that
# are already on disk and at the requested version.
# ---------------------------------------------------------------------------

PI_SETTINGS="${REPO_ROOT}/.pi/settings.json"

if [[ -f "$PI_SETTINGS" ]]; then
	# Pull the package list out via node — guaranteed present at this point.
	PI_PACKAGES=$(node -e '
		try {
			const s = require("'"$PI_SETTINGS"'");
			const pkgs = Array.isArray(s.packages) ? s.packages : [];
			console.log(pkgs.join("\n"));
		} catch (e) { process.exit(0); }
	' 2>/dev/null || true)

	if [[ -n "${PI_PACKAGES:-}" ]]; then
		while IFS= read -r pkg; do
			[[ -z "$pkg" ]] && continue
			info "ensuring Pi package: ${pkg}"
			# `pi install -l` is idempotent. Camoufox (used by the `research`
			# skill) lazily downloads its ~500 MB browser binary on first
			# tool invocation, not here.
			if pi install -l "$pkg" >/dev/null 2>&1; then
				ok "${pkg}"
			else
				warn "failed to install ${pkg} — re-run \`pi install -l ${pkg}\` to retry"
			fi
		done <<< "$PI_PACKAGES"
	else
		ok "no Pi project-local packages declared"
	fi
else
	ok "no .pi/settings.json — skipping Pi package restore"
fi

# ---------------------------------------------------------------------------
# 6. .env scaffold (preserves existing .env)
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
# 7. Legacy frontend cleanup
#
# Removes folders, tmp files, and Docker containers left behind by earlier
# frontend attempts (pi-rpc-shim, Open WebUI, piclaw). Idempotent — silent
# when there's nothing to clean.
# ---------------------------------------------------------------------------

removed_any=false

# Repo-local folders left by the shim or piclaw bind mounts.
for legacy_dir in services home .piclaw; do
	if [[ -e "${REPO_ROOT}/${legacy_dir}" ]]; then
		info "removing legacy folder: ${legacy_dir}/"
		rm -rf "${REPO_ROOT}/${legacy_dir}"
		removed_any=true
	fi
done

# Tmp files from the old pi-rpc-shim.
for legacy_file in /tmp/pi-rpc-shim.pid /tmp/pi-rpc-shim.log; do
	if [[ -e "$legacy_file" ]]; then
		info "removing ${legacy_file}"
		rm -f "$legacy_file"
		removed_any=true
	fi
done

# Containers from prior frontends (only if Docker is reachable).
if have docker && docker info >/dev/null 2>&1; then
	for legacy_container in piclaw open-webui; do
		if docker ps -aq -f "name=^${legacy_container}$" 2>/dev/null | grep -q .; then
			info "removing legacy container: ${legacy_container}"
			docker rm -f "$legacy_container" >/dev/null 2>&1 || true
			removed_any=true
		fi
	done
fi

if [[ "$removed_any" == "true" ]]; then
	ok "legacy frontend state cleaned up"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

cat <<EOF

Setup complete. Next steps:

  • Pi CLI:   pi    (from this repo root)
  • Web UI:   not yet wired in — being built from scratch

EOF
