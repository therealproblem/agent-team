#!/usr/bin/env bash
#
# Bootstrap a fresh machine to run this agents-team project.
# Idempotent: safe to re-run. Skips anything already installed/configured.
#
#   bash scripts/setup.sh
#
# Targets macOS today. Linux is partially supported via apt/dnf fallback for
# tmux; the Pi install step works on Linux too. Other platforms bail out.
#
# Run individual phases with:
#   bash scripts/phases/<phase-name>.sh
#
# Available phases:
#   stop-server          Stop any running server on AGENTS_TEAM_SERVER_PORT
#   install-tmux         Install and configure tmux
#   install-node-tools   Install Pi and leaf
#   install-rtk          Install rtk (LLM token-saving CLI proxy)
#   install-pi-packages  Install Pi project-local packages and patches
#   install-codegraph    Install codegraph CLI + index this repo for Pi MCP
#   setup-env            Setup .env and vault artifact directories
#   install-chrome       Install Chrome for PDF export
#   install-python-deps  Install Python research dependencies
#   build-server         Build and install Nextra server
#   setup-cron           Install news-cron crontab entry
#   cleanup-legacy       Clean up legacy artifacts
#   check-unicode        Check Unicode Braille support

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

for arg in "$@"; do
	case "$arg" in
		-h|--help)
			grep '^#' "$0" | sed -E 's/^# ?//' ; exit 0 ;;
		*)
			fail "Unknown argument: $arg"
			;;
	esac
done

find_repo_root
detect_platform

info "Starting setup — running all phases in sequence"
echo ""

# ---------------------------------------------------------------------------
# Phase execution
# ---------------------------------------------------------------------------

PHASES=(
	"stop-server:Stop any running server on port ${AGENTS_TEAM_SERVER_PORT:-8080}"
	"install-tmux:Install and configure tmux"
	"install-node-tools:Install Pi and leaf"
	"install-rtk:Install rtk (LLM token-saving CLI proxy)"
	"install-pi-packages:Install Pi project-local packages and patches"
	"install-codegraph:Install codegraph CLI + index this repo for Pi MCP"
	"setup-env:Setup .env and vault artifact directories"
	"install-chrome:Install Chrome for PDF export"
	"install-python-deps:Install Python research dependencies"
	"build-server:Build and install Nextra server"
	"setup-cron:Install news-cron crontab entry"
	"cleanup-legacy:Clean up legacy artifacts"
	"check-unicode:Check Unicode Braille support"
)

failed_phases=()

for phase_spec in "${PHASES[@]}"; do
	IFS=':' read -r phase_name phase_desc <<< "$phase_spec"
	echo ""
	info "=== Phase: ${phase_desc} ==="
	if bash "${SCRIPT_DIR}/phases/${phase_name}.sh"; then
		ok "Phase '${phase_name}' completed"
	else
		warn "Phase '${phase_name}' failed (exit code $?) — continuing with remaining phases"
		failed_phases+=("$phase_name")
	fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [[ ${#failed_phases[@]} -eq 0 ]]; then
	cat <<EOF
${C_GREEN}Setup complete!${C_RESET}

Next steps:

  • Pi CLI:   pi    (from this repo root)
  • Web UI:   not yet wired in — being built from scratch

EOF
else
	warn "Setup completed with ${#failed_phases[@]} failed phase(s):"
	for phase in "${failed_phases[@]}"; do
		warn "  - ${phase}"
	done
	echo ""
	info "Re-run failed phases individually with:"
	info "  bash scripts/phases/<phase-name>.sh"
	echo ""
	exit 1
fi
