#!/usr/bin/env bash
#
# Re-apply locally-maintained patches to gitignored .pi/npm/ packages.
#
#   bash scripts/apply-patches.sh
#
# Run from repo root after `pi install -l` (called automatically at the end of
# scripts/setup.sh). Idempotent — patches already applied are skipped silently.
#
# Patch files live in scripts/patches/ and use the patch-package naming
# convention <package>+<version>.patch so version drift is obvious at a glance.
# Header lines starting with `#` are ignored by patch(1) and used for context.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH_DIR="${REPO_ROOT}/scripts/patches"
NPM_ROOT="${REPO_ROOT}/.pi/npm/node_modules"

C_RESET='\033[0m'
C_BLUE='\033[34m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'
C_RED='\033[31m'

info() { printf "${C_BLUE}[info]${C_RESET}  %s\n" "$*"; }
ok()   { printf "${C_GREEN}[ok]${C_RESET}    %s\n" "$*"; }
warn() { printf "${C_YELLOW}[warn]${C_RESET}  %s\n" "$*" >&2; }
fail() { printf "${C_RED}[fail]${C_RESET}  %s\n" "$*" >&2; exit 1; }

if [[ ! -d "$PATCH_DIR" ]]; then
	info "no scripts/patches/ — nothing to apply"
	exit 0
fi

shopt -s nullglob
patches=("$PATCH_DIR"/*.patch)
shopt -u nullglob

if (( ${#patches[@]} == 0 )); then
	info "no .patch files in scripts/patches/"
	exit 0
fi

if [[ ! -d "$NPM_ROOT" ]]; then
	fail ".pi/npm/node_modules/ not found — run 'bash scripts/setup.sh' first"
fi

any_failed=false

for patch_file in "${patches[@]}"; do
	patch_name=$(basename "$patch_file")
	# Three states to distinguish:
	#   1. Original form on disk → forward dry-run exits 0 → apply for real.
	#   2. Patched form on disk → forward dry-run exits 1 with "previously applied" → skip.
	#   3. Neither → real version drift → surface for human review.
	# --batch makes patch non-interactive (won't prompt to auto-reverse-detect).
	if output=$(patch -p1 -d "$NPM_ROOT" --forward --batch --dry-run < "$patch_file" 2>&1); then
		patch -p1 -d "$NPM_ROOT" --forward --batch --silent < "$patch_file" >/dev/null 2>&1
		ok "applied: $patch_name"
	elif echo "$output" | grep -q "previously applied"; then
		ok "already applied: $patch_name"
	else
		warn "could not apply $patch_name — package version drift? inspect the patch"
		any_failed=true
	fi
done

if [[ "$any_failed" == "true" ]]; then
	exit 1
fi
