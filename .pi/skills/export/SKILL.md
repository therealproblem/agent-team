---
description: Layer 3 shared skill — exports markdown to a print-ready Kami-styled PDF (parchment canvas, ink-blue accent, serif throughout, single chromatic hue). Takes a vault markdown path or inline markdown, generates a Kami-styled HTML, and calls `write_export_pdf` to produce a PDF via headless Chrome. The PDF is served by the local Nextra server at `http://localhost:8080/p/<YYYY-MM-DD>-<slug>.pdf` (or the `AGENTS_TEAM_SERVER_PUBLIC_URL` hostname). Re-exporting the same title on the same day overwrites the file. Use for deliverables that will be sent, printed, or archived — resumes, letters, portfolios, equity reports, changelogs, one-pagers, long-form docs, slide decks. Picks one of eight templates — one-pager, long-doc, letter, portfolio, resume, slides, equity-report, changelog. Distinct from `present-interactive` (interactive page) and `note-taker` (markdown source). The PDF is a one-way deliverable; markdown is the source of truth.
---

# Export

`export` renders markdown → Kami-styled PDF. Use it when the artifact will be sent, printed, or archived as final. For *interactive* on-screen reading use `present-interactive`; for source-of-truth markdown use `note-taker`. PDFs land at `http://…/p/<YYYY-MM-DD>-<slug>.pdf` — slug is predictable from the title, so share each URL deliberately.

Reference files (load only when invoked):
- [`templates/base.html`](templates/base.html) — base HTML scaffold with embedded Kami CSS.
- [`templates/adjustments.md`](templates/adjustments.md) — per-template overrides (`@page`, structure).
- [`diagrams/snippets.md`](diagrams/snippets.md) — inline-SVG snippets (sparkline, bar, flow, timeline, radial, architecture, vertical flow, fan-out, gantt) plus anti-patterns.

## When to call

**Call `export` when:**
- "Export this as a PDF" / "make it a PDF" / "give me a printable version"
- "Write me a resume / cover letter / quarterly report"
- "Produce the deck as a PDF"
- The artifact will be sent outside the vault — emailed, printed, attached, submitted, archived as final.

**Don't call `export` for:**
- Anything the user reads in the terminal (PDFs aren't terminal-readable).
- On-screen exploration of a long document — use `present-interactive`.
- Quick captures, inbox notes, journal entries — markdown is right.
- Sub-session output, agent-to-agent hand-offs, prompt context — markdown is leaner.
- Anything needing JS interactivity (configurators, deck nav, copy buttons) — use `present-interactive`.
- Drafts the user is still editing — stabilize via `note-taker` first.

Call after the markdown is stable. Never edit vault markdown inline in this skill — fix the source via `note-taker` and re-export.

## Inputs

```
export({
  // Source — exactly ONE of these two is required.
  md_path:  "<vault-relative path>",       // preferred for archival docs
  markdown: "<inline markdown body>",      // one-shot deliverables not living in the vault

  template: "one-pager" | "long-doc" | "letter" | "portfolio" |
            "resume" | "slides" | "equity-report" | "changelog",
  title:    "<title>",                     // required — builds the URL slug
  meta:     { author, date, audience, recipient, ... },   // optional, surfaced in header/footer
  language: "en" | "cn" | "ja",            // default "en"; picks font stack
})
```

Returns `{ slug, pdf_path, pdf_url, title, template }` on success, or `{ pdf_path: null, html_path, error }` on Chrome failure (HTML retained for recovery in `.pi/server/.export-tmp/`).

The agent's user-facing reply:

> Exported: `<pdf_url>`
> Source: `vault/…/file.md` (markdown is the source of truth — edit it there and re-export)

Do not paste the rendered body inline. The PDF is the deliverable.

## Kami design rules — hard constraints

These define what a Kami PDF *is*. Violating any one produces a document that is not Kami.

1. **Canvas: parchment `#f5f4ed`.** Never pure white. Background everywhere — `body`, `@page`, every region.
2. **Accent: ink-blue `#1B365D`, single hue.** Only chromatic colour in the document. No second accent, no semantic green/red/orange, no callout palette.
3. **Neutrals: warm-toned.** Yellow-brown undertone. Use `#1c1917`, `#44403c`, `#78716c`, `#a8a29e`, `#d6d3d1`, `#e7e5e4`, `#ebe9e0`. Banned: cool blue-grays (Tailwind `slate`/`zinc`/`gray`).
4. **Serif throughout.** Body 400, headings 500. **No synthetic bold** (no `font-weight: 700`, no `bold`).
   - English: `"Charter", "Charter BT", Georgia, "Times New Roman", serif`
   - Chinese: `"TsangerJinKai02", "Noto Serif CJK SC", serif`
   - Japanese: `"YuMincho", "Hiragino Mincho ProN", "Yu Mincho", serif`
5. **Line-heights vary by region:** titles 1.1–1.3 · dense body 1.4–1.45 · reading body 1.5–1.55.
6. **Shadows: `ring` or `whisper` only.** Ring = `box-shadow: 0 0 0 1px var(--rule)`. Whisper = `box-shadow: 0 1px 0 var(--rule)`. No drop-shadows, glow, neumorphism.
7. **Tags: solid hex backgrounds only.** Never `rgba()` (WeasyPrint double-rectangle bug; portability discipline).
8. **No emoji.** Kami documents are formal.
9. **No `position: fixed` / `position: sticky`.** It's print; nothing scrolls.
10. **No JavaScript.** Print artifact; if you need interactivity, pick `present-interactive` instead.

## The eight templates

Match the user's request to one of these. Each has structural conventions; fill in content but don't invent new structure. For overrides see [`templates/adjustments.md`](templates/adjustments.md).

| Template | Shape | When |
|---|---|---|
| **one-pager** | Single A4 page. Headline + 1–2 sentence subtitle + three columns/sections. | Brief, proposal, "here's the idea" handout. |
| **long-doc** | Multi-page. Optional title page, TOC, sections with h2. Reading line-height 1.55. | Report, spec, research write-up, quarterly review. |
| **letter** | Sender block, date, recipient, salutation, body, closing, signature. Single column. | Cover letter, formal correspondence. |
| **portfolio** | Cover + 1 page per project (title, role/dates, narrative, callout/visual). | Case-study book, body-of-work sampler. |
| **resume** | Header + Experience · Projects · Education · Skills. Dense line-height 1.4. | CV — the canonical Kami use case. |
| **slides** | One `section.slide` per slide, landscape A4. h1 = slide title. | Deck delivered as PDF. |
| **equity-report** | Header (ticker · price · rating · target), exec summary callout, Thesis · Numbers · Risks · Catalysts. | Trader/analyst write-up. |
| **changelog** | Version header (h2 + date), Added · Changed · Fixed · Removed (h3, tight bullets). | Release note, library changelog. |

If the request doesn't fit one of these, **pick the closest and adapt** — don't invent a ninth.

## Diagrams first

Kami's severity (parchment, serif, single hue, no chrome) makes diagrams *more* important, not less. A Kami PDF without a single diagram is almost always under-cooked. Before generating HTML, scan markdown for the patterns below and produce **at least one** inline SVG.

### Content patterns → snippet

| If markdown contains… | Reach for snippet in [`diagrams/snippets.md`](diagrams/snippets.md) |
|---|---|
| Sequenced steps / process | Horizontal flow (or Vertical sequential flow for top-to-bottom pipelines) |
| Decisions / branching | Decision diamond + branch labels in serif |
| State transitions | Nodes-and-edges with state labels |
| Time progression, single thread | Vertical timeline |
| Schedule across parallel workstreams | Gantt |
| Architecture / module relationships | Architecture sketch (boxes + edges, subgraph boundaries) |
| One parent → N children | Fan-out (comb routing — trunk + bus, never starburst) |
| Org hierarchy / taxonomy / file-tree | Tree with ranked levels |
| Numbers over time | Sparkline |
| Distribution / proportion | Horizontal bar plot (preferred over pie in Kami) |
| Score / rating | Radial indicator, or 5-dot scale |
| Side-by-side metrics | Small multiples — N tiny SVGs in a row |
| Comparison of N independent options | **Not** a diagram — use `.grid-2`/`.grid-3` of bordered `.card`s |

Two diagrams per A4 page is tolerable (figure-and-counter-figure). Three is too much.

### When NOT to add a diagram

- Single-paragraph `letter` template with no claim that has a visual shape.
- Resume sections that are pure lists (Experience, Education) — diluting the dense-text rhythm. EXCEPT: a sparkline / radial in the Skills section showing proficiency is on-brand.
- Cover pages — a single Kami cover undecorated is more powerful.
- A page where the table IS the diagram (e.g. Numbers section of an equity report).

### Palette constraint

Every SVG uses only Kami CSS vars: `var(--paper)`, `var(--paper-soft)`, `var(--ink)`, `var(--ink-soft)`, `var(--ink-mute)`, `var(--rule)`, `var(--accent)`. No additional colors. No `rgba()` (solid hex / CSS var only).

### Per-template diagram fit

| Template | Where the diagram lives |
|---|---|
| one-pager | One mid-page SVG as visual anchor — sparkline next to a headline metric, or 3-node flow. |
| long-doc | One diagram per major section — flow per stage, sparkline per metric, timeline if chronological. |
| letter | None. |
| portfolio | Each project gets a hero diagram — architecture sketch, before/after, impact chart. |
| resume | Skills sparklines (proficiency over years), or single career timeline. Keep small. |
| slides | Each slide that's a *claim with a shape* should BE a diagram, not bullets. |
| equity-report | Sparklines next to every metric in Numbers; bar plot for setup frequency; timeline in Catalysts. |
| changelog | Usually unnecessary; sparkline per version showing scope can be tasteful. |

## Engine constraints

Renderer is headless Chrome. CSS print features work (`@page`, `page-break-*`, `@media print`). `@font-face` works — prefer `local()` first with `@font-face` as fallback. Inline SVG works. **No Mermaid** — renders late, can corrupt PDF snapshot, doesn't match Kami. **No external network at render time** beyond a single woff2 font URL if local fonts unavailable. The tool also supports swapping in WeasyPrint by changing one helper — the HTML is engine-agnostic by design.

## Optional brand config

If `~/.config/kami/brand.md` exists (YAML frontmatter + markdown body), apply its identity/brand/defaults **only when the request is ambiguous**. Per-document `meta` overrides brand config. Example fields: `author`, `tagline`, `default_template`, `accent_override`. The skill does not write to this file.

## Steps

1. **Resolve the source.** If `md_path` is provided, use the core `read` tool to load it. Otherwise use inline `markdown`. If both or neither are provided, error.
2. **Parse frontmatter.** Extract title, date, tags, author, source_agent.
3. **Decide the template.** Use caller's `template` if provided; else infer from frontmatter `type` or folder (`pm/reports/` → equity-report or long-doc; `learning/cover-letter/` → letter; `engineering/changelog/` → changelog; `<vault>/resume/` → resume).
4. **Decide the language.** Default `en`. Switch font stack accordingly.
5. **Scan for diagrammable shapes.** Run markdown through the content-patterns table above. Identify at least one inline SVG (two if content supports it and template tolerates). Compose using snippets in [`diagrams/snippets.md`](diagrams/snippets.md). For `letter` and pure-list `resume` sections, skipping is fine.
6. **Assemble the HTML.** Base scaffold = [`templates/base.html`](templates/base.html). Apply template overrides from [`templates/adjustments.md`](templates/adjustments.md). Fill `{{TITLE}}`, `{{HEAD_FONTS}}`, `{{HEADER}}`, `{{BODY}}`, `{{META_FOOTER}}`. Place diagrams **near the section they illustrate** — not at the end as decoration. Embed all CSS inline. No remote scripts. No Mermaid.
7. **Call `write_export_pdf`** with the assembled HTML, the title, the template name, and (if applicable) `source_md_path`.
8. **Return** `{ slug, pdf_path, pdf_url, title, template }` to the caller. (Intermediate HTML was deleted by the tool after Chrome rendered the PDF.)
9. **The agent's user-facing reply:**
   > Exported: `<pdf_url>`
   > Source: `vault/…/file.md` (markdown is the source of truth — edit it there and re-export)

   Do not paste the rendered body inline.

## Footer

Append a `<footer class="doc-footer">` with source markdown path, generating agent, export timestamp (ISO date), template name. Example:

```html
<footer class="doc-footer">
  Exported from <code>vault/pm/reports/2026-05-15-q1-review.md</code> · 2026-05-15 ·
  template <strong>long-doc</strong> · generated by <strong>pm</strong>
</footer>
```

For `letter`, omit the footer entirely.

## Don't

- **Don't write PDF to the vault.** Always use `write_export_pdf` — vault stays markdown-only.
- **Don't proactively list URLs.** Each PDF URL is shared deliberately. Never volunteer "here are your recent exports".
- **Don't synthesize content.** If you find yourself inventing sections that weren't in the source, stop — edit the markdown via `note-taker` first, then re-export.
- **Don't auto-export.** The user explicitly triggers this skill.
- **Don't use Mermaid.** Use inline SVG for every diagram.
- **Don't fetch from external CDNs at render time** beyond a single woff2 font URL.
- **Don't paste the rendered body inline** in the chat reply. The PDF path is the deliverable.
- **Don't pick a ninth template.** Pick the closest and adapt.
- **Don't run `export` on a draft.** Stabilize the markdown first.
- **Don't ship a PDF with zero diagrams** unless template is `letter`, resume sections are pure lists, or an honest scan against the content-patterns table found nothing.

(See the Kami design rules section above for the canonical list of stylistic prohibitions — no second hue, no cool grays, no synthetic bold, no emoji, no `position: fixed`, no `rgba()` for backgrounds, no JS.)
