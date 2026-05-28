#!/usr/bin/env bash
#
# Phase: Build and install Nextra server

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

find_repo_root

SERVER_DIR="${REPO_ROOT}/.pi/server"

# ---------------------------------------------------------------------------
# Nextra server pnpm install
# ---------------------------------------------------------------------------

if [[ -f "${SERVER_DIR}/package.json" ]]; then
	if [[ -d "${SERVER_DIR}/node_modules" ]]; then
		info "Nextra server deps present — running pnpm install to pick up any changes…"
		(cd "$SERVER_DIR" && pnpm install) || warn "pnpm install in .pi/server failed — re-run manually"
	else
		info "installing Nextra server deps (pnpm install --frozen-lockfile in .pi/server)…"
		(cd "$SERVER_DIR" && pnpm install --frozen-lockfile) || {
			warn "pnpm install --frozen-lockfile failed — falling back to pnpm install"
			(cd "$SERVER_DIR" && pnpm install) || fail "Could not install Nextra server deps. Run 'cd .pi/server && pnpm install' manually."
		}
	fi
	ok ".pi/server/ deps installed"

	# Verify the ELK layout module specifically.
	if [[ -d "${SERVER_DIR}/node_modules/@mermaid-js/layout-elk" ]]; then
		ok "@mermaid-js/layout-elk present (Mermaid flowchart layout engine)"
	else
		warn "@mermaid-js/layout-elk is missing from node_modules. Every Mermaid flowchart will fail to render. Run 'cd .pi/server && pnpm add @mermaid-js/layout-elk' to fix."
	fi

	# Verify the math toolchain.
	missing_math=()
	[[ -d "${SERVER_DIR}/node_modules/remark-math"  ]] || missing_math+=("remark-math")
	[[ -d "${SERVER_DIR}/node_modules/rehype-katex" ]] || missing_math+=("rehype-katex")
	[[ -d "${SERVER_DIR}/node_modules/katex"        ]] || missing_math+=("katex")
	if [[ ${#missing_math[@]} -eq 0 ]]; then
		ok "remark-math + rehype-katex + katex present (LaTeX math pipeline)"
	else
		warn "math pipeline modules missing from node_modules: ${missing_math[*]}. LaTeX formulas will not render. Run 'cd .pi/server && pnpm add ${missing_math[*]}' to fix."
	fi
else
	info "no .pi/server/package.json — skipping Nextra install"
	exit 0
fi

# ---------------------------------------------------------------------------
# Nextra server production build
# ---------------------------------------------------------------------------

if [[ -f "${SERVER_DIR}/package.json" && -d "${SERVER_DIR}/node_modules" ]]; then
	info "building Nextra server for production (pnpm build in .pi/server)…"
	# Source .env so build-time env vars get baked into the static HTML.
	if (
		cd "$SERVER_DIR"
		if [[ -f "${REPO_ROOT}/.env" ]]; then
			set -a
			# shellcheck disable=SC1091
			source "${REPO_ROOT}/.env"
			set +a
		fi
		pnpm build --silent
	); then
		ok ".pi/server/ production build complete (.next/ generated)"
	else
		warn ".pi/server/ build failed — server can still run via 'cd .pi/server && pnpm dev'. Re-run 'pnpm build' there once the error is fixed."
	fi
else
	info "no .pi/server/node_modules — skipping production build"
fi
