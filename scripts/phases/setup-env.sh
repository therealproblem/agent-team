#!/usr/bin/env bash
#
# Phase: Setup .env file and output directories

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

find_repo_root

ENV_FILE="${REPO_ROOT}/.env"
ENV_EXAMPLE="${REPO_ROOT}/.env.example"

# ---------------------------------------------------------------------------
# .env scaffold (preserves existing .env)
# ---------------------------------------------------------------------------

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
# exports/ root (for PDFs)
# ---------------------------------------------------------------------------

EXPORT_ROOT="${REPO_ROOT}/exports"
mkdir -p "$EXPORT_ROOT"
ok "exports/ root in place"

# ---------------------------------------------------------------------------
# renders/ real directory (generated MDX sources)
# ---------------------------------------------------------------------------

RENDERS_DIR="${REPO_ROOT}/renders"
OLD_RENDERS_TARGET="${REPO_ROOT}/.pi/server/content/v"

if [[ -L "$RENDERS_DIR" ]]; then
	# Symlink exists from the old setup — migrate files and convert to real dir.
	CURRENT_TARGET="$(readlink "$RENDERS_DIR")"
	info "migrating renders/ from symlink to real directory…"
	
	# Resolve the symlink target to an absolute path.
	if [[ "$CURRENT_TARGET" == /* ]]; then
		RESOLVED_TARGET="$CURRENT_TARGET"
	else
		RESOLVED_TARGET="${REPO_ROOT}/${CURRENT_TARGET}"
	fi
	
	# Copy files if the target exists and has content.
	if [[ -d "$RESOLVED_TARGET" ]]; then
		FILE_COUNT=$(find "$RESOLVED_TARGET" -maxdepth 1 -name "*.mdx" 2>/dev/null | wc -l | tr -d ' ')
		if (( FILE_COUNT > 0 )); then
			info "copying ${FILE_COUNT} .mdx file(s) from ${RESOLVED_TARGET}…"
			# Create a temporary directory to hold the files.
			TMP_DIR="${REPO_ROOT}/.renders-migration-tmp"
			mkdir -p "$TMP_DIR"
			cp "${RESOLVED_TARGET}/"*.mdx "$TMP_DIR/" 2>/dev/null || true
			# Remove the symlink.
			rm "$RENDERS_DIR"
			# Create the real directory.
			mkdir -p "$RENDERS_DIR"
			# Move files from temp to new location.
			mv "$TMP_DIR/"*.mdx "$RENDERS_DIR/" 2>/dev/null || true
			rmdir "$TMP_DIR"
			ok "migrated ${FILE_COUNT} files to renders/"
		else
			# No files to migrate — just remove symlink and create directory.
			rm "$RENDERS_DIR"
			mkdir -p "$RENDERS_DIR"
			ok "converted renders/ from symlink to real directory (no files to migrate)"
		fi
	else
		# Target doesn't exist — just remove symlink and create directory.
		rm "$RENDERS_DIR"
		mkdir -p "$RENDERS_DIR"
		ok "converted renders/ from symlink to real directory"
	fi
elif [[ -d "$RENDERS_DIR" ]]; then
	# Already a real directory — nothing to do.
	ok "renders/ directory already exists"
else
	# Nothing at renders/ — create the directory.
	mkdir -p "$RENDERS_DIR"
	ok "renders/ directory created"
fi
