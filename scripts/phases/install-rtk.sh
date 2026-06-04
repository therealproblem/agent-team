#!/usr/bin/env bash
#
# Phase: Install rtk (https://github.com/rtk-ai/rtk)
#
# rtk is a CLI proxy that filters/compresses common command outputs (ls, cat,
# grep, git, test runners…) before they reach an LLM context — single Rust
# binary, no runtime deps. We install it globally so Pi/Claude subprocesses
# pick it up.

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

find_repo_root
detect_platform

if have rtk; then
	ok "rtk already installed ($(rtk --version 2>&1 | head -1))"
	exit 0
fi

case "$OS" in
	Darwin)
		if have brew; then
			info "installing rtk via Homebrew…"
			brew install rtk
		else
			info "Homebrew not found — falling back to upstream install.sh"
			curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
		fi
		;;
	Linux)
		info "installing rtk via upstream install.sh…"
		curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
		;;
	*)
		fail "Unsupported OS for rtk install: $OS"
		;;
esac

if have rtk; then
	ok "rtk installed ($(rtk --version 2>&1 | head -1))"
else
	warn "rtk install completed but \`rtk\` is not on PATH — you may need to add ~/.local/bin to PATH"
fi
