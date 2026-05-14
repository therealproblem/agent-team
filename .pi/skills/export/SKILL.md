---
description: Layer 3 shared skill — exports markdown to a print-ready PDF styled by the Kami design system (parchment canvas, ink-blue accent, serif typography, warm neutrals, no second chromatic hue). Takes either a vault-relative markdown path or inline markdown content, generates a complete Kami-styled HTML document, and calls the `write_export_pdf` tool to produce a PDF (via headless Chrome) into `exports/` OUTSIDE the vault. Use for deliverables that will be sent, printed, or archived — resumes, letters, portfolios, equity reports, changelogs, one-pagers, long-form documents, and slide decks. Picks one of eight templates (one-pager · long-doc · letter · portfolio · resume · slides · equity-report · changelog) based on the request. Distinct from `render` (on-screen interactive HTML, shadcn aesthetic, full chromatic palette) and `note-taker` (markdown source in the Obsidian vault). The PDF is a one-way deliverable; the markdown is always the source of truth.
---

# Export

`export` is the **markdown → Kami-styled PDF** skill. It produces print-ready deliverables — the kind of artifact you attach to an email, hand to a printer, or archive as the canonical formal version of a document.

> If a user asks you to "make a PDF", "export this", "produce a resume", "send a letter", "deliver a report" — and the output should look polished and printed — this is the skill. If they want an *interactive* document to read on screen, that's `render`, not `export`.

## Why this skill exists

Three different read paths, three different skills:

| Read path | Owner | Format | Location |
|---|---|---|---|
| **Knowledge graph / archival** | `note-taker` | Markdown | Obsidian vault (`vault/…/<slug>.md`) |
| **On-screen exploration** | `render` | Interactive HTML (shadcn aesthetic) | `renders/<slug>.html` |
| **Print / deliverable** | `export` (this skill) | PDF (Kami aesthetic) | `exports/<slug>.pdf` |

The PDF is a **one-way derivative** — regeneratable from the markdown at any time. Edit the markdown, re-export. The intermediate HTML is deleted once Chrome confirms the PDF was written; only the `.pdf` remains in `exports/`. (If Chrome fails to render, the HTML is retained as a fallback so you can inspect what was generated and re-run the renderer manually.)

## When to call

**Call `export` when the user explicitly wants a deliverable:**

- "Export this as a PDF" / "make it a PDF" / "give me a printable version"
- "Write me a resume / cover letter / quarterly report"
- "Produce the deck as a PDF"
- The artifact will be **sent to someone outside the vault** — emailed, printed, attached, submitted, archived as final.

**Don't call `export` for:**

- Anything the user will read in the terminal — PDFs aren't terminal-readable.
- On-screen exploration of a long document — use `render` (the PDF is static; the HTML is interactive).
- Quick captures, inbox notes, journal entries — markdown is the right artifact.
- Sub-session output, agent-to-agent hand-offs, prompt context — markdown is leaner.
- Anything that needs live JS interactivity (configurators, decks with arrow-key nav, copy buttons) — that's `render`, not `export`.
- A draft that the user is still editing — let them stabilize the markdown via `note-taker` first.

**Call `export` after** the markdown is stable. If the markdown is from the vault, do not edit it inline in this skill — fix the source via `note-taker` and re-export.

## Inputs

```
export({
  // Source — exactly ONE of these two is required.
  md_path:        "<vault-relative path of the source note>",      // preferred for archival docs
  markdown:       "<inline markdown body>",                         // for one-shot deliverables that
                                                                    //   should not live in the vault
                                                                    //   (e.g. a private cover letter)

  template:       "one-pager" | "long-doc" | "letter" |             // required — pick the closest fit
                  "portfolio" | "resume" | "slides" |
                  "equity-report" | "changelog",

  title:          "<title>",                                        // required — used for slug + filename
                                                                    //   + page title + first heading
  subfolder:      "<sub-path under exports/>",                      // optional — e.g. "resume",
                                                                    //   "letters/2026", "reports/q2"

  meta:           { author, date, audience, recipient, ... },       // optional — surfaced in the
                                                                    //   header/footer per template

  language:       "en" | "cn" | "ja",                               // optional — default "en". Picks
                                                                    //   the font stack and the EN/CN/JA
                                                                    //   variant of the template.
})
```

## What `export` produces

A `.pdf` file under `exports/<subfolder>/<YYYY-MM-DD>-<slug>.pdf`. Nothing else — the intermediate HTML is written transiently, fed to Chrome, then deleted once Chrome confirms the PDF was produced. The only case where an HTML file survives is when Chrome itself failed (no binary found, render error), in which case the tool returns `isError: true` plus the path of the HTML it could not convert.

Returned to the caller (success case):

```
{
  pdf_path:  "<absolute path to PDF>",
  pdf_url:   "file:///<absolute path to PDF>",
  title:     "<title>",
  template:  "<which template was used>"
}
```

Returned to the caller (Chrome failure — rare):

```
{
  pdf_path:  null,
  html_path: "<absolute path to surviving HTML>",   // for manual recovery
  error:     "<failure reason>"
}
```

The agent's user-facing reply is then:

> Exported: `file:///…/file.pdf`
> Source: `vault/…/file.md` (markdown is the source of truth — edit it there and re-export)

Do not paste the rendered body inline. The PDF is the deliverable.

## Kami design rules — hard constraints

These are not stylistic suggestions. They define what a Kami PDF looks like. Violating any one of them produces a document that is *not* a Kami document.

1. **Canvas: parchment `#f5f4ed`.** Never pure white. The page background is parchment everywhere — `body`, `@page`, every region.
2. **Accent: ink-blue `#1B365D`, single hue.** This is the *only* chromatic color in the document. Link underlines, accent rules, decorative dividers — all use this hue. No second chromatic accent (no secondary brand color, no semantic green/red/orange, no callout palette). Discipline through restraint.
3. **Neutrals: warm-toned.** All grays carry a yellow-brown undertone. Use `#1c1917`, `#44403c`, `#78716c`, `#a8a29e`, `#d6d3d1`, `#e7e5e4`, `#ebe9e0`. Banned: cool blue-grays (`#0f172a`, `#475569`, `#64748b`, `#94a3b8` — the Tailwind `slate`/`zinc`/`gray` cool palette). The warm undertone is essential to Kami's character.
4. **Serif throughout.** Body 400, headings 500. **No synthetic bold** (no `font-weight: 700` or `bold`). Use weight 500 with serif headings for emphasis.
   - English: `"Charter", "Charter BT", Georgia, "Times New Roman", serif`
   - Chinese: `"TsangerJinKai02", "Noto Serif CJK SC", serif`
   - Japanese: `"YuMincho", "Hiragino Mincho ProN", "Yu Mincho", serif`
5. **Line-heights vary by region:**
   - Titles (h1–h2): **1.1 – 1.3**
   - Dense body (resume bullets, tables, sidebars): **1.4 – 1.45**
   - Reading body (paragraphs, letter prose, report sections): **1.5 – 1.55**
6. **Shadows: `ring` or `whisper` only.** No drop-shadows, no glow, no neumorphism. The two allowed shadow patterns are:
   - **Ring** (`box-shadow: 0 0 0 1px var(--rule)`) — used to outline a card.
   - **Whisper** (`box-shadow: 0 1px 0 var(--rule)`) — a one-pixel bottom rule, used as a soft section break.
7. **Tags: solid hex backgrounds ONLY.** Never `rgba()` for tag backgrounds (a WeasyPrint bug produces a double-rectangle if you do; Chrome doesn't have the bug but the discipline is kept for cross-engine portability). Use `#ebe9e0` for neutral tags, the accent hex for emphasized tags.
8. **No emoji.** No emoji glyphs in headings, body, or decorative places. Kami documents are formal artifacts.
9. **No `position: fixed` / `position: sticky`.** It's a print document; nothing scrolls. Pagination is handled by `@page` rules.
10. **No JavaScript.** Headless Chrome runs it once, but the artifact is print. If you need interactivity, you picked the wrong skill — use `render`.

## The eight templates

Match the user's request to one of these. Each has structural conventions; the agent fills in the content but does not invent new structure.

| Template | Structural shape | When to pick |
|---|---|---|
| **one-pager** | Single page (`@page { size: A4 }`). Headline, 1–2 sentence subtitle, three columns or three sections of dense body. No page break. | A brief, a proposal, a "here's the idea" handout. |
| **long-doc** | Multi-page. Title page (optional), table of contents (h2 list, page-numbered), then sections with h2 headings forcing `page-break-before` only for major parts. Reading-body line-height (1.5–1.55). | A report, a spec, a research write-up, a quarterly review. |
| **letter** | Sender block (top-right or top-left), date, recipient block, salutation, body paragraphs (reading line-height), closing, signature line. Single column. Generous top/bottom margins (28mm). | Cover letter, formal correspondence, an introduction. |
| **portfolio** | Cover page (name + one-line positioning), then 1 page per project/work item with: title, role/dates, 2–3 sentence narrative, key visual or callout block. | A case-study book, a body-of-work sampler, a designer's intro pack. |
| **resume** | Header (name as h1, contact metadata as a thin row), then sections: Experience · Projects · Education · Skills. Dense line-height (1.4). Single column on A4, or two columns (sidebar 30% / main 70%) for longer histories. | A CV — the canonical Kami use case. |
| **slides** | One `section.slide` per slide, each `min-height: 100vh` with `page-break-after: always`. h1 as slide title, h2/h3 as sub-points. No fancy transitions; just clean type. 4:3 or 16:9 — declare via `@page { size: 297mm 210mm landscape }`. | A presented deck delivered as PDF (no projector live). |
| **equity-report** | Header block (ticker · price · rating · target), executive summary callout (parchment-soft background, accent rule), then sections: Thesis · Numbers · Risks · Catalysts. Tables-heavy. Pull-quotes in the margin if space allows. | A trader/analyst write-up. Pairs with the `journal` and `pattern-watch` inner skills. |
| **changelog** | Version header per release (h2, with date metadata), then sections (Added · Changed · Fixed · Removed) as h3 with tight bullet lists. Dense line-height. | A product release note, a library changelog, a "what changed this quarter" doc. |

If the user's request doesn't fit one of these eight, **pick the closest and adapt** — don't invent a ninth.

## Engine constraints

The renderer is headless Chrome. That means:

- **CSS print features work**: `@page { size, margin }`, `page-break-before/after/inside`, `@media print`.
- **JavaScript is allowed but discouraged** — Chrome does run it once before the PDF snapshot, but Kami documents are static by design. Don't ship JS.
- **`@font-face` works.** Prefer local fonts (`src: local("Charter")`) with `@font-face` as a fallback. Web fonts via `https://` work but slow the render and require network on each export. Stick to local + system fallbacks.
- **Inline SVG works.** Use it for any diagram (org charts, flow, simple icons). No Mermaid — Kami's aesthetic doesn't match Mermaid's default styles, and Mermaid renders late which can corrupt the PDF snapshot.
- **No `rgba()` for tag/badge backgrounds** — solid hex only. (Upstream WeasyPrint bug; we keep the discipline for portability.)
- **No external network during render** beyond what's strictly needed. The PDF should reproduce identically offline.

The tool also supports swapping in WeasyPrint by changing one helper (`AGENTS_TEAM_CHROME_PATH` and the spawn call). The HTML we generate is engine-agnostic by design.

## Inline SVG diagrams

When the document needs a diagram (an org chart, a flow, a sparkline, a simple plot), use **inline SVG**. Examples of patterns that work well in Kami:

- **Sparkline** (one-line metric trend): `<svg viewBox="0 0 100 24"><polyline fill="none" stroke="#1B365D" stroke-width="1.5" points="…"/></svg>`
- **Bar plot** (small data): rectangles in accent hex on parchment-soft background.
- **Simple flow**: rounded rects + arrows, all in `var(--rule)` strokes with accent fills on highlighted nodes.
- **Score badges**: SVG `<circle>` + centered text for radial-style indicators.

Constraint: every SVG uses the Kami palette (`var(--paper)`, `var(--paper-soft)`, `var(--ink)`, `var(--ink-soft)`, `var(--rule)`, `var(--accent)`). No additional colors.

## Optional brand config

If `~/.config/kami/brand.md` exists (YAML frontmatter + markdown body), apply its identity/brand/defaults **only when the request is ambiguous**. Per-document `meta` overrides brand config. Example brand fields: `author`, `tagline`, `default_template`, `accent_override`. The skill does not write to this file; the user maintains it.

## Steps

1. **Resolve the source.** If `md_path` is provided, use the core `read` tool to load it from the vault. Otherwise, use the inline `markdown` passed in. If both or neither are provided, error.
2. **Parse frontmatter.** Extract title, date, tags, author, source_agent — anything that informs the header/footer.
3. **Decide the template.** Use the caller's `template` if provided; otherwise infer from frontmatter `type` or folder (`pm/reports/` → equity-report or long-doc; `learning/cover-letter/` → letter; `engineering/changelog/` → changelog; `<vault>/resume/` → resume).
4. **Decide the language.** Default `en`. Switch font stack accordingly.
5. **Assemble the HTML** using the template scaffold below as the base, filling in `{{TITLE}}`, `{{HEAD_FONTS}}`, `{{HEADER}}`, `{{BODY}}`, `{{META_FOOTER}}`. Embed all CSS inline. No remote scripts.
6. **Call `write_export_pdf`** with the assembled HTML, the title, the template name, and (if applicable) `source_md_path` + `subfolder`.
7. **Return** `{ pdf_path, pdf_url, title, template }` to the caller. (The intermediate HTML was deleted by the tool after Chrome rendered the PDF.)
8. **The agent's user-facing reply** is then:
   > Exported: `file:///…/file.pdf`
   > Source: `vault/…/file.md` (markdown is the source of truth — edit it there and re-export)

   Do not paste the rendered body inline.

## Self-contained HTML template

This is the **base scaffold**. Fill in `{{TITLE}}`, `{{HEAD_FONTS}}`, `{{HEADER}}`, `{{BODY}}`, `{{META_FOOTER}}`. Adjust `@page` and `body` rules per template (long-doc keeps reading line-height 1.55; resume tightens to 1.4; slides uses landscape A4 and per-slide page breaks). Do not add CDN scripts; PDFs are static.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>{{TITLE}}</title>

<!-- {{HEAD_FONTS}} — embed font-face only if the local family is missing.
     Prefer local() first so the file renders fast and offline.
     Example for English (Charter):
       <style>
         @font-face {
           font-family: "Charter";
           src: local("Charter"), local("Charter BT"),
                url("https://cdn.jsdelivr.net/gh/tw93/kami/fonts/charter-regular.woff2") format("woff2");
           font-weight: 400; font-display: swap;
         }
         @font-face {
           font-family: "Charter";
           src: local("Charter Bold"), local("Charter BT Bold");
           font-weight: 500;
         }
       </style>
     Chinese: TsangerJinKai02 (free for personal use). Japanese: YuMincho (local on macOS). -->

<style>
  @page {
    size: A4;
    margin: 22mm 20mm 22mm 20mm;
    background: #f5f4ed;
  }

  :root {
    --paper:       #f5f4ed;   /* canvas — never pure white */
    --paper-soft:  #ebe9e0;   /* tag background, callout fill */
    --ink:         #1c1917;   /* warm near-black — body */
    --ink-soft:    #44403c;   /* warm neutral 700 */
    --ink-mute:    #78716c;   /* warm neutral 500 — meta, captions */
    --rule:        #d6d3d1;   /* warm neutral 300 — borders, rules */
    --accent:      #1B365D;   /* ink blue — the ONLY chromatic hue */
    --serif:       "Charter", "TsangerJinKai02", "YuMincho",
                   "Hiragino Mincho ProN", "Noto Serif CJK SC",
                   Georgia, "Times New Roman", serif;
    --mono:        "SF Mono", ui-monospace, Menlo, Consolas, monospace;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: var(--serif);
    font-weight: 400;
    font-size: 11pt;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* Headings — weight 500, serif. No synthetic bold. Titles 1.1–1.3 line-height. */
  h1, h2, h3, h4 {
    font-family: var(--serif);
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.005em;
    page-break-after: avoid;
  }
  h1 { font-size: 26pt; line-height: 1.15; margin: 0 0 0.4em; letter-spacing: -0.015em; }
  h2 { font-size: 15pt; line-height: 1.2;  margin: 1.6em 0 0.5em; padding-bottom: 0.25em;
       border-bottom: 1px solid var(--rule); }
  h3 { font-size: 12pt; line-height: 1.25; margin: 1.2em 0 0.35em; color: var(--ink-soft); }
  h4 { font-size: 11pt; line-height: 1.3;  margin: 1em 0 0.3em; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em; }

  /* Body — reading line-height 1.55. Override to 1.4 on .dense regions (resume, sidebars). */
  p, ul, ol, blockquote, table { margin: 0.6em 0; }
  p, blockquote { line-height: 1.55; }
  ul, ol { padding-left: 1.2em; line-height: 1.5; }
  li + li { margin-top: 0.2em; }
  .dense, .dense p, .dense li { line-height: 1.4; }

  a {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px solid var(--accent);
  }

  blockquote {
    border-left: 2px solid var(--accent);
    padding: 0.1em 0 0.1em 14px;
    color: var(--ink-soft);
    font-style: italic;
  }

  hr {
    border: none;
    border-top: 1px solid var(--rule);
    margin: 1.6em 0;
  }

  /* Meta strip — caption-style metadata under titles or in footers. */
  .meta {
    color: var(--ink-mute);
    font-size: 9pt;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 1.4em;
  }

  /* Tags — solid hex only, never rgba. */
  .tag {
    display: inline-block;
    background: var(--paper-soft);
    color: var(--ink-soft);
    padding: 1px 8px;
    font-size: 9pt;
    border-radius: 999px;
    letter-spacing: 0.02em;
    margin-right: 4px;
  }
  .tag--accent {
    background: var(--accent);
    color: var(--paper);
  }

  /* Tables — clean rules, no grid lines on every cell. */
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 10.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border-bottom: 1px solid var(--rule);
    padding: 7px 10px;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-weight: 500;
    color: var(--ink-soft);
    border-bottom: 1.5px solid var(--ink-soft);
    font-size: 9.5pt;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* Callouts — parchment-soft fill, accent left rule. ONE tone only. */
  .callout {
    background: var(--paper-soft);
    border-left: 2px solid var(--accent);
    padding: 12px 14px;
    margin: 1em 0;
    font-size: 10.5pt;
    page-break-inside: avoid;
  }
  .callout-title {
    font-weight: 500;
    margin-bottom: 4px;
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent);
  }

  /* Shadows — ring or whisper only. */
  .ring    { box-shadow: 0 0 0 1px var(--rule); }
  .whisper { box-shadow: 0 1px 0 var(--rule); }

  /* Code — monospace at 0.9em, parchment-soft fill. */
  code {
    font-family: var(--mono);
    font-size: 0.9em;
    background: var(--paper-soft);
    padding: 1px 5px;
    border-radius: 3px;
  }
  pre {
    background: var(--paper-soft);
    padding: 12px 14px;
    border-radius: 4px;
    overflow: auto;
    font-size: 9.5pt;
    line-height: 1.4;
    page-break-inside: avoid;
  }
  pre code { background: transparent; padding: 0; }

  /* Layout helpers — opt-in per template. */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr;       gap: 18px; margin: 1em 0; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr;   gap: 18px; margin: 1em 0; }
  .grid-resume { display: grid; grid-template-columns: 30% 70%;  gap: 24px; }

  /* Page-break helpers — for long-doc / portfolio / slides. */
  .page-break { page-break-before: always; }
  .slide      { page-break-after: always; min-height: 100vh; padding: 8vh 8vw; }

  /* Header band — used by letter / report / portfolio cover. */
  .doc-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 2.4em;
    padding-bottom: 1em;
    border-bottom: 1px solid var(--rule);
  }
  .doc-title  { font-size: 22pt; font-weight: 500; line-height: 1.15; letter-spacing: -0.01em; }
  .doc-sub    { color: var(--ink-soft); font-size: 11pt; }
  .doc-meta   { color: var(--ink-mute); font-size: 9.5pt; text-align: right; line-height: 1.4; }

  /* Footer — small, ink-mute, single line per item. */
  .doc-footer {
    margin-top: 3em;
    padding-top: 1em;
    border-top: 1px solid var(--rule);
    color: var(--ink-mute);
    font-size: 9pt;
    line-height: 1.5;
  }
</style>
</head>
<body>
  {{HEADER}}
  {{BODY}}
  {{META_FOOTER}}
</body>
</html>
```

## Per-template adjustments

Apply these on top of the base scaffold.

### one-pager
- `@page { size: A4; margin: 18mm 18mm 18mm 18mm; }`
- Headline + subtitle, then either `.grid-3` or three `<section>` blocks.
- No page break — content must fit on one A4 page.

### long-doc
- `@page { size: A4; margin: 22mm 20mm 22mm 20mm; }`
- Optional title page (`<section class="page-break">` with just `h1` + `.meta`).
- Optional TOC: `<nav class="toc"><ol>…</ol></nav>` directly after the title page. No sidebar TOC (this is print).
- Sections with `h2` — let pagination flow naturally; only force `page-break-before` for major parts.

### letter
- `@page { size: A4; margin: 28mm 24mm 28mm 24mm; }`
- Sender block (right-aligned): name, address, email, date.
- Recipient block (left-aligned), 1 line break below sender.
- Salutation, body paragraphs (reading line-height 1.55), closing ("Sincerely,"), signature line, typed name.
- No header band; the letter starts directly with sender/recipient.

### portfolio
- `@page { size: A4; margin: 22mm 20mm 22mm 20mm; }`
- Cover page: `<section class="page-break">` with `h1` (name) + `.doc-sub` (positioning line) + accent rule.
- One `<section class="page-break">` per project. Inside: project title (h2), `.meta` row (role · dates · stack), 2–3 paragraphs of narrative, optional `.callout` for a pull-quote, optional inline SVG visual.

### resume
- `@page { size: A4; margin: 16mm 18mm 18mm 18mm; }`
- Tight, single-column or two-column (`.grid-resume`: sidebar 30% / main 70%).
- Header: `<h1>` name, `.meta` strip with contact details (email · phone · location · links).
- Sections (h2): Experience · Projects · Education · Skills. Dense line-height (`<main class="dense">`).
- Each experience entry: `<h3>` role · company, `.meta` dates/location, 2–4 bullet outcomes.

### slides
- `@page { size: 297mm 210mm landscape; margin: 0; }`
- One `<section class="slide">` per slide.
- h1 as title slide; h2 as section slides. Body text is short — slides are landing-pad markers, not paragraphs.
- Add page number in bottom-right via `<footer>` inside each `.slide` (no `position: fixed`).

### equity-report
- `@page { size: A4; margin: 20mm 20mm 22mm 20mm; }`
- Header band: ticker · price · rating · target (use `.doc-header` with `.doc-meta` right-aligned).
- Executive summary `<div class="callout">` directly under the header.
- Sections: Thesis · Numbers · Risks · Catalysts. Heavy use of `<table>` for the Numbers section.
- Optional inline SVG sparkline next to key metrics.

### changelog
- `@page { size: A4; margin: 18mm 20mm 18mm 20mm; }`
- `h2` per version with `.meta` strip (date · type [major/minor/patch] · tags).
- `h3` per category: Added · Changed · Fixed · Removed.
- Dense bullet lists, no paragraphs.

## Footer

Append a `<footer class="doc-footer">` with:

- Source markdown path (so the user knows where to edit).
- Generating agent (`source_agent` from frontmatter, or the persona that triggered the export).
- Export timestamp (ISO date).
- Template name.

Example:

```html
<footer class="doc-footer">
  Exported from <code>vault/pm/reports/2026-05-15-q1-review.md</code> · 2026-05-15 ·
  template <strong>long-doc</strong> · generated by <strong>pm</strong>
</footer>
```

For `letter`, omit the footer entirely (a letter doesn't carry meta about its production).

## Don't

- **Don't write PDF to the vault.** Always use `write_export_pdf`, which targets `exports/` outside the vault. Vault stays markdown-only.
- **Don't synthesize content.** Export reads the markdown source (or the inline markdown passed in). If you find yourself inventing sections that weren't in the source, stop — edit the markdown via `note-taker` first, then re-export.
- **Don't auto-export.** The user explicitly triggers this skill. No "save and export" hook.
- **Don't ship a second chromatic hue.** Ink-blue is the only accent. No green checkmarks, no red warnings, no orange highlights. Tone is conveyed by structure and serif weight, not color.
- **Don't use cool blue-grays.** Warm neutrals only.
- **Don't use `font-weight: 700` or `bold`.** Headings are 500. If you need more emphasis, use serif italic or `<em>`.
- **Don't add emoji.** Kami documents are formal.
- **Don't include `position: fixed` / `position: sticky`.** PDFs don't scroll.
- **Don't ship JavaScript.** No interactivity in a PDF.
- **Don't use `rgba()` for tag/badge backgrounds.** Solid hex only.
- **Don't fetch from external CDNs at render time** beyond a single woff2 font URL if local fonts are unavailable. The PDF must reproduce identically offline.
- **Don't paste the rendered body inline** in the chat reply. The PDF path is the deliverable.
- **Don't pick a ninth template.** If the request doesn't fit one of the eight, pick the closest and adapt.
- **Don't run `export` on a draft.** Stabilize the markdown first.
