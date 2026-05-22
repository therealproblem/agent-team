#!/usr/bin/env bash
#
# Phase: Install Python research dependencies (bs4 + requests)

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

if have python3; then
	PY_RESEARCH_DEPS=(beautifulsoup4 requests)
	if python3 -c 'import bs4, requests' >/dev/null 2>&1; then
		ok "python3: bs4 + requests already importable"
	else
		info "installing Python research deps: ${PY_RESEARCH_DEPS[*]}…"
		PIP_OUT=""
		if ! PIP_OUT="$(python3 -m pip install --user --quiet "${PY_RESEARCH_DEPS[@]}" 2>&1)"; then
			if [[ "$PIP_OUT" == *"externally-managed-environment"* ]]; then
				info "  PEP 668 environment — retrying with --break-system-packages"
				PIP_OUT="$(python3 -m pip install --user --break-system-packages --quiet "${PY_RESEARCH_DEPS[@]}" 2>&1)" || true
			fi
		fi
		if python3 -c 'import bs4, requests' >/dev/null 2>&1; then
			ok "python3: bs4 + requests installed"
		else
			warn "could not install Python research deps. Research runs that shell out to Python will fail with ModuleNotFoundError. Install manually: python3 -m pip install --user beautifulsoup4 requests"
			[[ -n "$PIP_OUT" ]] && printf '%s\n' "$PIP_OUT" | sed 's/^/    /' >&2
		fi
	fi
else
	warn "python3 not found — skipping Python research deps install. Pi's research skill sometimes shells out to a Python heredoc using bs4/requests; those calls will fail until python3 + pip are installed."
fi
