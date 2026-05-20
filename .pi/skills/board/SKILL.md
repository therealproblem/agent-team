---
description: Shared reference for the per-project kanban board. Vault layout, project metadata schema, card schema, status lifecycle. Read this when you (under any persona) start, update, or close work that's worth tracking on the board.
---

# Board

A read-only kanban view at `http://localhost:8080/board` shows every project under `<vault>/projects/<slug>/`. The UI never writes — **you** write by editing markdown files in the vault. Refresh the page to see changes.

## Vault layout

```
<vault>/projects/
└── <project-slug>/
    ├── project.md           # project metadata + description
    └── board/
        └── <card-slug>.md   # one file per card
```

The project's `slug` is the directory name. A card's `slug` is its filename without `.md`.

## Who uses it

Only the **pm** and **engineer** personas write to the board. The other top-level personas (educator, language, trader) don't track work this way — their workflows are managed by their own extensions (`srs`, `trade-journal`, etc.) and don't belong on a kanban.

## `project.md` schema

```yaml
---
name: "Human-readable project name"
status: active            # active | paused | done | archived
owner: engineer           # optional — pm | engineer
tags: [internal]          # optional
created: 2026-05-19
updated: 2026-05-19
---

One-paragraph description. Goals, scope, links to PRDs / ADRs / decision memos
in the vault. The board UI shows this under the project name.
```

Missing fields fall back: `name` → directory slug, `status` → `active`, `owner` → unassigned, dates → omitted.

## Card schema (`board/<card-slug>.md`)

```yaml
---
title: "Wire up Telegram polling fallback"
status: in_progress       # backlog | in_progress | in_review | blocked | done
persona: engineer         # pm | engineer
sub_persona: backend      # optional; one of the persona's inner skills
link: engineering/adr/2026-05-12-telegram-transport.md  # optional vault-relative
priority: p1              # optional: p0 | p1 | p2 | p3
tags: [telegram, bot]     # optional
created: 2026-05-18
updated: 2026-05-19
---

Short description in markdown. Why it matters, acceptance criteria, links.
The board shows the first ~160 chars truncated; full text is fine here.
```

Missing/invalid `status` → `backlog` (with a small warning badge on the card). Missing `persona` → unassigned (still filterable). `link` is a vault-relative path — the board renders it as a small link to `/v/<slug>` (useful when the linked note has been published via `render-html`).

## Sub-personas

Each top-level persona has a fixed set of inner skills. Use them as the `sub_persona:` value when relevant:

- **pm**: `prd`, `roadmap`, `stakeholder-summary`, `user-research`, `uiux`, `copywriter`
- **engineer**: `frontend`, `backend`, `uiux`, `devops`, `debugger`, `refactor`

## Status lifecycle

```
backlog  →  in_progress  →  in_review  →  done
                ↓
             blocked    (move back to in_progress when unblocked)
```

Flip `status:` as work progresses and update `updated:` to today's date. Don't delete cards when work finishes — set `status: done` so the trail remains.

## When to drop a card

**Always** — under the pm persona, and inside any spawn of the engineer subagent, every unit of work the user gives you gets a card. The board is the canonical surface where the user tracks what you're doing for them; if work isn't on the board, from the user's perspective it isn't happening. PM creates and routes cards; engineer updates the one card it was spawned for and never creates new ones (it returns `NEEDS_DECISION` for new branches and lets PM decide).

This includes:
- Multi-session work — drop the card at the start, keep it updated.
- Single-session work — drop the card when you start, flip to `done` when you finish in the same turn.
- Exploratory questions and tiny edits — still a card. Set `priority: p3` and move straight through to `done` if it lands in one turn.
- Anything the user explicitly says "don't bother tracking" — that's the only carve-out.

## Filename conventions

- Slug: lowercase, hyphen-separated, derived from the title (`wire-up-polling-fallback.md`)
- One card per file — never bundle multiple work items in a single markdown file
- Order in the column is determined by `status`, then `priority`, then `updated:` descending
