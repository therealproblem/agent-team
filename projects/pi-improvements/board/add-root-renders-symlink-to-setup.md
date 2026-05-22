---
id: add-root-renders-symlink-to-setup
title: Add root-level renders symlink to setup
status: done
priority: p1
persona: engineer
sub_persona: devops
created: 2026-05-23
updated: 2026-05-23
tags:
  - devops
  - setup
  - symlink
---

## Brief

Implement Option A from the root-level access decision: add a root-level `renders` symlink pointing to `.pi/server/content/v`, and make `scripts/setup.sh` create/repair it idempotently.

## Context

Generated MDX render sources must remain under `.pi/server/content/v` so the Next/Nextra `/v/[slug]` route can compile them. Joseph wants easy root-level access for editing MDX. PDFs already live under root `exports/`.

Related decision card: `projects/pi-improvements/board/decision-root-level-access-to-generated-mdx-and-pdfs.md`

## Acceptance criteria

- [x] Project root has `renders -> .pi/server/content/v` symlink.
- [x] `.pi/server/content/v` exists before/when the symlink is created.
- [x] `scripts/setup.sh` creates the symlink idempotently on future setup runs.
- [x] If `renders` already exists as the correct symlink, setup does nothing.
- [x] If `renders` exists incorrectly, setup reports clearly and does not destroy user data silently.
- [x] Update relevant docs if there is an obvious place to mention `renders/` as the editable generated MDX access point.
- [x] Run a quick verification command showing the symlink target.

## Constraints

- Do not move `.pi/server/content/v`.
- Do not change the render pipeline or PDF export path.
- Keep the change minimal.

## Outcome

**Implemented successfully.**

### Changes made

1. **Added symlink creation logic to `scripts/setup.sh`** (new step 13, inserted after `exports/` setup):
   - Creates `.pi/server/content/v/` directory if missing
   - Creates `renders -> .pi/server/content/v` symlink at project root
   - Idempotent: detects existing correct symlinks and skips creation
   - Safe: warns and refuses to overwrite if `renders` exists as a file/directory
   - Safe: warns and preserves if `renders` is a symlink pointing elsewhere
   - Renumbered subsequent steps 14-18

2. **Updated README.md**:
   - Added note in "Vault, renders, exports" section explaining generated MDX sources live under `.pi/server/content/v/` and are accessible via the `renders/` symlink for easy editing
   - Added note that exported PDFs live under `exports/` at project root (parallel structure)

### Verification

```bash
$ ls -la renders
lrwxr-xr-x@ 1 joseph  staff  20 23 May 03:46 renders -> .pi/server/content/v

$ readlink renders
.pi/server/content/v

$ ls renders/ | head -3
2026-05-15-agentic-design-patterns-decision-tree-approach.mdx
2026-05-18-hermes-agent-complete-guide-2026.mdx
2026-05-18-jerome-powell-current-situation-may-2026.mdx
```

Setup re-runs correctly detect the existing symlink:

```bash
$ bash scripts/setup.sh 2>&1 | grep renders
[ok]    renders/ symlink already points to .pi/server/content/v
```

Error cases tested:
- `renders` exists as directory → fails with clear error, preserves user data
- `renders` exists as symlink to wrong target → warns and preserves existing symlink

All acceptance criteria met.
