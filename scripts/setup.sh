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
# 2. Stop the server holding our port
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
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# 3. tmux
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
# 4. Node + npm (prerequisite for Pi)
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
# 5. Pi (the agent runtime)
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
# 6. leaf (TUI markdown viewer used by the show-md skill)
#
# `leaf` is invoked by .pi/extensions/show-md/ in a tmux side pane to display
# vault markdown next to the Pi pane. Upstream ships an npm wrapper around
# its Rust binary — same install pattern as Pi above. The published binary is
# fetched on `npm install`, no Cargo toolchain required.
# ---------------------------------------------------------------------------

if have leaf; then
	ok "leaf already installed ($(leaf --version 2>&1 | head -1 || echo unknown))"
else
	info "installing @rivolink/leaf globally…"
	npm install -g @rivolink/leaf
	if have leaf; then
		ok "leaf installed ($(leaf --version 2>&1 | head -1 || echo unknown))"
	else
		warn "leaf install completed but \`leaf\` is not on PATH — check 'npm bin -g' is in your PATH"
	fi
fi

# ---------------------------------------------------------------------------
# 7. Pi project-local packages (restore from .pi/settings.json)
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
# 8. Local patches against .pi/npm/ packages
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
# 9. .env scaffold (preserves existing .env)
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
# 10. Chrome binary for PDF export
#
# `write_export_pdf` (in .pi/extensions/obsidian-vault/index.ts) shells out
# to headless Chrome to render HTML → PDF. On a fresh machine with no
# Chrome installed the tool returns isError: "no_chrome_binary". This step:
#   1. Honors an explicit AGENTS_TEAM_CHROME_PATH (env or .env).
#   2. Probes the same standard locations resolveChromeBinary() checks.
#   3. Falls back to `@puppeteer/browsers install chrome@stable`, which
#      drops Chrome-for-Testing into $PUPPETEER_CACHE_DIR (default
#      ~/.cache/puppeteer). We then pin the install path into .env as
#      AGENTS_TEAM_CHROME_PATH so the extension picks it up at runtime
#      without any code changes.
# ---------------------------------------------------------------------------

read_env_chrome_path() {
	[[ -f "$ENV_FILE" ]] || return 0
	# Last AGENTS_TEAM_CHROME_PATH=… wins; strip optional surrounding quotes.
	grep -E '^[[:space:]]*AGENTS_TEAM_CHROME_PATH=' "$ENV_FILE" \
		| tail -1 \
		| sed -E 's/^[[:space:]]*AGENTS_TEAM_CHROME_PATH=//; s/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/'
}

resolve_chrome_binary() {
	local candidates=()
	case "$OS" in
		Darwin)
			candidates=(
				"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
				"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
				"/Applications/Chromium.app/Contents/MacOS/Chromium"
			)
			;;
		Linux)
			candidates=(
				"/usr/bin/google-chrome"
				"/usr/bin/chromium"
				"/usr/bin/chromium-browser"
			)
			;;
	esac
	local cand
	for cand in "${candidates[@]}"; do
		if [[ -x "$cand" ]]; then
			printf '%s\n' "$cand"
			return
		fi
	done
}

set_env_chrome_path() {
	local path="$1"
	# Chrome-for-Testing paths contain spaces ("Google Chrome for Testing"),
	# and step 12 below sources .env into a `set -a` shell. An unquoted value
	# word-splits there and bash tries to exec the second word ("Chrome") as
	# a command, killing the build. Quote with double-quotes and escape any
	# embedded `\` or `"` so the sourced value round-trips intact.
	local escaped="${path//\\/\\\\}"
	escaped="${escaped//\"/\\\"}"
	local line="AGENTS_TEAM_CHROME_PATH=\"${escaped}\""
	if [[ -f "$ENV_FILE" ]] && grep -qE '^[[:space:]]*AGENTS_TEAM_CHROME_PATH=' "$ENV_FILE"; then
		local tmp
		tmp="$(mktemp)"
		awk -v l="$line" '
			/^[[:space:]]*AGENTS_TEAM_CHROME_PATH=/ { print l; replaced=1; next }
			{ print }
			END { if (!replaced) print l }
		' "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
	else
		{
			[[ -s "$ENV_FILE" ]] && echo ""
			echo "# Auto-set by scripts/setup.sh — Chrome installed via @puppeteer/browsers."
			echo "$line"
		} >> "$ENV_FILE"
	fi
	chmod 600 "$ENV_FILE" 2>/dev/null || true
}

CHROME_BIN=""

# 1. Explicit env override wins outright.
if [[ -n "${AGENTS_TEAM_CHROME_PATH:-}" && -x "${AGENTS_TEAM_CHROME_PATH}" ]]; then
	CHROME_BIN="$AGENTS_TEAM_CHROME_PATH"
fi

# 2. Pinned path inside .env (e.g. from a prior puppeteer install).
if [[ -z "$CHROME_BIN" ]]; then
	ENV_CHROME_PATH="$(read_env_chrome_path || true)"
	if [[ -n "$ENV_CHROME_PATH" && -x "$ENV_CHROME_PATH" ]]; then
		CHROME_BIN="$ENV_CHROME_PATH"
	fi
fi

# 3. Standard system locations (mirror resolveChromeBinary).
if [[ -z "$CHROME_BIN" ]]; then
	CHROME_BIN="$(resolve_chrome_binary || true)"
fi

if [[ -n "$CHROME_BIN" ]]; then
	ok "Chrome for PDF export: $CHROME_BIN"
else
	info "no Chrome found — installing Chrome-for-Testing via @puppeteer/browsers…"
	PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-${HOME}/.cache/puppeteer}"
	mkdir -p "$PUPPETEER_CACHE_DIR"
	# Final stdout line is `chrome@<version> <executable-path>` on success.
	# The path may contain spaces ("Google Chrome for Testing"), so split on
	# the first space only — don't use awk '$NF'.
	if INSTALL_OUT="$(npx -y @puppeteer/browsers install chrome@stable --path "$PUPPETEER_CACHE_DIR" 2>&1)"; then
		printf '%s\n' "$INSTALL_OUT" | sed -n '$p' | grep -q '^chrome@' && \
			CHROME_BIN="$(printf '%s\n' "$INSTALL_OUT" | sed -n '$p' | sed -E 's/^[^ ]+ //')"
	else
		warn "@puppeteer/browsers install failed:"
		printf '%s\n' "$INSTALL_OUT" | sed 's/^/    /' >&2
	fi

	if [[ -n "$CHROME_BIN" && -x "$CHROME_BIN" ]]; then
		ok "Chrome installed: $CHROME_BIN"
		# Ensure .env exists so we can pin the path; the scaffold step
		# above may have been skipped if no .env.example was present.
		[[ -f "$ENV_FILE" ]] || { : > "$ENV_FILE"; chmod 600 "$ENV_FILE" 2>/dev/null || true; }
		set_env_chrome_path "$CHROME_BIN"
		ok "pinned AGENTS_TEAM_CHROME_PATH in .env"
	else
		warn "Could not install Chrome via @puppeteer/browsers. PDF export will fail until you install Google Chrome / Chromium or set AGENTS_TEAM_CHROME_PATH manually."
	fi
fi

# ---------------------------------------------------------------------------
# 11. exports/ root
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
# 12. Nextra server npm install
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
#   • remark-math + rehype-katex     — pre-renders $…$ inline and $$…$$ block
#                                       LaTeX to KaTeX HTML at compile time.
#                                       The matching katex/dist/katex.min.css
#                                       is @imported from styles/globals.css,
#                                       so a missing `katex` module (pulled
#                                       in transitively by rehype-katex)
#                                       breaks every math formula on the
#                                       site. The verification step below
#                                       catches this.
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

	# Verify the math toolchain — remark-math parses $…$ / $$…$$ during MDX
	# compile, rehype-katex turns those nodes into KaTeX HTML, and the
	# katex npm package provides both the HTML emitter and the matching
	# stylesheet (imported by styles/globals.css). Any one missing means
	# every formula on the site renders as raw text or unstyled markup.
	missing_math=()
	[[ -d "${SERVER_DIR}/node_modules/remark-math"  ]] || missing_math+=("remark-math")
	[[ -d "${SERVER_DIR}/node_modules/rehype-katex" ]] || missing_math+=("rehype-katex")
	[[ -d "${SERVER_DIR}/node_modules/katex"        ]] || missing_math+=("katex")
	if [[ ${#missing_math[@]} -eq 0 ]]; then
		ok "remark-math + rehype-katex + katex present (LaTeX math pipeline)"
	else
		warn "math pipeline modules missing from node_modules: ${missing_math[*]}. LaTeX formulas will not render. Run 'cd .pi/server && npm install ${missing_math[*]}' to fix."
	fi
else
	info "no .pi/server/package.json — skipping Nextra install"
fi

# ---------------------------------------------------------------------------
# 13. Nextra server production build
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
# 14. news-cron crontab entry
#
# `scripts/news-cron.sh` calls `pi --no-session` against the news-ingest
# extension's `refresh_all_topics` tool. Without an installed crontab line
# nothing schedules it, so the daily news store stays empty until somebody
# runs `/news-refresh` interactively. Install a daily 07:00 entry if missing.
# Idempotent: matches on the absolute script path to detect prior installs.
# ---------------------------------------------------------------------------

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
		# the whole setup run (cron on macOS requires Full Disk Access for the
		# terminal app, otherwise `crontab -` fails with "Operation not
		# permitted" on the spool write).
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

# ---------------------------------------------------------------------------
# 15. Legacy artifact cleanup
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
# 16. Unicode Braille support (loading indicator)
#
# Pi and friends animate loading spinners with U+2800–U+28FF Braille Patterns
# (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏). These render correctly only when:
#   1. The locale is UTF-8 — otherwise the bytes get reinterpreted as latin-1
#      and the user sees mojibake instead of dots.
#   2. The terminal's font has glyphs for the Braille block. Modern monospace
#      fonts (SF Mono, Menlo, Cascadia, DejaVu Sans Mono, JetBrains Mono…)
#      all cover it, but bare Linux installs without a "symbols" font show
#      tofu boxes. No way to detect that from outside the terminal, so we
#      print a sample and let the user eyeball it.
# ---------------------------------------------------------------------------

CURRENT_LOCALE="${LC_ALL:-${LC_CTYPE:-${LANG:-}}}"
LOCALE_LOWER="$(printf '%s' "$CURRENT_LOCALE" | tr '[:upper:]' '[:lower:]')"
case "$LOCALE_LOWER" in
	*utf-8*|*utf8*)
		ok "UTF-8 locale: ${CURRENT_LOCALE}"
		;;
	"")
		warn "no locale set (LANG/LC_CTYPE/LC_ALL all empty) — braille spinners will likely render as '?'. Set 'export LANG=en_US.UTF-8' in your shell profile."
		;;
	*)
		warn "locale '${CURRENT_LOCALE}' is not UTF-8 — braille spinners will not render. Switch to a UTF-8 locale (e.g. 'export LANG=en_US.UTF-8') in your shell profile."
		;;
esac

# Print a sample frame so the user can confirm font coverage by eye.
printf "${C_BLUE}[info]${C_RESET}  braille spinner preview: ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏\n"
info "  if the line above shows boxes / '?' / question marks instead of dot patterns,"
info "  install a font with Unicode Braille glyphs (U+2800–U+28FF):"
case "$OS" in
	Darwin)
		info "    macOS bundles Braille glyphs in Menlo / SF Mono / Monaco — pick one in your terminal's font settings."
		;;
	Linux)
		# Best-effort: ask fontconfig whether any installed font covers U+2800.
		if have fc-list && fc-list :charset=2800 2>/dev/null | grep -q .; then
			ok "    fontconfig reports a font with U+2800 coverage already installed"
		else
			if have fc-list; then
				warn "    no font with U+2800 coverage detected via fc-list"
			else
				warn "    fontconfig (fc-list) not present — cannot auto-check font coverage"
			fi
			if have apt-get; then
				info "    Debian/Ubuntu: sudo apt-get install fonts-dejavu fonts-noto"
			elif have dnf; then
				info "    Fedora:        sudo dnf install dejavu-sans-mono-fonts google-noto-fonts-common"
			elif have pacman; then
				info "    Arch:          sudo pacman -S ttf-dejavu noto-fonts"
			else
				info "    Install a font like DejaVu Sans Mono or Noto Sans Symbols2 via your package manager."
			fi
		fi
		;;
esac

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

cat <<EOF

Setup complete. Next steps:

  • Pi CLI:   pi    (from this repo root)
  • Web UI:   not yet wired in — being built from scratch

EOF
