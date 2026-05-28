#!/usr/bin/env bash
#
# Phase: Install CodeGraph (local code knowledge graph + MCP server for Pi)
#
# CodeGraph indexes the TS/JS/Python code in this repo into a local SQLite
# graph that the engineer subagent queries via MCP. The .pi/mcp.json file
# that wires it into Pi is checked into the repo; this phase installs the
# binary and builds the per-developer index under .codegraph/ (gitignored).
#
# Re-running is safe: the binary install is skipped if present, and the
# index is incrementally synced if it already exists.

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

find_repo_root

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

if ! have node; then
	fail "Node.js required. Run scripts/phases/install-node-tools.sh first."
fi

if [[ ! -f "$REPO_ROOT/.pi/mcp.json" ]]; then
	warn ".pi/mcp.json missing — Pi won't see codegraph after install. Restore from git or recreate."
fi

# ---------------------------------------------------------------------------
# Install codegraph binary
# ---------------------------------------------------------------------------

if have codegraph; then
	ok "codegraph already installed ($(codegraph --version 2>&1 | head -1))"
else
	info "installing @colbymchenry/codegraph globally…"
	pnpm add -g @colbymchenry/codegraph
	if have codegraph; then
		ok "codegraph installed ($(codegraph --version 2>&1 | head -1))"
	else
		fail "codegraph install completed but \`codegraph\` is not on PATH — check 'pnpm bin -g' is in your PATH"
	fi
fi

# ---------------------------------------------------------------------------
# Initialize + index the repo
# ---------------------------------------------------------------------------

cd "$REPO_ROOT"

if [[ ! -d ".codegraph" ]]; then
	info "initializing codegraph in repo…"
	codegraph init . >/dev/null
fi

if [[ -f ".codegraph/codegraph.db" ]]; then
	info "syncing codegraph index (incremental)…"
	if ! codegraph sync . >/dev/null 2>&1; then
		warn "codegraph sync failed — falling back to full rebuild"
		codegraph index . --force >/dev/null
	fi
else
	info "building codegraph index (first run can take a minute on a large repo)…"
	codegraph index . >/dev/null
fi

ok "codegraph index ready"
codegraph status 2>&1 | tail -20 || true
