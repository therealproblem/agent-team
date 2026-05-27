---
description: Default Layer 3 skill for writing to the Obsidian vault. ALL vault writes go through this skill — it is the only path. Produces well-formed markdown with YAML frontmatter, inline `#tags`, and `[[wiki-links]]` so Obsidian's graph view, backlinks, and search work correctly. Use for both short captures (one-liners, journal entries) and long-form artifacts (PRDs, design docs, lessons, reports, exec briefs) — the vault is markdown-first; length does not change the destination. If the user (or persona) wants the same content rendered as an interactive HTML page, call the `render-html` skill AFTER saving the markdown; render reads the saved note and produces an HTML file outside the vault. Agents must not call `write_note` directly.
---

# Note-taker

Single canonical path for persisting anything to the **Obsidian vault**. The vault is an Obsidian vault — that means **markdown only, Obsidian-friendly conventions**, so the graph view, backlinks, and dataview queries continue to work.

> If you are about to save anything that will live longer than the current message, it goes through here. No exceptions. The vault never receives HTML, JSON, or any other format.

## What "Obsidian-friendly" means concretely

The vault is read by Obsidian, which builds a knowledge graph from:

1. **YAML frontmatter** — title, date, tags (as a list), aliases. Required on every note.
2. **Inline `#tags`** — additional tags can be sprinkled in the body using `#category/subcategory` syntax. Indexed by Obsidian.
3. **`[[Wiki-links]]`** — references to other notes by *title* (not path). These are the edges in the graph. Use them liberally to connect new notes to existing ones.
4. **Markdown headings** (`#`, `##`, `###`) — Obsidian builds an outline per note. Use real headings, not bold-text-as-heading.
5. **Folder structure** — Obsidian respects folders. Use them as broad categories (`pm/`, `engineering/`, `learning/`, `trades/`, `inbox/`).

What breaks the graph:
- HTML files in the vault (they don't get indexed, links inside them aren't traced).
- Bare URLs to other notes (use `[[Title]]` not `[link](file.md)`).
- Tags only in the body without the `#` prefix.
- Frontmatter missing or malformed YAML (Obsidian silently ignores those notes in tag queries).

## Short captures vs long-form — both go here

`note-taker` is the **only** vault writer. It does not branch by length. A 30-word capture and a 2,000-word PRD are both markdown files in the vault; the difference is folder, frontmatter detail, and section structure.

| Type | Folder | Frontmatter weight | Body |
|---|---|---|---|
| Quick capture / idea / one-liner | `inbox/` | minimal (title, date, source_agent) | a paragraph or two |
| Journal entry (trade, daily) | `trades/<YYYY>/` or `journal/<YYYY-MM>/` | structured (setup, outcome, mood) | free-text per template |
| Meeting note | `meetings/` | attendees, date, project tag | sections + action items |
| PRD / spec | `pm/prd/` | status, owners, links to related ADRs | full structure (problem, goals, non-goals, design, rollout, FAQ) |
| ADR / design doc | `engineering/adr/` | status (proposed/accepted/superseded), supersedes/superseded-by | context, decision, consequences |
| Lesson plan / study guide | `learning/<subject>/` | objectives, level, time | outline + exercises |
| Exec brief / report | `pm/reports/` or `engineering/reports/` | audience, date, links | TL;DR + sections |
| Post-mortem | `engineering/incidents/` | severity, date, services | timeline, root cause, action items |

If `folder` is omitted, default to `inbox` and surface a follow-up: *"Saved to inbox — want me to move this under `pm/` or `engineering/`?"*

## When to call

- User says "save this", "note this down", "remember this", "write that up"
- A persona finishes a meaningful artifact (PRD draft, ADR, trade entry, lesson plan, post-mortem, retro)
- Periodic snapshots of long-running state (Trader's pattern hypotheses, Language's SRS queue)

## What to do AFTER saving

### Default — open in tmux side pane via `show-md`

Every persona that calls `note-taker` follows up with `show-md({ md_path })` so the user sees the saved file in a side pane via `leaf`. This is the default display behaviour (see `AGENTS.md` global rule #6). The Pi session always runs inside tmux (enforced by the `tmux-host` extension), so the split-pane is reliably available; on headless invocations the tool silently no-ops.

```
1. note-taker.save({...})                →  vault/pm/prd/2026-05-15-foo.md         (canonical)
2. show-md({md_path: "..."})             →  tmux side pane rendering the file       (default display)
```

**When `show-md` returns `opened: true`, the chat reply collapses to one line** — the file path plus at most one sentence of context (a follow-up question, an offer to also render/export, the next step). Don't restate the file's tables, bullet lists, key points, or "active recall" questions in chat — leaf is already showing them in the side pane. Save chat for what *isn't* in the file. On `opened: false` (headless, file missing, tmux error), fall back to a normal reply with a short summary so the user has something to read.

### Opt-in — also render to HTML

If the artifact would benefit from an interactive reading experience (rich diagrams, collapsibles, tabs, sliders, decks — the Thariq HTML playbook), the calling persona additionally calls the `render-html` skill. **Render reads the saved markdown and writes a derivative `.mdx` into the vault's `artifacts/renders/` folder** — separate from the hand-authored markdown tree so the Obsidian graph view stays focused, but still co-located so artifacts travel with their source. `show-md` and `render-html` are independent — when both are warranted, call both.

```
3. render-html({md_path: "..."})         →  http://localhost:8080/v/<slug>         (HTML render — opt-in)
```

The markdown is always the source of truth. The HTML render is a one-way derivative, regeneratable from the markdown. Personas decide whether to render — there is no global "always render" rule.

Cases where a render is worth it:
- PRDs, design docs, ADRs that the team will *read* (not just review the diff)
- Lesson plans / study guides that benefit from tabs, collapsibles, interactive examples
- Exec briefs, retros, reports with charts / timelines / status grids
- Anything the user explicitly asks to be "shown as a page", "rendered", "made visual"

Cases where markdown alone is sufficient:
- Inbox captures, journal entries, trade entries, meeting notes
- ADRs whose primary audience is git PR review (the diff IS the read)
- Anything short enough to read top-to-bottom in 30 seconds
- Anything agent-to-agent (sub-session output, prompt context)

## Inputs

```
note-taker.save({
  title: "<short noun phrase>",
  body: "<markdown content — real headings, real links, real lists>",
  folder: "inbox" | "pm/prd" | "pm/reports" | "engineering/adr" |
          "engineering/incidents" | "learning/<subject>" |
          "trades/<YYYY>" | "meetings" | <free path>,
  tags: ["#category", "#category/subcategory", ...],   // optional — frontmatter list
  links: ["<existing-note-title>", ...],               // optional — wiki-link targets
  aliases: ["<alias>", ...],                           // optional — Obsidian aliases
  source_agent: "<agent name>"                         // optional
})
```

If `folder` is omitted, default to `inbox`.

Files land at `<folder>/<YYYY-MM-DD>-<slug>.md`.

## Frontmatter convention (required on every note)

```yaml
---
title: <title>
created: <ISO timestamp>
source_agent: <agent>          # optional
tags: [<tag>, <tag>, ...]      # optional — list, not space-separated string
aliases: [<alias>, ...]        # optional — alternative names Obsidian will resolve
---
```

Notes on the format:
- `tags` is a **YAML list** (`[a, b, c]`), not a string. Obsidian parses both, but the list form is what survives round-trips through the Obsidian editor.
- Tags in frontmatter do NOT include the `#` prefix (that's the convention — `#` is only for inline tags in body text).
- `aliases` lets a single note appear under multiple `[[wiki-links]]` (e.g. an ADR titled "ADR-0007: Switch to Postgres" could have alias `Postgres ADR` so `[[Postgres ADR]]` resolves).
- ISO timestamp on `created` so chronological sort works across timezones.

## Body conventions

- **Headings:** `#` only for the title (already in frontmatter — most people skip a body H1). Body sections start at `##`. Don't use bold-as-heading.
- **Wiki-links:** when referencing another note, write `[[Note Title]]`, not a markdown link. If the target doesn't exist yet, Obsidian shows it as a placeholder — that's fine, it's how the graph grows.
- **Inline tags:** sprinkle `#category` or `#category/subcategory` in prose where the topic surfaces. They're indexed for tag-search.
- **Lists:** real markdown bullets / numbered lists. Don't fake them with bullet characters.
- **Code blocks:** triple-backtick with a language hint (` ```ts `, ` ```bash `, ` ```python `). Obsidian highlights.
- **Tables:** standard markdown pipe tables. Render fine in Obsidian preview.
- **Callouts:** Obsidian supports the `> [!note]`, `> [!warning]`, `> [!danger]` syntax — use them when content needs emphasis.
- **Math formulas:** when the content involves a formula, equation, identity, or quantitative relationship, write it as LaTeX between `$…$` (inline) or `$$…$$` (block, blank lines above and below). Obsidian renders these via MathJax in preview; the [[render-html]] pipeline renders them via KaTeX. Both source forms are identical — author once, render anywhere. Don't paraphrase math as prose, don't fake it with Unicode (`σ²`, `∫`, `√`), and don't paste it inside a code block. Escape literal dollar signs in surrounding prose as `\$` once a note contains math, otherwise the next `$` will be parsed as the close of an inline expression.

## Steps

1. **Validate inputs.** `title` required, `body` required. If `body` is empty or just whitespace, abort with a helpful error.
2. **Slug the title** (`lowercase-hyphenated`, 80 chars max).
3. **Pick the folder** — use the explicit input, or default to `inbox`. If the input doesn't exist yet, the vault extension creates it.
4. **Assemble frontmatter** from `title`, `created` (now, ISO), and any optional inputs (`source_agent`, `tags`, `aliases`). Tags go in as a YAML list, no `#` prefix.
5. **Body — pass through verbatim.** Do not summarize, do not paraphrase, do not "improve" the user's wording. If the body was given to you as a long-form draft, write it as-is.
6. **Append a wiki-link footer** ONLY if `links` was provided: `\n\n---\nRelated: [[Note A]] · [[Note B]]`. Don't synthesize wiki-links the caller didn't ask for.
7. **Call `write_note`** (the `obsidian-vault` extension tool) with the assembled markdown and the target path.
8. **Return** `{ path, title, vault_relative_path }` to the caller. The vault path is what `render-html` needs if a follow-up render is wanted.

## Output to the user

After saving, the reply is one line:

> Saved as **{title}** at `<folder>/<filename>.md`.

If the caller (persona) wants to also render to HTML, they call `render-html` next. They do not bundle the render URL into the same reply unless render has actually run.

## Don't

- **Don't write HTML to the vault.** Obsidian's graph doesn't index it; it breaks the conventions. HTML output is the `render-html` skill's job, and it writes outside the vault.
- **Don't dedupe automatically.** Two similar captures is the user's choice.
- **Don't summarize the body.** Write what you were given, verbatim. Length is fine.
- **Don't infer tags or folder.** If unclear, default to `inbox` and surface a follow-up question.
- **Don't paraphrase the title.** Use what the caller passed.
- **Don't call `write_note` from a persona directly.** Always go through this skill so frontmatter, slugging, folder conventions, and link footers stay consistent.
- **Don't write a body H1.** The title is in frontmatter. Body sections start at `##`.
- **Don't fake wiki-links.** Only emit `[[…]]` for explicit `links` input, or where the caller's body text already used wiki-syntax. Don't auto-generate them.
- **Don't combine save + render in one call.** They are separate skills — save first, render second (if needed). The markdown is canonical; the HTML render is optional.
