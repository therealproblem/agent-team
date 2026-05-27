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
# Artifact roots inside the vault
#
# Defaults mirror the runtime resolution in obsidian-vault/index.ts:
#   <vault>/artifacts/exports  ← PDFs from `export` skill
#   <vault>/artifacts/renders  ← .mdx pages from `render-html` skill
# AGENTS_TEAM_VAULT_PATH (or <repo>/vault) sources the vault root; explicit
# AGENTS_TEAM_{EXPORT,RENDERS}_PATH overrides win.
# ---------------------------------------------------------------------------

VAULT_ROOT="${AGENTS_TEAM_VAULT_PATH:-${REPO_ROOT}/vault}"
EXPORT_ROOT="${AGENTS_TEAM_EXPORT_PATH:-${VAULT_ROOT}/artifacts/exports}"
RENDERS_DIR="${AGENTS_TEAM_RENDERS_PATH:-${VAULT_ROOT}/artifacts/renders}"

mkdir -p "$EXPORT_ROOT"
ok "exports root in place (${EXPORT_ROOT})"

# One-time migration: legacy <repo>/renders/ and <repo>/exports/ get folded
# into the vault artifact tree. Safe to run repeatedly — only acts if the
# legacy directory still exists at the repo root.
LEGACY_RENDERS="${REPO_ROOT}/renders"
LEGACY_EXPORTS="${REPO_ROOT}/exports"

if [[ -L "$LEGACY_RENDERS" ]]; then
	# Old setup used a symlink. Drop it now that renders live under the vault.
	rm "$LEGACY_RENDERS"
	ok "removed legacy renders/ symlink at repo root"
elif [[ -d "$LEGACY_RENDERS" ]]; then
	FILE_COUNT=$(find "$LEGACY_RENDERS" -maxdepth 1 -name "*.mdx" 2>/dev/null | wc -l | tr -d ' ')
	if (( FILE_COUNT > 0 )); then
		info "migrating ${FILE_COUNT} legacy renders/*.mdx into ${RENDERS_DIR}…"
		mkdir -p "$RENDERS_DIR"
		mv "${LEGACY_RENDERS}/"*.mdx "$RENDERS_DIR/" 2>/dev/null || true
	fi
	rmdir "$LEGACY_RENDERS" 2>/dev/null && ok "removed legacy renders/ at repo root" || true
fi

if [[ -d "$LEGACY_EXPORTS" && ! -L "$LEGACY_EXPORTS" ]]; then
	FILE_COUNT=$(find "$LEGACY_EXPORTS" -maxdepth 1 -name "*.pdf" 2>/dev/null | wc -l | tr -d ' ')
	if (( FILE_COUNT > 0 )); then
		info "migrating ${FILE_COUNT} legacy exports/*.pdf into ${EXPORT_ROOT}…"
		mv "${LEGACY_EXPORTS}/"*.pdf "$EXPORT_ROOT/" 2>/dev/null || true
	fi
	rmdir "$LEGACY_EXPORTS" 2>/dev/null && ok "removed legacy exports/ at repo root" || true
fi

mkdir -p "$RENDERS_DIR"
ok "renders root in place (${RENDERS_DIR})"

# ---------------------------------------------------------------------------
# Memory tree inside the vault
#
# Defaults mirror the runtime resolution in reminders/, subagent/, and the
# Next.js news routes:
#   <vault>/.memory/profiles/                ← persona/reviewer profiles
#   <vault>/.memory/reminders.md             ← open-todo list (reminders ext)
#   <vault>/.memory/news-bookmarks.json      ← user-saved news items
#   <vault>/.memory/research-log.{jsonl,md}  ← cross-run research logbook
# AGENTS_TEAM_MEMORY_PATH overrides the root; otherwise it tracks the vault.
# The leading dot keeps Obsidian's file list focused on hand-authored notes.
# ---------------------------------------------------------------------------

MEMORY_ROOT="${AGENTS_TEAM_MEMORY_PATH:-${VAULT_ROOT}/.memory}"
mkdir -p "$MEMORY_ROOT"

# One-time migration: legacy files under .pi/state/ get folded into the vault
# memory tree. Safe to re-run — only acts when the legacy file still exists
# AND the new location is empty for that file (so a previously-migrated
# install never has its current state overwritten).
LEGACY_STATE="${REPO_ROOT}/.pi/state"

# Helper: move a single file from legacy to memory tree if legacy exists and
# destination is missing. Args: <legacy path> <dest path> <human label>.
migrate_memory_file() {
	local src="$1" dst="$2" label="$3"
	if [[ -f "$src" ]]; then
		if [[ -e "$dst" ]]; then
			info "skipping ${label} migration — ${dst} already exists; leaving legacy ${src} in place for you to inspect"
		else
			mkdir -p "$(dirname "$dst")"
			mv "$src" "$dst"
			ok "migrated ${label} → ${dst}"
		fi
	fi
}

migrate_memory_file "${LEGACY_STATE}/reminders.md"        "${MEMORY_ROOT}/reminders.md"        "reminders.md"
migrate_memory_file "${LEGACY_STATE}/news-bookmarks.json" "${MEMORY_ROOT}/news-bookmarks.json" "news-bookmarks.json"
migrate_memory_file "${LEGACY_STATE}/research-log.jsonl"  "${MEMORY_ROOT}/research-log.jsonl"  "research-log.jsonl"
migrate_memory_file "${LEGACY_STATE}/research-log.md"     "${MEMORY_ROOT}/research-log.md"     "research-log.md"

# profiles/ is a directory of per-domain .md files. Move each profile that
# doesn't already exist in the new location; only rmdir the legacy folder
# when nothing is left behind, so a half-migrated install stays loud.
LEGACY_PROFILES="${LEGACY_STATE}/profiles"
if [[ -d "$LEGACY_PROFILES" ]]; then
	mkdir -p "${MEMORY_ROOT}/profiles"
	MOVED=0
	SKIPPED=0
	while IFS= read -r -d '' src; do
		base="$(basename "$src")"
		dst="${MEMORY_ROOT}/profiles/${base}"
		if [[ -e "$dst" ]]; then
			SKIPPED=$((SKIPPED + 1))
		else
			mv "$src" "$dst"
			MOVED=$((MOVED + 1))
		fi
	done < <(find "$LEGACY_PROFILES" -maxdepth 1 -type f -name "*.md" -print0)

	if (( MOVED > 0 )); then
		ok "migrated ${MOVED} profile(s) → ${MEMORY_ROOT}/profiles/"
	fi
	if (( SKIPPED > 0 )); then
		info "skipped ${SKIPPED} profile(s) — destination filenames already exist; legacy copies left in ${LEGACY_PROFILES}/ for you to inspect"
	fi
	rmdir "$LEGACY_PROFILES" 2>/dev/null && ok "removed legacy profiles/ at .pi/state/" || true
fi

ok "memory root in place (${MEMORY_ROOT})"
