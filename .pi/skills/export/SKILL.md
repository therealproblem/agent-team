---
description: Layer 3 shared skill — DISPATCHES Kami-styled PDF export to an isolated `render-pdf` subagent so the parent session's context window stays clean. The subagent reads the source markdown (or accepts inline markdown), picks one of eight templates, assembles Kami-styled HTML (parchment canvas, ink-blue accent, serif), calls `write_export_pdf` (headless Chrome), and returns the PDF URL. The parent's job is just to decide *whether* to delegate (call/skip rules below), compose the task string with template/title/language/meta, and surface the returned URL to the user. Distinct from `render-html` (interactive page) and `note-taker` (markdown source).
---

# Export (dispatcher)

`export` is a thin dispatcher. The actual export — picking a template, assembling Kami-styled HTML with inline CSS and SVG diagrams, calling headless Chrome, verifying the PDF — happens **inside the `render-pdf` subagent**, with its own context window. The parent session never sees the HTML scaffold or the template overrides; it sees only the verified PDF URL.

This isolation is the point: a resume render that would burn thousands of tokens of HTML + per-template CSS in the parent now costs a single subagent call + the returned URL.

> If a user asks you to "make a PDF", "export this", "produce a resume", "send a letter", "deliver a report" — and the output should look polished and printed — this is the skill. If they want an *interactive* document to read on screen, that's `render-html`, not `export`.

## Three different read paths

| Read path | Owner | Format | Location |
|---|---|---|---|
| **Knowledge graph / archival** | `note-taker` | Markdown | Obsidian vault (`vault/…/<slug>.md`) |
| **On-screen exploration** | `render-html` (dispatches to subagent) | Nextra page (parchment editorial styling) | `http://localhost:8080/v/<YYYY-MM-DD>-<slug>` |
| **Print / deliverable** | `export` (this skill — dispatches to subagent) | PDF (Kami aesthetic) | `http://localhost:8080/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf` |

PDFs are one-way derivatives — edit the markdown, re-export, and a NEW file lands at a NEW URL (epoch-suffixed slug defeats CDN caching). After the new PDF is on disk, prior PDFs for the same title across ALL dates are deleted automatically; only the latest version per title stays in `<repo>/exports/`.

## When to call

**Call `export` when the user explicitly wants a deliverable:**

- "Export this as a PDF" / "make it a PDF" / "give me a printable version"
- "Write me a resume / cover letter / quarterly report"
- "Produce the deck as a PDF"
- The artifact will be **sent to someone outside the vault** — emailed, printed, attached, submitted, archived as final.

**Don't call `export` for:**

- Anything the user will read in the terminal — PDFs aren't terminal-readable.
- On-screen exploration of a long document — use `render-html` (interactive vs static).
- Quick captures, inbox notes, journal entries — markdown is the right artifact.
- Sub-session output, agent-to-agent hand-offs, prompt context — markdown is leaner.
- Anything that needs live JS interactivity — that's `render-html`, not `export`.
- A draft the user is still editing — let them stabilize via `note-taker` first.

**Call `export` after** the markdown is stable. If from the vault, do not edit inline — fix the source via `note-taker` and re-export.

## How to dispatch

Call the `subagent` tool with `agent: "render-pdf"`. The task is natural language; include:

- **Source** — exactly one of:
  - `md_path: <vault-relative path>` (preferred — archival).
  - `markdown: <inline body>` (one-shot deliverables that shouldn't live in the vault, e.g. a private cover letter).
- **Template** — one of `one-pager`, `long-doc`, `letter`, `portfolio`, `resume`, `slides`, `equity-report`, `changelog`. Omit only if the source frontmatter / folder makes the template obvious.
- **Title** — required, used for the document and URL slug.
- **Language** — optional, default `en`. (`en` / `cn` / `ja` switches the font stack.)
- **Meta** — optional. `{ author, date, audience, recipient, ... }`.

```
subagent({
  agent: "render-pdf",
  task: "Export the vault note at pm/reports/2026-Q1-equity.md as a PDF. Template: equity-report. Title: Q1 2026 Equity Review. Meta: { author: 'Joseph', audience: 'investors' }."
})

subagent({
  agent: "render-pdf",
  task: "Export the inline markdown below as a PDF. Template: letter. Title: Cover Letter — Foo Co. Language: en. Meta: { recipient: 'Foo Hiring Team', date: '2026-05-15' }.\n\n---\n\n<inline markdown body>"
})
```

The subagent loads its own system prompt — you don't need to repeat Kami design rules, template adjustments, or `@page` overrides. Keep the task focused on inputs.

`agentScope` defaults to `"user"` in the `subagent` tool; the `render-pdf` agent lives in `.pi/agents/`, so pass `agentScope: "both"` (or `"project"`) when you call.

## What you get back

The subagent's final output is the user-facing reply. Surface it verbatim.

**Source from vault:**

```
Exported: <pdf_url>
Source: vault/.../file.md
```

**Inline markdown:**

```
Exported: <pdf_url>
```

## URL access model

Each PDF lives at `http://…/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf`. The URL is the access control — no auth, no login. Every regeneration is a new URL, so do NOT promise the recipient a "stable link" — if they need the latest version, send the latest URL.

The local server hides discovery vectors (`/`, `/p`, sitemap, search, 404 page). Slugs are predictable from the title, so don't treat URLs as secret — share each one deliberately.

## Errors from the subagent

If the subagent returns an error message instead of a URL:

- **"Chrome binary not found"** — the system Chrome path isn't set. Tell the user; do not retry until they confirm `AGENTS_TEAM_CHROME_PATH` is set or Chrome is installed at the default location.
- **"Render error: …"** — Chrome rendered but the PDF didn't land cleanly. The subagent retained the intermediate HTML at `<html_path>` for manual recovery. Surface that path to the user.
- **"Missing required field: …"** — the task didn't include something required (md_path/markdown, title, template). Fix the task and re-dispatch.

In every error case, the parent's role is to surface the message — not to silently retry.

## Don't

- **Don't assemble the HTML yourself.** That's the subagent's job. If you find yourself drafting `<style>` blocks, `@page` rules, or inline SVG in the parent session, stop and dispatch.
- **Don't paste the rendered body inline** in the chat reply. The PDF URL is the deliverable.
- **Don't proactively list URLs.** Each export is shared deliberately.
- **Don't include cloudflared / tunnel suggestions** in your reply. The URL stands alone.
- **Don't auto-export.** The user explicitly triggers this skill.
- **Don't call `write_export_pdf` directly** from the parent. That tool is the subagent's; using it in the parent defeats token isolation.
- **Don't pre-decide diagrams, templates, or per-template overrides** in the parent. Pass intent through the task string; the subagent decides.
