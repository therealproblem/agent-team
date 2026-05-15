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
# 6. Local patches against .pi/npm/ packages
#
# Some upstream playwright bugs bite us mid-research (Firefox uncaughtError
# with no source location crashes the entire Node process — see
# scripts/patches/playwright-core+1.60.0.patch). We carry small patches in
# scripts/patches/ and reapply them after every `pi install -l`. Idempotent:
# already-applied patches are skipped silently.
# ---------------------------------------------------------------------------

if [[ -d "${REPO_ROOT}/.pi/npm/node_modules" ]]; then
	bash "${REPO_ROOT}/scripts/apply-patches.sh" || warn "some patches failed — see output above"
else
	info "no .pi/npm/node_modules/ — skipping patches"
fi

# ---------------------------------------------------------------------------
# 7. .env scaffold (preserves existing .env)
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
# 8. exports/ root
#
# `write_export_pdf` writes PDFs to <repo>/exports/. The Next.js server
# serves them at /p/<slug>.pdf via a route handler at
# .pi/server/app/p/[slug]/route.ts that reads from disk at request time —
# no longer a public/ symlink (that approach broke under `next start`
# because Next caches the public-files manifest at build time and serves
# prerendered 404s for files added at runtime). All we need at setup time
# is for the exports/ directory itself to exist; the route handler
# creates the rest of the pipe.
# ---------------------------------------------------------------------------

EXPORT_ROOT="${REPO_ROOT}/exports"
mkdir -p "$EXPORT_ROOT"
ok "exports/ root in place"

# ---------------------------------------------------------------------------
# 9. Nextra server npm install
#
# .pi/server/ is the local Next.js + Nextra app that serves rendered
# presentations (/v/...) and exported PDFs (/p/...). Its node_modules/ is
# gitignored, so fresh clones need an install. `npm ci` is the right call
# when node_modules is absent (faster, lockfile-respecting); fall back to
# `npm install` for re-runs that might be picking up new deps.
#
# Notable deps (declared in .pi/server/package.json — installed automatically
# by the steps below, listed here so failures are easier to diagnose):
#   • next, nextra, react, react-dom — the framework + theme.
#   • @theguild/remark-mermaid       — emits <Mermaid> elements for fenced
#                                       ```mermaid blocks.
#   • @mermaid-js/layout-elk         — Eclipse Layout Kernel renderer.
#                                       Mermaid's flowchart engine is set to
#                                       "elk" in components/mermaid.tsx, so
#                                       a missing layout-elk module breaks
#                                       every flowchart on the site. The
#                                       verification step below catches this.
#   • remark-github-blockquote-alert — GFM callouts (> [!NOTE] etc.).
# ---------------------------------------------------------------------------

SERVER_DIR="${REPO_ROOT}/.pi/server"

if [[ -f "${SERVER_DIR}/package.json" ]]; then
	if [[ -d "${SERVER_DIR}/node_modules" ]]; then
		info "Nextra server deps present — running npm install to pick up any changes…"
		(cd "$SERVER_DIR" && npm install --no-audit --no-fund) || warn "npm install in .pi/server failed — re-run manually"
	else
		info "installing Nextra server deps (npm ci in .pi/server)…"
		(cd "$SERVER_DIR" && npm ci --no-audit --no-fund) || {
			warn "npm ci failed — falling back to npm install"
			(cd "$SERVER_DIR" && npm install --no-audit --no-fund) || fail "Could not install Nextra server deps. Run 'cd .pi/server && npm install' manually."
		}
	fi
	ok ".pi/server/ deps installed"

	# Verify the ELK layout module specifically — without it, every
	# flowchart on the site renders blank because mermaid.tsx registers
	# the elk loader at init time. Failing loudly here saves debugging
	# "why are all my diagrams broken" later.
	if [[ -d "${SERVER_DIR}/node_modules/@mermaid-js/layout-elk" ]]; then
		ok "@mermaid-js/layout-elk present (Mermaid flowchart layout engine)"
	else
		warn "@mermaid-js/layout-elk is missing from node_modules. Every Mermaid flowchart will fail to render. Run 'cd .pi/server && npm install @mermaid-js/layout-elk' to fix."
	fi
else
	info "no .pi/server/package.json — skipping Nextra install"
fi

# ---------------------------------------------------------------------------
# 10. Nextra server production build
#
# Pre-build the Next.js app so `pi` (or any caller) can start it via
# `next start` in production mode instead of `next dev`. Production mode
# is faster, lower-RAM, and matches what the cloudflared tunnel ends up
# serving. `next build` is idempotent and overwrites .pi/server/.next/.
# Soft-fail: if the build errors, setup keeps going — the dev script
# (`next dev`) is still a valid fallback.
# ---------------------------------------------------------------------------

if [[ -f "${SERVER_DIR}/package.json" && -d "${SERVER_DIR}/node_modules" ]]; then
	info "building Nextra server for production (npm run build in .pi/server)…"
	# Source .env so build-time env vars (e.g. AGENTS_TEAM_SERVER_TITLE) get
	# baked into the static HTML. layout.tsx reads them at build time — without
	# this, the navbar wordmark stays at its default. Subshell isolates the
	# `set -a` from the rest of the script.
	if (
		cd "$SERVER_DIR"
		if [[ -f "${REPO_ROOT}/.env" ]]; then
			set -a
			# shellcheck disable=SC1091
			source "${REPO_ROOT}/.env"
			set +a
		fi
		npm run build --silent
	); then
		ok ".pi/server/ production build complete (.next/ generated)"
	else
		warn ".pi/server/ build failed — server can still run via 'cd .pi/server && npm run dev'. Re-run 'npm run build' there once the error is fixed."
	fi
else
	info "no .pi/server/node_modules — skipping production build"
fi

# ---------------------------------------------------------------------------
# 11. Legacy artifact cleanup
#
# Removes folders, tmp files, and Docker containers left behind by earlier
# experiments — old frontend attempts (pi-rpc-shim, Open WebUI, piclaw) and
# retired extensions (meta-logger and its orphan log dir). Idempotent —
# silent when there's nothing to clean.
# ---------------------------------------------------------------------------

removed_any=false

# Repo-local folders left by the shim, piclaw bind mounts, or retired extensions.
for legacy_dir in services home .piclaw .pi/extensions/meta-logger .pi/meta-logs; do
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
	ok "legacy artifacts cleaned up"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

cat <<EOF

Setup complete. Next steps:

  • Pi CLI:   pi    (from this repo root)
  • Web UI:   not yet wired in — being built from scratch

EOF
