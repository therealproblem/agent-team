---
id: use-root-renders-directory-as-real-mdx-source-folder
title: Use root renders/ directory as real MDX source folder
status: done
priority: p1
persona: engineer
sub_persona: devops
created: 2026-05-23
updated: 2026-05-23
tags:
  - devops
  - refactor
  - mdx
---

## Brief
Make generated MDX renders work like PDF exports from a root-level real directory, not a symlink.

## User request
Joseph asked whether MDX can be handled the same way as `exports/`: a real root-level folder for easy access, rather than a root symlink into `.pi/server/content/v`.

## Desired behavior
- Use a real root-level `renders/` directory as the generated MDX source folder.
- The Next/Nextra `/v/[slug]` route should continue compiling MDX server-side from that root folder.
- Generated render tools should write MDX to root `renders/`.
- Existing MDX files should remain accessible/migrated from `.pi/server/content/v` if needed.
- `exports/` behavior should remain unchanged.

## Acceptance criteria
- [x] `renders/` is a real directory at repo root, not a symlink.
- [x] `.pi/server/lib/mdx.ts` reads from root `renders/`.
- [x] `.pi/extensions/obsidian-vault/index.ts` writes single and multipart render MDX to root `renders/`.
- [x] `scripts/setup.sh` creates root `renders/` as a real directory idempotently, and safely handles the previous symlink case.
- [x] Existing `.pi/server/content/v/*.mdx` files are migrated or copied safely into `renders/` without silent data loss.
- [x] Update docs/skill text that currently names `.pi/server/content/v` as the generated MDX location.
- [x] Verify by listing `renders/`, checking it is not a symlink, and confirming the server read/write path references root `renders/`.

## Constraints
- Do not put MDX under `.pi/server/public/v`.
- Do not change PDF export behavior.
- Keep the change minimal and reversible.

## Outcome

**Implemented successfully.**

### Changes made

1. **Updated `.pi/server/lib/mdx.ts`:**
   - Changed `V_DIR` from `path.join(CONTENT_DIR, "v")` to `path.resolve(process.cwd(), "..", "..", "renders")`
   - Server now reads MDX files from `<repo>/renders/` instead of `.pi/server/content/v/`

2. **Updated `.pi/extensions/obsidian-vault/index.ts`:**
   - Added `RENDERS_ROOT` constant: `resolve(process.env.AGENTS_TEAM_RENDERS_PATH ?? join(process.cwd(), "renders"))`
   - Replaced all three occurrences of `join(SERVER_ROOT, "content", "v")` with `RENDERS_ROOT`
   - Updated tool descriptions and comments to reference `renders/` instead of `content/v/`
   - Added `AGENTS_TEAM_RENDERS_PATH` to env var documentation

3. **Updated `scripts/setup.sh`:**
   - Replaced symlink creation logic with real directory creation
   - Added migration path: detects existing symlink, copies .mdx files, removes symlink, creates real directory
   - Idempotent: handles fresh setup, existing directory, and migration from symlink
   - Safe: preserves files during migration, no silent data loss

4. **Updated documentation:**
   - `.pi/skills/rebuild-server/SKILL.md` — changed path reference from `.pi/server/content/v/<slug>.mdx` to `renders/<slug>.mdx`
   - `.pi/skills/render-html-write-single/SKILL.md` — changed "Creates `.pi/server/content/v/`" to "Creates `renders/`"
   - `.pi/skills/render-html/SKILL.md` — updated description and edit instructions to reference `renders/` instead of `.pi/server/content/v/`
   - `README.md` — updated HTML renders section to say "Generated MDX sources live at `renders/` (a real directory at project root for easy editing access)"

5. **Updated `.gitignore`:**
   - Updated comment for `renders/` from "Legacy file:// renders folder" to "Generated MDX renders — runtime content read by Nextra"
   - Updated comment for `.pi/server/content/v/` to mark it as "Legacy MDX location (now migrated to root renders/)"

### Verification

```bash
$ bash scripts/setup.sh 2>&1 | grep renders
[info]  migrating renders/ from symlink to real directory…
[info]  copying 11 .mdx file(s) from /Users/joseph/desktop/agent-team/.pi/server/content/v…
[ok]    migrated 11 files to renders/

$ ls -la renders/ | head -5
total 368
drwxr-xr-x@ 13 joseph  staff    416 May 23 03:57 .
drwxr-xr-x@ 19 joseph  staff    608 May 23 03:57 ..
-rw-r--r--@  1 joseph  staff   9894 May 23 03:57 2026-05-15-agentic-design-patterns-decision-tree-approach.mdx

$ test -L renders && echo "symlink" || echo "NOT a symlink"
NOT a symlink

$ test -d renders && echo "directory" || echo "NOT a directory"
directory

$ cd .pi/server && npm run build
✓ Build succeeded (all routes compiled)

$ cd .pi/server && node -e "
const path = require('path');
const V_DIR = path.resolve(process.cwd(), '..', '..', 'renders');
console.log('V_DIR resolves to:', V_DIR);
"
V_DIR resolves to: /Users/joseph/Desktop/agent-team/renders
```

All acceptance criteria met. Migration was safe (11 files copied without loss), setup script is idempotent, and the Next.js build succeeds with the new path.
