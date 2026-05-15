---
description: Layer 3 skill — exports markdown to a print-ready Kami-styled PDF (parchment canvas, ink-blue accent, serif). Takes a vault markdown path or inline markdown, generates Kami-styled HTML, and calls `write_export_pdf` to produce the PDF via headless Chrome. PDFs land in `<repo>/exports/` and are served by the local server at `/p/<slug>-<epoch>.pdf`; each regen gets a fresh epoch suffix to defeat CDN caching, and prior PDFs for the same title are auto-pruned. Use for deliverables that get sent, printed, or archived — resumes, letters, portfolios, equity reports, changelogs, one-pagers, long-docs, slide decks. Picks one of eight templates — one-pager, long-doc, letter, portfolio, resume, slides, equity-report, changelog. Distinct from `render-html` (interactive page) and `note-taker` (markdown source).
---

# Export

`export` is the **markdown → Kami-styled PDF** skill. It produces print-ready deliverables — the kind of artifact you attach to an email, hand to a printer, or archive as the canonical formal version of a document.

> If a user asks you to "make a PDF", "export this", "produce a resume", "send a letter", "deliver a report" — and the output should look polished and printed — this is the skill. If they want an *interactive* document to read on screen, that's `render-html`, not `export`.

## Why this skill exists

Three different read paths, three different skills:

| Read path | Owner | Format | Location |
|---|---|---|---|
| **Knowledge graph / archival** | `note-taker` | Markdown | Obsidian vault (`vault/…/<slug>.md`) |
| **On-screen exploration** | `render-html` | Nextra-served page (parchment editorial styling) | `http://localhost:8080/v/<YYYY-MM-DD>-<slug>` |
| **Print / deliverable** | `export` (this skill) | PDF (Kami aesthetic) | `http://localhost:8080/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf` |

The PDF is a **one-way derivative** — regeneratable from the markdown at any time. Edit the markdown, re-export, and a NEW file lands at a NEW URL: slug = `<YYYY-MM-DD>-<title>-<epoch>` where `<epoch>` is the Unix-seconds timestamp of the export. Each export gets its own URL so Cloudflare's edge cache can't serve a stale copy. **After the new PDF is on disk, prior PDFs for the same title across ALL dates are deleted automatically** — the regex wildcards the date prefix and matches the title slug exactly, so yesterday's `2026-05-14-foo-…pdf` is removed by today's `2026-05-15-foo-…pdf`. Only one file per title stays in `<repo>/exports/` at any time. Legacy unsuffixed PDFs (from before the epoch suffix existed) are caught in the same pass via an optional `-<epoch>` group. Per-file unlink failures are swallowed; the export still succeeds. The intermediate HTML is deleted once Chrome confirms the PDF was written; only the `.pdf` remains in `<repo>/exports/` (the canonical export root, served by the Next.js route handler at `app/p/[slug]/route.ts` which reads from disk at request time — the previous `public/p` symlink approach broke under `next start` because Next caches its public-files manifest at build time and prerenders 404s for files added later). Override the export root with `AGENTS_TEAM_EXPORT_PATH`. If Chrome fails to render, the HTML is retained as a fallback in `.pi/server/.export-tmp/` so you can inspect what was generated and re-run the renderer manually.

## URL access model

Each PDF lives at `http://…/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf` where `<slug>` is the slugified title and `<epoch>` is Unix-seconds at export time (appended so regenerations don't hit a stale CDN cache). The URL is the access control. There is no auth — the user shares the URL deliberately with whoever should receive the deliverable. Note: because every regeneration is a new URL, do NOT promise the recipient a "stable link" — if they need the latest version, send the latest URL.

The local server hides discovery vectors (`/`, `/p`, sitemap, search index, 404 page) so listing what exists is not possible from outside. Slugs are predictable from the title, though, so don't treat the URL as a secret — share each URL only in direct response to the user who asked for it.

## When to call

**Call `export` when the user explicitly wants a deliverable:**

- "Export this as a PDF" / "make it a PDF" / "give me a printable version"
- "Write me a resume / cover letter / quarterly report"
- "Produce the deck as a PDF"
- The artifact will be **sent to someone outside the vault** — emailed, printed, attached, submitted, archived as final.

**Don't call `export` for:**

- Anything the user will read in the terminal — PDFs aren't terminal-readable.
- On-screen exploration of a long document — use `render-html` (the PDF is static; the HTML is interactive).
- Quick captures, inbox notes, journal entries — markdown is the right artifact.
- Sub-session output, agent-to-agent hand-offs, prompt context — markdown is leaner.
- Anything that needs live JS interactivity (configurators, decks with arrow-key nav, copy buttons) — that's `render-html`, not `export`.
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

  title:          "<title>",                                        // required — used for the document
                                                                    //   title and to build the URL slug

  meta:           { author, date, audience, recipient, ... },       // optional — surfaced in the
                                                                    //   header/footer per template

  language:       "en" | "cn" | "ja",                               // optional — default "en". Picks
                                                                    //   the font stack and the EN/CN/JA
                                                                    //   variant of the template.
})
```

## What `export` produces

A `.pdf` file under `<repo>/exports/<YYYY-MM-DD>-<slug>-<epoch>.pdf` (override the root with `AGENTS_TEAM_EXPORT_PATH`). The `<epoch>` is Unix-seconds at export time — every regeneration produces a new filename so the CDN cache can't serve a stale copy under the URL it just handed out. After the new PDF is on disk, prior PDFs for the same title across ALL dates are unlinked automatically; only the latest version per title stays in the export root. Served by Nextra at `http://localhost:8080/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf` (or whatever `AGENTS_TEAM_SERVER_PUBLIC_URL` points to) via a route handler at `.pi/server/app/p/[slug]/route.ts` that reads from `exports/` at request time. Cache-Control set to `public, max-age=31536000, immutable` since URLs are never reused — Cloudflare can cache each PDF for a year.

**Returning the URL to the user.** The URL is the entire response. Do NOT:

- suggest setting up cloudflared, tunnels, or `AGENTS_TEAM_SERVER_PUBLIC_URL`;
- append a closing line restating that the deliverable is "now live", "available at the public URL", or otherwise re-affirming what the URL already proves;
- mention the tunnel, cloudflared, or any infrastructure detail on the happy path — the URL stands alone.

If there is nothing substantive to add after the URL (a clarifying question, a real next step the user needs to take), say nothing else. Re-exports work the same way: one URL, no wrap-up.

The intermediate HTML is written transiently to `.pi/server/.export-tmp/`, fed to Chrome, then deleted once Chrome confirms the PDF was produced. The only case where an HTML file survives is when Chrome itself failed (no binary found, render error), in which case the tool returns `isError: true` plus the path of the HTML it could not convert.

Returned to the caller (success case):

```
{
  slug:      "<YYYY-MM-DD>-<title-slug>-<epoch>",
  pdf_path:  "<absolute path to PDF>",
  pdf_url:   "http://localhost:8080/p/<slug>.pdf",
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

> Exported: `<pdf_url>`
> Source: `vault/…/file.md` (markdown is the source of truth — edit it there and re-export)

Do not paste the rendered body inline. The PDF is the deliverable.

## Kami design rules — hard constraints

These are not stylistic suggestions. They define what a Kami PDF looks like. Violating any one of them produces a document that is *not* a Kami document.

1. **Canvas: parchment `#f5f4ed`, edge to edge — on every page, not just the first.** Never pure white. Painted by `@page { background-color: #f5f4ed }` plus `html { background }` + `body { background }` + `print-color-adjust: exact`. Per-page gutters live on `@page { margin }` (e.g. `32mm 20mm`), NOT on `body { padding }` — `body { padding }` only applies once at the start of the body and once at the end, so on a multi-page document intermediate pages get zero top/bottom gutter and content butts the page edge. Modern Chrome `--headless=new` (the print engine the `write_export_pdf` tool invokes) honours `@page { background-color }`, so the parchment paints into the margin area on every page; the legacy "white border around the parchment" bug no longer applies. Keep `body { padding: 0 }` so the @page margin is the only gutter.
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
10. **No JavaScript.** Headless Chrome runs it once, but the artifact is print. If you need interactivity, you picked the wrong skill — use `render-html`.

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

## Diagrams first — reach for an inline SVG before anything else

The Kami aesthetic is severe by design (parchment, serif, single hue, no chrome), which makes diagrams **more** important, not less — one well-chosen inline SVG is the visual anchor. A Kami PDF without a diagram is almost always under-cooked. Use inline SVG only — never Mermaid (renders late, unsafe for the PDF snapshot), no external assets.

**Before drawing, check exit conditions.** Skip diagrams entirely for: pure narrative (letter), 1–2 data points (use a callout), >7 nodes that don't fit A4 portrait width (split or restructure), tables (use `<table>`), code (use `<pre>`).

**For the full diagram catalog** — exit conditions, content-pattern → diagram mapping, SVG snippets (sparkline, 3-node flow, decision tree LR, architecture box-and-line, timeline, bar plot), the design tokens (`--paper`, `--ink`, `--accent`, `--rule`), per-template diagram placement — **read [`diagrams.md`](diagrams.md) in this skill directory.** It is the authoritative reference; do not improvise diagrams without consulting it.

## Optional brand config

If `~/.config/kami/brand.md` exists (YAML frontmatter + markdown body), apply its identity/brand/defaults **only when the request is ambiguous**. Per-document `meta` overrides brand config. Example brand fields: `author`, `tagline`, `default_template`, `accent_override`. The skill does not write to this file; the user maintains it.

## Steps

1. **Resolve the source.** If `md_path` is provided, use the core `read` tool to load it from the vault. Otherwise, use the inline `markdown` passed in. If both or neither are provided, error.
2. **Parse frontmatter.** Extract title, date, tags, author, source_agent — anything that informs the header/footer.
3. **Decide the template.** Use the caller's `template` if provided; otherwise infer from frontmatter `type` or folder (`pm/reports/` → equity-report or long-doc; `learning/cover-letter/` → letter; `engineering/changelog/` → changelog; `<vault>/resume/` → resume).
4. **Decide the language.** Default `en`. Switch font stack accordingly.
5. **Scan for diagrammable shapes.** Before assembling the HTML, read [`diagrams.md`](diagrams.md) and run the markdown through its "Content patterns that should be a diagram" table. Identify at least one inline SVG to include (two if the content supports it and the template tolerates two). Compose the SVG using the snippets in `diagrams.md` as a base. For `letter` and pure-list `resume` sections, skipping is fine — see the exit conditions in `diagrams.md`.
6. **Assemble the HTML** using the scaffold in [`html-template.md`](html-template.md) as the base, filling in `{{TITLE}}`, `{{HEAD_FONTS}}`, `{{HEADER}}`, `{{BODY}}`, `{{META_FOOTER}}`. **Place the diagram(s) near the section they illustrate** — not at the end as decoration. Embed all CSS inline. No remote scripts. No Mermaid.
7. **Call `write_export_pdf`** with the assembled HTML, the title, the template name, and (if applicable) `source_md_path`.
8. **Return** `{ id, pdf_path, pdf_url, title, template }` to the caller. (The intermediate HTML was deleted by the tool after Chrome rendered the PDF.)
9. **The agent's user-facing reply** is then:
   > Exported: `<pdf_url>`
   > Source: `vault/…/file.md` (markdown is the source of truth — edit it there and re-export)

   Do not paste the rendered body inline.

## Self-contained HTML template

The base HTML scaffold (parchment canvas, ink-blue accent, Charter serif, all CSS inline, `@page` rules, `print-color-adjust: exact`, no external scripts) lives in **[`html-template.md`](html-template.md)** — read it before assembling the HTML. Fill in `{{TITLE}}`, `{{HEAD_FONTS}}`, `{{HEADER}}`, `{{BODY}}`, `{{META_FOOTER}}`. Adjust `@page` and `body` rules per template (long-doc keeps reading line-height 1.55; resume tightens to 1.4; slides uses landscape A4 with `@page { margin: 0 }`; default vertical gutter is 32mm so multi-page docs get visible breathing room between pages). Embed all CSS inline; do not add CDN scripts.

## Per-template adjustments

Apply these on top of the base scaffold. **Per-template gutters live on `@page { margin }`, not on `body { padding }`** — `body { padding }` only paints once (document start + end), so multi-page docs would butt content against the page edge on intermediate pages. Always pair the @page margin override with `background-color: #f5f4ed` so the parchment continues to paint into the margin area; `body { padding }` stays at 0.

### one-pager
- `@page { margin: 18mm 18mm; background-color: #f5f4ed; }` (only override if you need to deviate from the 32mm/20mm default — one-pagers fit on a single page so the inter-page gutter is moot, and tightening reclaims body height)
- Headline + subtitle, then either `.grid-3` or three `<section>` blocks.
- No page break — content must fit on one A4 page.

### long-doc
- @page margin stays at the base `32mm 20mm`.
- Optional title page (`<section class="page-break">` with just `h1` + `.meta`).
- Optional TOC: `<nav class="toc"><ol>…</ol></nav>` directly after the title page. No sidebar TOC (this is print).
- Sections with `h2` — let pagination flow naturally; only force `page-break-before` for major parts.

### letter
- `@page { margin: 28mm 24mm; background-color: #f5f4ed; }` — letter convention is generous gutters.
- Sender block (right-aligned): name, address, email, date.
- Recipient block (left-aligned), 1 line break below sender.
- Salutation, body paragraphs (reading line-height 1.55), closing ("Sincerely,"), signature line, typed name.
- No header band; the letter starts directly with sender/recipient.

### portfolio
- @page margin stays at the base `32mm 20mm`.
- Cover page: `<section class="page-break">` with `h1` (name) + `.doc-sub` (positioning line) + accent rule.
- One `<section class="page-break">` per project. Inside: project title (h2), `.meta` row (role · dates · stack), 2–3 paragraphs of narrative, optional `.callout` for a pull-quote, optional inline SVG visual.

### resume
- `@page { margin: 16mm 18mm 18mm 18mm; background-color: #f5f4ed; }` — resumes pack tight.
- Single-column or two-column (`.grid-resume`: sidebar 30% / main 70%).
- Header: `<h1>` name, `.meta` strip with contact details (email · phone · location · links).
- Sections (h2): Experience · Projects · Education · Skills. Dense line-height (`<main class="dense">`).
- Each experience entry: `<h3>` role · company, `.meta` dates/location, 2–4 bullet outcomes.

### slides
- Override the base page rule: `@page { size: 297mm 210mm landscape; margin: 0; background-color: #f5f4ed; }` — slides go edge-to-edge, so override the base 32mm/20mm margin back to 0. Keep `background-color` so the parchment still paints.
- `body { padding: 0; }` (already the base) — the `.slide` class supplies its own internal padding (`padding: 8vh 8vw`).
- One `<section class="slide">` per slide.
- h1 as title slide; h2 as section slides. Body text is short — slides are landing-pad markers, not paragraphs.
- Add page number in bottom-right via `<footer>` inside each `.slide` (no `position: fixed`).

### equity-report
- `@page { margin: 20mm 20mm 22mm 20mm; background-color: #f5f4ed; }`
- Header band: ticker · price · rating · target (use `.doc-header` with `.doc-meta` right-aligned).
- Executive summary `<div class="callout">` directly under the header.
- Sections: Thesis · Numbers · Risks · Catalysts. Heavy use of `<table>` for the Numbers section.
- Optional inline SVG sparkline next to key metrics.

### changelog
- `@page { margin: 18mm 20mm; background-color: #f5f4ed; }`
- `h2` per version with `.meta` strip (date · type [major/minor/patch] · tags).
- `h3` per category: Added · Changed · Fixed · Removed.
- Dense bullet lists, no paragraphs.

## Footer

Append a minimal `<footer class="doc-footer">` containing **only the date** (ISO format, single token). Nothing else. The recipient of a Kami PDF doesn't need production metadata, and the file URL already carries the date in its slug.

Correct:

```html
<footer class="doc-footer">2026-05-15</footer>
```

**Forbidden** — every one of these is wrong, do not ship any variant:

```html
<!-- WRONG: source path -->
<footer class="doc-footer">Exported from vault/learning/foo.md · 2026-05-15</footer>

<!-- WRONG: template name -->
<footer class="doc-footer">2026-05-15 · template long-doc</footer>

<!-- WRONG: generating agent / persona -->
<footer class="doc-footer">2026-05-15 · generated by educator</footer>

<!-- WRONG: all three at once (the kitchen-sink failure mode) -->
<footer class="doc-footer">
  Exported from vault/learning/foo.md · 2026-05-15 · template long-doc · generated by educator
</footer>
```

If you find yourself reaching for any "Exported from", "template", "generated by", "source", or persona name in the footer, stop — none of those belong in the deliverable. The footer is one date, that's it.

For `letter`, omit the footer entirely (a letter doesn't carry meta about its production).

## Don't

- **Don't write PDF to the vault.** Always use `write_export_pdf`, which targets the canonical export root at `<repo>/exports/` (served by the Next.js route handler at `app/p/[slug]/route.ts`). Vault stays markdown-only — PDFs are derivatives and don't belong next to source notes.
- **Don't proactively list URLs.** Each PDF URL is shared deliberately by the user. Never volunteer "here are your recent exports".
- **Don't synthesize content.** Export reads the markdown source (or the inline markdown passed in). If you find yourself inventing sections that weren't in the source, stop — edit the markdown via `note-taker` first, then re-export.
- **Don't auto-export.** The user explicitly triggers this skill. No "save and export" hook.
- **Don't ship a second chromatic hue.** Ink-blue is the only accent. No green checkmarks, no red warnings, no orange highlights. Tone is conveyed by structure and serif weight, not color.
- **Don't use cool blue-grays.** Warm neutrals only.
- **Don't use `font-weight: 700` or `bold`.** Headings are 500. If you need more emphasis, use serif italic or `<em>`.
- **Don't add emoji.** Kami documents are formal.
- **Don't include `position: fixed` / `position: sticky`.** PDFs don't scroll.
- **Don't ship JavaScript.** No interactivity in a PDF.
- **Don't use Mermaid.** Mermaid renders late (after DOMContentLoaded) and is unreliable in the PDF snapshot — Chrome's print path can capture before Mermaid finishes, and WeasyPrint doesn't run JS at all. Use **inline SVG** for every diagram.
- **Don't ship a PDF with zero diagrams** unless the template is `letter`, the resume sections are pure lists, or your honest scan against "Content patterns that should be a diagram" found nothing. A Kami document without a single visual anchor is leaving the medium's biggest lever unpulled. If you cannot find a diagrammable shape AND the template isn't letter/resume-list, the artifact may not warrant an export — say so to the caller.
- **Don't use `rgba()` for tag/badge backgrounds.** Solid hex only.
- **Don't fetch from external CDNs at render time** beyond a single woff2 font URL if local fonts are unavailable. The PDF must reproduce identically offline.
- **Don't paste the rendered body inline** in the chat reply. The PDF path is the deliverable.
- **Don't put production metadata in the footer.** No "Exported from …", no source path, no template name, no "generated by <persona>", no author handle. The footer is the date alone (or absent on `letter`). See the Footer section for the forbidden variants.
- **Don't pick a ninth template.** If the request doesn't fit one of the eight, pick the closest and adapt.
- **Don't run `export` on a draft.** Stabilize the markdown first.
