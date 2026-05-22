#!/usr/bin/env bash
#
# Common helpers for all setup scripts.
# Source this at the top of each script:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

set -euo pipefail

# ---------------------------------------------------------------------------
# Color codes and output helpers
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

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

detect_platform() {
	OS="$(uname -s)"
	ARCH="$(uname -m)"
	case "$OS" in
		Darwin) info "platform: macOS ($ARCH)" ;;
		Linux)  info "platform: Linux ($ARCH) — partial support (tmux via apt/dnf)" ;;
		*) fail "Unsupported OS: $OS. Run on macOS or Linux." ;;
	esac
	export OS ARCH
}

# ---------------------------------------------------------------------------
# Repo root detection
# ---------------------------------------------------------------------------

find_repo_root() {
	# Find repo root by walking up from the calling script's location.
	# Calling script is at ${BASH_SOURCE[1]} (the script that sourced common.sh).
	local script_path="${BASH_SOURCE[1]}"
	local script_dir="$(cd "$(dirname "$script_path")" && pwd)"
	
	# If we're in scripts/phases/, walk up two levels to repo root.
	# If we're in scripts/, walk up one level.
	if [[ "$script_dir" == */scripts/phases ]]; then
		REPO_ROOT="$(cd "$script_dir/../.." && pwd)"
	else
		REPO_ROOT="$(cd "$script_dir/.." && pwd)"
	fi
	export REPO_ROOT
	info "repo: $REPO_ROOT"
}
