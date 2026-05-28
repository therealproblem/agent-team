#!/usr/bin/env bash
#
# Phase: Install Node.js tools (Pi, leaf)

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

# ---------------------------------------------------------------------------
# Node + pnpm (prerequisites for Pi)
# ---------------------------------------------------------------------------

if ! have node; then
	fail "Node.js is required (≥20). Install via nvm (https://github.com/nvm-sh/nvm) or your package manager, then re-run."
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if (( NODE_MAJOR < 20 )); then
	fail "Node.js ≥ 20 required. You have $(node -v). Upgrade and re-run."
fi

if ! have pnpm; then
	if have corepack; then
		info "pnpm not found — enabling via corepack…"
		corepack enable pnpm >/dev/null 2>&1 || warn "corepack enable pnpm failed"
	fi
	if ! have pnpm; then
		fail "pnpm is required. Install via 'corepack enable pnpm' (Node ≥ 16.10) or follow https://pnpm.io/installation, then re-run."
	fi
fi
ok "Node $(node -v), pnpm $(pnpm -v)"

# ---------------------------------------------------------------------------
# Pi (the agent runtime)
# ---------------------------------------------------------------------------

if have pi; then
	# pi --version writes to stderr; capture both streams.
	ok "pi already installed ($(pi --version 2>&1 || echo unknown))"
else
	info "installing @earendil-works/pi-coding-agent globally…"
	pnpm add -g @earendil-works/pi-coding-agent
	ok "pi installed ($(pi --version 2>&1))"
fi

# ---------------------------------------------------------------------------
# leaf (TUI markdown viewer used by the show-md skill)
#
# `leaf` is invoked by .pi/extensions/show-md/ in a tmux side pane to display
# vault markdown next to the Pi pane. Upstream ships an npm-registry wrapper
# around its Rust binary — same install pattern as Pi above. The published
# binary is fetched on install, no Cargo toolchain required.
# ---------------------------------------------------------------------------

if have leaf; then
	ok "leaf already installed ($(leaf --version 2>&1 | head -1 || echo unknown))"
else
	info "installing @rivolink/leaf globally…"
	pnpm add -g @rivolink/leaf
	if have leaf; then
		ok "leaf installed ($(leaf --version 2>&1 | head -1 || echo unknown))"
	else
		warn "leaf install completed but \`leaf\` is not on PATH — check 'pnpm bin -g' is in your PATH"
	fi
fi
