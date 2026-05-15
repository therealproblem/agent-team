---
description: Layer 3 shared skill — exports markdown to a print-ready Kami-styled PDF (parchment canvas, ink-blue accent, serif throughout, single chromatic hue). Takes a vault markdown path or inline markdown, generates a Kami-styled HTML, and calls `write_export_pdf` to produce a PDF via headless Chrome. The PDF is served by the local Nextra server at `http://localhost:8080/p/<YYYY-MM-DD>-<slug>.pdf` (or the `AGENTS_TEAM_SERVER_PUBLIC_URL` hostname). Re-exporting the same title on the same day overwrites the file. Use for deliverables that will be sent, printed, or archived — resumes, letters, portfolios, equity reports, changelogs, one-pagers, long-form docs, slide decks. Picks one of eight templates — one-pager, long-doc, letter, portfolio, resume, slides, equity-report, changelog. Distinct from `render` (interactive page) and `note-taker` (markdown source). The PDF is a one-way deliverable; markdown is the source of truth.
---

# Export

`export` is the **markdown → Kami-styled PDF** skill. It produces print-ready deliverables — the kind of artifact you attach to an email, hand to a printer, or archive as the canonical formal version of a document.

> If a user asks you to "make a PDF", "export this", "produce a resume", "send a letter", "deliver a report" — and the output should look polished and printed — this is the skill. If they want an *interactive* document to read on screen, that's `render`, not `export`.

## Why this skill exists

Three different read paths, three different skills:

| Read path | Owner | Format | Location |
|---|---|---|---|
| **Knowledge graph / archival** | `note-taker` | Markdown | Obsidian vault (`vault/…/<slug>.md`) |
| **On-screen exploration** | `render` | Nextra-served page (parchment editorial styling) | `http://localhost:8080/r/<YYYY-MM-DD>-<slug>` |
| **Print / deliverable** | `export` (this skill) | PDF (Kami aesthetic) | `http://localhost:8080/p/<YYYY-MM-DD>-<slug>.pdf` |

The PDF is a **one-way derivative** — regeneratable from the markdown at any time. Edit the markdown, re-export and the new content lands at the same URL (slug = date + title; same-day re-exports overwrite). The intermediate HTML is deleted once Chrome confirms the PDF was written; only the `.pdf` remains in `.pi/server/public/p/`. (If Chrome fails to render, the HTML is retained as a fallback in `.pi/server/.export-tmp/` so you can inspect what was generated and re-run the renderer manually.)

## URL access model

Each PDF lives at `http://…/p/<YYYY-MM-DD>-<slug>.pdf` where `<slug>` is the slugified title. The URL is the access control. There is no auth — the user shares the URL deliberately with whoever should receive the deliverable.

The local server hides discovery vectors (`/`, `/p`, sitemap, search index, 404 page) so listing what exists is not possible from outside. Slugs are predictable from the title, though, so don't treat the URL as a secret — share each URL only in direct response to the user who asked for it.

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

A `.pdf` file under `.pi/server/public/p/<YYYY-MM-DD>-<slug>.pdf`, served by Nextra (Next.js static) at `http://localhost:8080/p/<YYYY-MM-DD>-<slug>.pdf` (or whatever `AGENTS_TEAM_SERVER_PUBLIC_URL` points to — set this to your cloudflared tunnel hostname for share-ready URLs across sessions).

The intermediate HTML is written transiently to `.pi/server/.export-tmp/`, fed to Chrome, then deleted once Chrome confirms the PDF was produced. The only case where an HTML file survives is when Chrome itself failed (no binary found, render error), in which case the tool returns `isError: true` plus the path of the HTML it could not convert.

Returned to the caller (success case):

```
{
  slug:      "<YYYY-MM-DD>-<title-slug>",
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

## Diagrams first — reach for an inline SVG before anything else

The Kami aesthetic is severe by design — parchment, serif, single hue, no decorative chrome. That severity makes diagrams **more** important, not less: in a document with no second color and no glass / glow / gradient, a single well-chosen diagram is the visual anchor.

A Kami PDF without a single diagram is almost always under-cooked. Before generating the HTML, scan the markdown for the patterns below and produce **at least one** inline SVG. WeasyPrint and Chrome both render inline SVG natively — no JS, no Mermaid (Mermaid renders late and is unsafe for the PDF snapshot), no external assets.

### Content patterns that should be a diagram

| If the markdown contains… | Reach for |
|---|---|
| Sequenced steps or a process | Horizontal flow — rounded rects + arrows in `var(--ink-mute)`, accent fill on the current/highlighted node |
| Decisions / branching logic | Decision diamond + branch labels in serif |
| State transitions | Nodes-and-edges with state labels; "active" state filled `var(--accent)`, others outlined |
| Time-based progression — single thread (incident timeline, version history, one-track roadmap) | Vertical timeline with `var(--rule)` axis, accent dots for events |
| Schedule across multiple parallel workstreams (quarterly roadmap, sprint plan, project plan) | Gantt — rows per workstream, time axis on top, status encoded by fill (filled / outlined / dashed) not by hue |
| Architecture / module relationships | Boxes-and-arrows with subgraph boundaries; `var(--paper-soft)` fill for boxes inside the same system |
| Organizational hierarchy (org chart, taxonomy, file-tree) | Tree with ranked levels; serif text only, no icons |
| Numbers over time (equity curve, score trend, growth) | Sparkline — single `<polyline>` SVG, accent stroke |
| Distribution / proportion | Horizontal bar plot. **Preferred over pie** in Kami — same-hue bars read cleaner than pie slices that would tempt a second color |
| Score / rating | Radial indicator (SVG circle with centered text), or a 5-dot scale with filled vs. outlined dots |
| Side-by-side metrics with annotations | Small multiples — N tiny SVGs in a row, each a sparkline or bar |
| Geographic / map content (rare, but happens) | Hand-SVG outline, accent fill for the regions being discussed |
| Comparison of N independent options | **Not** a diagram — a `.grid-2` or `.grid-3` of bordered `.card`s with a callout for the recommendation is better |

Pick at least one. If the markdown supports two, use two — Kami documents tolerate two diagrams gracefully per A4 page (figure-and-counter-figure is a print-design classic). Three on one page is usually too much.

### When NOT to add a diagram

- Single-paragraph `letter` template with no claim that has a visual shape.
- Resume sections that are pure lists (Experience, Education) — diluting the dense-text rhythm. EXCEPT: a sparkline / radial in the Skills section showing proficiency is on-brand.
- Cover pages — a single Kami cover with the title is more powerful undecorated.
- A page where the table IS the diagram (e.g. the Numbers section of an equity report — the table is already structured).

### Palette constraint

Every SVG uses only Kami CSS vars: `var(--paper)`, `var(--paper-soft)`, `var(--ink)`, `var(--ink-soft)`, `var(--ink-mute)`, `var(--rule)`, `var(--accent)`. No additional colors. No `rgba()` (the same WeasyPrint discipline applies to SVG fills — solid hex / CSS var only).

### Inline SVG patterns (drop in and adapt)

#### Sparkline — numbers over time

```html
<svg viewBox="0 0 120 28" width="120" height="28" aria-hidden="true">
  <polyline fill="none" stroke="var(--accent)" stroke-width="1.5"
            points="0,20 12,18 24,15 36,17 48,12 60,9 72,11 84,7 96,8 108,5 120,4" />
</svg>
```

Use inline next to a metric heading, or stacked in a "small multiples" row at the top of a report section.

#### Horizontal bar plot — distribution / proportion

```html
<svg viewBox="0 0 320 100" aria-hidden="true">
  <g font-family="var(--serif)" font-size="10" fill="var(--ink-soft)">
    <text x="0" y="14">Setup A</text>
    <rect x="80" y="4" width="180" height="14" fill="var(--accent)" />
    <text x="265" y="14">62%</text>

    <text x="0" y="42">Setup B</text>
    <rect x="80" y="32" width="120" height="14" fill="var(--accent)" />
    <text x="205" y="42">41%</text>

    <text x="0" y="70">Setup C</text>
    <rect x="80" y="60" width="58" height="14" fill="var(--accent)" />
    <text x="143" y="70">20%</text>
  </g>
</svg>
```

Prefer over pie — single-hue bars read cleaner than pie slices that tempt a second color.

#### Process flow — sequenced steps

```html
<svg viewBox="0 0 480 80" aria-hidden="true">
  <g font-family="var(--serif)" font-size="11" fill="var(--ink)" text-anchor="middle">
    <rect x="10"  y="20" width="100" height="40" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="60" y="44">Draft</text>

    <rect x="190" y="20" width="100" height="40" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="240" y="44">Review</text>

    <rect x="370" y="20" width="100" height="40" rx="6" fill="var(--accent)" stroke="var(--accent)"/>
    <text x="420" y="44" fill="var(--paper)">Shipped</text>

    <line x1="115" y1="40" x2="185" y2="40" stroke="var(--ink-mute)" stroke-width="1"/>
    <polygon points="180,36 188,40 180,44" fill="var(--ink-mute)"/>

    <line x1="295" y1="40" x2="365" y2="40" stroke="var(--ink-mute)" stroke-width="1"/>
    <polygon points="360,36 368,40 360,44" fill="var(--ink-mute)"/>
  </g>
</svg>
```

#### Vertical timeline — incident / roadmap / version history

```html
<svg viewBox="0 0 320 180" aria-hidden="true">
  <line x1="14" y1="10" x2="14" y2="170" stroke="var(--rule)" stroke-width="1"/>
  <g font-family="var(--serif)" font-size="10" fill="var(--ink-soft)">
    <circle cx="14" cy="22"  r="5" fill="var(--accent)"/>
    <text x="30" y="20">14:02 — Spike begins</text>
    <text x="30" y="32" fill="var(--ink-mute)">Latency p99 ↑ 8×</text>

    <circle cx="14" cy="64"  r="5" fill="var(--accent)"/>
    <text x="30" y="62">14:11 — Alert paged</text>

    <circle cx="14" cy="106" r="5" fill="var(--paper)" stroke="var(--accent)" stroke-width="2"/>
    <text x="30" y="104">14:24 — Roll back deploy</text>

    <circle cx="14" cy="148" r="5" fill="var(--paper)" stroke="var(--accent)" stroke-width="2"/>
    <text x="30" y="146">14:38 — Recovered</text>
  </g>
</svg>
```

#### Radial score — 0–100 indicator

```html
<svg viewBox="0 0 60 60" aria-hidden="true">
  <circle cx="30" cy="30" r="26" fill="none" stroke="var(--rule)" stroke-width="3"/>
  <circle cx="30" cy="30" r="26" fill="none" stroke="var(--accent)" stroke-width="3"
          stroke-dasharray="163" stroke-dashoffset="49"
          transform="rotate(-90 30 30)"/>
  <text x="30" y="34" font-family="var(--serif)" font-size="14" fill="var(--ink)" text-anchor="middle">70</text>
</svg>
```

Math: circumference is `2π × 26 ≈ 163`. For score `s` out of 100, `stroke-dashoffset = 163 × (1 - s/100)`. The first `<circle>` is the track, the second is the filled arc.

#### Architecture sketch — modules + edges

```html
<svg viewBox="0 0 480 160" aria-hidden="true">
  <g font-family="var(--serif)" font-size="11" fill="var(--ink)" text-anchor="middle">
    <!-- subgraph: client tier -->
    <rect x="10" y="10" width="140" height="60" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="80" y="40">Client</text>

    <!-- subgraph: api tier -->
    <rect x="190" y="10" width="140" height="140" rx="6" fill="none" stroke="var(--rule)" stroke-dasharray="3,3"/>
    <rect x="200" y="20" width="120" height="36" rx="4" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="260" y="42">Auth API</text>
    <rect x="200" y="64" width="120" height="36" rx="4" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="260" y="86">Data API</text>
    <rect x="200" y="108" width="120" height="36" rx="4" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="260" y="130">Cache</text>

    <!-- store -->
    <rect x="370" y="60" width="100" height="40" rx="6" fill="var(--accent)" stroke="var(--accent)"/>
    <text x="420" y="84" fill="var(--paper)">Postgres</text>

    <!-- edges -->
    <line x1="150" y1="40" x2="195" y2="40" stroke="var(--ink-mute)" stroke-width="1"/>
    <line x1="320" y1="82" x2="365" y2="82" stroke="var(--ink-mute)" stroke-width="1"/>
  </g>
</svg>
```

#### Vertical sequential flow — pipeline / stacked steps

Use when the source markdown shows a top-to-bottom pipeline (numbered steps, "first … then … finally"). Do **not** reuse the horizontal-flow snippet rotated 90°; the polygon arrowheads in that snippet point right, and a sideways triangle on a vertical line reads as a tick mark, not an arrow.

```html
<svg viewBox="0 0 260 380" aria-hidden="true">
  <g font-family="var(--serif)" font-size="11" fill="var(--ink)" text-anchor="middle">
    <rect x="40" y="10"  width="180" height="50" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="130" y="32">1. User Input</text>
    <text x="130" y="48" font-size="9" fill="var(--ink-mute)">"Tell me about my project"</text>

    <line x1="130" y1="60" x2="130" y2="82" stroke="var(--ink-mute)" stroke-width="1.25"/>
    <polygon points="124,78 136,78 130,88" fill="var(--ink-mute)"/>

    <rect x="40" y="92"  width="180" height="50" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="130" y="114">2. Query Episodic Memory</text>
    <text x="130" y="130" font-size="9" fill="var(--ink-mute)">Past sessions mentioning "project"</text>

    <line x1="130" y1="142" x2="130" y2="164" stroke="var(--ink-mute)" stroke-width="1.25"/>
    <polygon points="124,160 136,160 130,170" fill="var(--ink-mute)"/>

    <rect x="40" y="174" width="180" height="50" rx="6" fill="var(--accent)" stroke="var(--accent)"/>
    <text x="130" y="196" fill="var(--paper)">3. Construct Prompt</text>
    <text x="130" y="212" font-size="9" fill="var(--paper)">System + Memory + Input</text>

    <line x1="130" y1="224" x2="130" y2="246" stroke="var(--ink-mute)" stroke-width="1.25"/>
    <polygon points="124,242 136,242 130,252" fill="var(--ink-mute)"/>

    <rect x="40" y="256" width="180" height="50" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="130" y="284">4. Model Inference</text>
  </g>
</svg>
```

Arrowhead geometry (memorize this): for a **down-pointing** triangle whose tip sits at `(X, Y)`, the polygon is `points="X-6,Y-10 X+6,Y-10 X,Y"` — 12px wide, 10px tall. That's the minimum size that reads as an arrow at print scale; smaller and it looks like a stray dot. The line that feeds the arrow should stop ~6px short of the tip so the triangle doesn't have a stem sticking out the top.

#### Fan-out — one parent connecting to N children (comb routing)

Use whenever a single box has edges down to multiple boxes below it (the most common architecture-diagram shape). **Do NOT draw N diagonal lines from a single point on the parent**; that reads as a starburst, not a topology. Use a "comb": a short trunk down from the parent, a horizontal bus, and a drop into each child.

```html
<svg viewBox="0 0 480 220" aria-hidden="true">
  <g font-family="var(--serif)" font-size="11" fill="var(--ink)" text-anchor="middle">
    <!-- Parent -->
    <rect x="140" y="10" width="200" height="56" rx="6" fill="var(--accent)" stroke="var(--accent)"/>
    <text x="240" y="38" fill="var(--paper)">Session Manager</text>
    <text x="240" y="54" font-size="9" fill="var(--paper)">parse · retrieve · call · update</text>

    <!-- Trunk down from parent center-bottom -->
    <line x1="240" y1="66" x2="240" y2="96" stroke="var(--ink-mute)" stroke-width="1"/>
    <!-- Horizontal bus -->
    <line x1="100" y1="96" x2="380" y2="96" stroke="var(--ink-mute)" stroke-width="1"/>
    <!-- Drop into each child, with arrowhead overlapping the child's top edge -->
    <line x1="100" y1="96" x2="100" y2="128" stroke="var(--ink-mute)" stroke-width="1.25"/>
    <polygon points="94,124 106,124 100,134" fill="var(--ink-mute)"/>
    <line x1="380" y1="96" x2="380" y2="128" stroke="var(--ink-mute)" stroke-width="1.25"/>
    <polygon points="374,124 386,124 380,134" fill="var(--ink-mute)"/>

    <!-- Children -->
    <rect x="20"  y="134" width="160" height="64" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="100" y="160">Hermes 3 Model</text>
    <text x="100" y="178" font-size="9" fill="var(--ink-mute)">Llama 3.1 fine-tune</text>

    <rect x="300" y="134" width="160" height="64" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="380" y="160">Memory Store</text>
    <text x="380" y="178" font-size="9" fill="var(--ink-mute)">SQLite + vectors</text>
  </g>
</svg>
```

For 3 children, add a middle drop at the parent's center X (`x1="240" x2="240"`). For 4+ children, keep them evenly spaced along the bus; if the bus would be wider than the canvas, switch to a two-level tree (parent → 2 group nodes → leaves) instead of cramming.

**Anti-patterns to avoid in fan-out / pipeline diagrams:**

- **Starburst origin.** Multiple connectors sharing one origin point and fanning out diagonally to children. Always use a trunk + bus (comb) instead.
- **Floating arrowhead.** An arrow whose tip sits in empty space, not overlapping any child's top edge. The tip must land on (or just inside) the target box's border.
- **Phantom edge.** A connector that points to no target at all. If the source markdown describes a path that has nowhere to go in your current diagram, drop the path or add the target box — don't ship a dangling arrow.
- **Pencil-mark arrowheads.** A `<line>` with no `<polygon>`, or a polygon under ~8px wide. At print scale these read as decoration. Use the 12×10 polygon from the snippet above.

#### Gantt — schedule across parallel workstreams

Use when the source markdown describes a multi-workstream schedule (quarterly roadmap, sprint plan, project plan with overlapping tracks). **Mermaid `gantt` is banned** (renders late, doesn't match Kami) so the chart is hand-rolled inline SVG: one row per workstream, time axis on top, status encoded by *fill style* — not by hue, because Kami's single-chromatic-hue rule forbids the usual green / orange / red palette.

```html
<svg viewBox="0 0 520 240" aria-hidden="true">
  <g font-family="var(--serif)" font-size="10" fill="var(--ink)">

    <!-- Time axis labels (Q1..Q4, months, sprints — match the source) -->
    <g font-size="9" fill="var(--ink-mute)" text-anchor="middle">
      <text x="170" y="14">Q1</text>
      <text x="270" y="14">Q2</text>
      <text x="370" y="14">Q3</text>
      <text x="470" y="14">Q4</text>
    </g>
    <line x1="120" y1="22" x2="520" y2="22" stroke="var(--rule)"/>

    <!-- Vertical grid at period boundaries (parchment-soft, recessive) -->
    <g stroke="var(--paper-soft)" stroke-width="1">
      <line x1="220" y1="22" x2="220" y2="220"/>
      <line x1="320" y1="22" x2="320" y2="220"/>
      <line x1="420" y1="22" x2="420" y2="220"/>
    </g>

    <!-- Today marker — dashed accent vertical with caption -->
    <line x1="250" y1="22" x2="250" y2="220" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2,2"/>
    <text x="250" y="234" font-size="8.5" fill="var(--accent)" text-anchor="middle" font-style="italic">Today</text>

    <!-- Row 1 — Done (filled accent bar) -->
    <text x="0" y="46">Discovery</text>
    <rect x="120" y="36" width="100" height="14" fill="var(--accent)"/>

    <!-- Row 2 — Active (filled accent bar crossing today) -->
    <text x="0" y="76">Spec &amp; architecture</text>
    <rect x="200" y="66" width="120" height="14" fill="var(--accent)"/>

    <!-- Row 3 — Planned (outlined only, transparent fill) -->
    <text x="0" y="106">Build · core</text>
    <rect x="270" y="96" width="140" height="14" fill="none" stroke="var(--accent)" stroke-width="1.25"/>

    <!-- Row 4 — At-risk (dashed outline) -->
    <text x="0" y="136">Beta launch</text>
    <rect x="410" y="126" width="80" height="14" fill="none" stroke="var(--accent)" stroke-width="1.25" stroke-dasharray="3,2"/>

    <!-- Row 5 — Milestone (filled diamond, NOT a zero-width bar) -->
    <text x="0" y="166">GA milestone</text>
    <polygon points="490,160 498,168 490,176 482,168" fill="var(--accent)"/>
  </g>
</svg>
```

Pair the chart with a small legend strip above or below — three or four `.swatch` chips that name the fill styles (filled = done/active, outlined = planned, dashed = at-risk). The reader has to learn the convention once per document; the legend earns its keep.

**Anti-patterns specific to gantt:**

- **Second chromatic hue.** Resist the impulse to colour at-risk bars red, done bars green, in-flight bars orange. Kami is single-hue; status is fill *style*, not fill *colour*.
- **Zero-width milestone.** A `<rect width="0">` disappears in print. Use a filled diamond `<polygon>` (8px square, rotated 45°) for any single-day event.
- **In-bar labels.** Text painted on top of an accent bar collides with the single-hue discipline (the text either fights the bar or vanishes into it). The row label on the left says what the bar is; the bar's left edge says when it starts. That's sufficient.
- **Dependency arrows draped across the chart.** If tasks are genuinely dependent, draw a separate Process-flow diagram for the dependency graph. A gantt is for *when*, not *because-of*.

### Per-template diagram fit

| Template | Where the diagram naturally lives |
|---|---|
| **one-pager** | One mid-page SVG as the visual anchor — a sparkline next to the headline metric, or a 3-node flow showing the proposed process. |
| **long-doc** | One diagram per major section — flow per stage, sparkline per metric, timeline if the doc has any chronological dimension. |
| **letter** | None. A formal letter doesn't carry diagrams. |
| **portfolio** | Each project gets a hero diagram — architecture sketch, before/after, or a small chart of impact. |
| **resume** | Skills sparklines (proficiency over years), or a single timeline of career milestones. Keep them small. |
| **slides** | Each slide that's a *claim with a shape* should BE a diagram, not a bullet list. Trim text aggressively; reach for SVG first. |
| **equity-report** | Sparklines next to every metric in the Numbers section; bar plot if you have setup-frequency data; timeline in the Catalysts section. |
| **changelog** | Optional — usually unnecessary, but a sparkline per version showing scope (lines changed, features added) can be tasteful. |

## Optional brand config

If `~/.config/kami/brand.md` exists (YAML frontmatter + markdown body), apply its identity/brand/defaults **only when the request is ambiguous**. Per-document `meta` overrides brand config. Example brand fields: `author`, `tagline`, `default_template`, `accent_override`. The skill does not write to this file; the user maintains it.

## Steps

1. **Resolve the source.** If `md_path` is provided, use the core `read` tool to load it from the vault. Otherwise, use the inline `markdown` passed in. If both or neither are provided, error.
2. **Parse frontmatter.** Extract title, date, tags, author, source_agent — anything that informs the header/footer.
3. **Decide the template.** Use the caller's `template` if provided; otherwise infer from frontmatter `type` or folder (`pm/reports/` → equity-report or long-doc; `learning/cover-letter/` → letter; `engineering/changelog/` → changelog; `<vault>/resume/` → resume).
4. **Decide the language.** Default `en`. Switch font stack accordingly.
5. **Scan for diagrammable shapes.** Before assembling the HTML, run the markdown through the "Content patterns that should be a diagram" table above. Identify at least one inline SVG to include (two if the content supports it and the template tolerates two). Compose the SVG using the snippets in the diagrams section as a base. For `letter` and pure-list `resume` sections, skipping is fine — see "When NOT to add a diagram".
6. **Assemble the HTML** using the template scaffold below as the base, filling in `{{TITLE}}`, `{{HEAD_FONTS}}`, `{{HEADER}}`, `{{BODY}}`, `{{META_FOOTER}}`. **Place the diagram(s) near the section they illustrate** — not at the end as decoration. Embed all CSS inline. No remote scripts. No Mermaid.
7. **Call `write_export_pdf`** with the assembled HTML, the title, the template name, and (if applicable) `source_md_path`.
8. **Return** `{ id, pdf_path, pdf_url, title, template }` to the caller. (The intermediate HTML was deleted by the tool after Chrome rendered the PDF.)
9. **The agent's user-facing reply** is then:
   > Exported: `<pdf_url>`
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

- **Don't write PDF to the vault.** Always use `write_export_pdf`, which targets `.pi/server/public/p/` (served by Nextra) outside the vault. Vault stays markdown-only.
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
- **Don't pick a ninth template.** If the request doesn't fit one of the eight, pick the closest and adapt.
- **Don't run `export` on a draft.** Stabilize the markdown first.
