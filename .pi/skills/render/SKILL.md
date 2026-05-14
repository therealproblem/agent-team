---
description: Layer 3 shared skill — converts an existing markdown note from the Obsidian vault into a self-contained interactive HTML presentation. Reads the markdown source via the core `read` tool, generates a complete HTML document with hand-tuned shadcn-style CSS, opt-in CDN assets (Tailwind, Google Fonts, Lucide, Mermaid), and inline vanilla JS for interactivity (collapsibles, tabs, copy buttons, theme toggle, decks). Writes the result via the `write_render` tool to `renders/` OUTSIDE the vault — the vault stays markdown-only so Obsidian's graph view, backlinks, and tag search work. Returns a `file://` URL. The render is a one-way derivative; the markdown is always the source of truth. Personas call this AFTER `note-taker` has saved the markdown, and only when an interactive reading experience is worth the work — short captures, agent-to-agent output, and PR-review artifacts stay markdown-only.
---

# Render

`render` is the **markdown → HTML presentation** skill. It takes an already-saved note in the Obsidian vault and produces an interactive HTML file outside the vault, in `renders/`.

> If you would otherwise paste a multi-section markdown doc inline as the agent's reply, **stop**. Save it via `note-taker` first (the vault is markdown-canonical), then call `render` to give the user a URL to read.

## Why this skill exists

Two separate concerns:

| Concern | Owner | Format | Location |
|---|---|---|---|
| **Storage / knowledge graph** | `note-taker` | Markdown | Obsidian vault (`vault/…/<slug>.md`) |
| **Reading experience** | `render` (this skill) | Interactive HTML | `renders/<slug>.html` (outside vault) |

The vault is an Obsidian vault: it must stay markdown so frontmatter, `[[wiki-links]]`, inline `#tags`, and graph view continue to work. HTML files in the vault break that — they're not indexed, links inside aren't traced.

The HTML render is a **one-way derivative** — regeneratable from the markdown at any time. It is presentation, not source of truth. If the user edits the markdown later, re-run `render` to regenerate.

## When to call

**Call `render` when** the markdown would meaningfully benefit from at least 2–3 of the patterns below (diagrams, tabs, callouts, timelines, sparklines, decks, configurators). If the markdown is just headings + paragraphs + code blocks, *don't render*; the markdown itself reads fine.

**Don't call `render` for:**
- Inbox captures, journal entries, trade entries, meeting notes — short, no structure, no audience.
- ADRs / PRDs whose primary read path is git PR review — the diff IS the read; HTML diffs are noisy.
- Anything agent-to-agent (sub-session output, prompt context, hand-offs) — markdown is leaner.
- Output the user will read in the terminal — HTML is unreadable there.
- 50-word replies — they don't deserve a styled page.

**Always call `render` after** `note-taker` (not before). The markdown file path is the input — render reads the file, it does not synthesize content from scratch.

## Inputs

```
render({
  md_path:        "<vault-relative path of the source note>",    // required
                                                                  // e.g. "pm/prd/2026-05-15-foo.md"
  title:          "<override the title>",                         // optional — defaults to the
                                                                  // frontmatter `title` of the md file
  subfolder:      "<sub-path under renders/>",                    // optional — default flat
  patterns:       ["mermaid", "tabs", "details", "timeline",     // optional — hints which patterns
                   "callouts", "swatches", "deck", ...],         // the renderer should reach for
  scripts:        ["copy-button", "theme-toggle", "tabs",        // optional — which inline JS
                   "toc-active", "deck-nav", "mermaid",          // snippets to include
                   "lucide"],
  toc:            "auto" | "sidebar" | "top" | "none",            // default: "auto" — picks by
                                                                  // h2 count (see below)
  cdn:            ["tailwind", "fonts", "lucide", "mermaid"],     // default: include only what's used
  meta:           { author, date, audience, ... },               // optional — surfaced in footer
  companion:      true | false                                    // default: false. When true, the
                                                                  // returned response notes both
                                                                  // paths (md is source, html is
                                                                  // presentation) for PR-review docs.
})
```

## What `render` produces

A single `.html` file under `renders/<subfolder>/<YYYY-MM-DD>-<slug>.html`. The file is self-contained except for CDN assets — Tailwind, Google Fonts, Lucide, Mermaid. If the network is unreachable, the file still reads (hand-tuned CSS is the foundation, raw text is the Mermaid fallback).

Returned to the caller:

```
{
  html_path: "<absolute path>",
  html_url:  "file:///<absolute path>",
  md_path:   "<vault-relative path of the source>",
  title:     "<title>"
}
```

The agent's user-facing reply is then:

> Open: `file:///…/file.html`
> Source: `vault/…/file.md` (markdown is the source of truth — edit it there and re-render)

Do not paste the rendered body inline.

## External assets — what's allowed

CDN access is enabled. These four sources are trusted; pull from them when they help. Everything else (analytics, trackers, third-party JS not in this list) is forbidden.

| Asset | When to use | Snippet |
|---|---|---|
| **Tailwind (Play CDN)** | One-off layout / spacing / color utilities that don't fit the component classes. Augment, don't replace. | `<script src="https://cdn.tailwindcss.com"></script>` |
| **Google Fonts** | Headline typography in design-focused docs (decks, palette proposals). Default docs stay on system fonts. | `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">` |
| **Lucide icons** | Action buttons, inline status icons, callouts. Matches the shadcn aesthetic. | `<script src="https://unpkg.com/lucide@latest"></script>` then `<i data-lucide="check"></i>` + `<script>lucide.createIcons();</script>` |
| **Mermaid** | Any diagram with a name (flowchart, sequence, state, class, ER, gantt, mindmap, timeline). **Prefer Mermaid over hand-written SVG** for these. | `<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>` |

The hand-tuned CSS in the template is the foundation — Tailwind is an escape hatch. Build with `.card` / `.callout` / `.badge` first; reach for `class="grid grid-cols-3 gap-4"` only when the component classes don't cover the case.

## What HTML unlocks (vs. raw markdown)

The reason to render is that markdown literally cannot represent these. If the render doesn't use at least 2–3, don't bother — the markdown is enough.

| Capability | What it replaces | Reach for it when |
|---|---|---|
| **Mermaid diagrams** (preferred) | ASCII art, "imagine a flowchart here" | Flowcharts, sequence/state/class/ER, gantt, mindmap, timeline — any named diagram type |
| **Inline SVG** | Mermaid when you need pixel-precise layout | Module maps with hot-path highlight, annotated illustrations, custom topology |
| **`<details>` collapsibles** | "Skip to X if you know Y" | Long-form with optional deep-dives, FAQs, appendix |
| **Tabs (CSS-only)** | Parallel walls of code | Multi-language samples, before/after, multiple environments |
| **Status pills / badges** | Plain "DONE", "WIP" | Roadmaps, status reports, dependency tables |
| **Color swatches** | Hex codes in a table | Design system docs, palette proposals |
| **Sparklines** (inline SVG) | Numeric tables nobody reads | Metrics reports, A/B summaries |
| **Vertical timeline** | Bulleted date list | Project history, decision logs, incident timelines |
| **Side-by-side grids** | Sequential sections | Before/after, comparison tables, multi-option proposals |
| **Callout boxes** (note/warn/danger) | Block quotes everyone glazes over | Security notes, "you probably want X instead" |
| **Copy-to-clipboard** | "Select the block manually" | Code snippets, commands, generated configs |
| **Theme toggle** | Hoping the user is in dark mode | Anything that might be read in a different light setting |
| **Sliders / configurators** | Static "try `--padding: 12px`" | Design playgrounds, what-if calculators |
| **Sidebar TOC with active-section highlight** | A flat `<nav>` at the top | Long docs with 7+ sections |
| **Decks** (arrow-key slides) | A bulleted list called "Slides" | Anything presented; a 5-section briefing is a deck |

## Navigation and layout — TOC rules

**Single most common failure mode:** a TOC sticky at the top of the viewport, overlaying the article content underneath. **This is forbidden.** TOC placement is determined by section count, period:

| h2 count | Mode | Notes |
|---|---|---|
| 0–3 | **None** | The doc is short enough to scroll. Don't add a TOC. |
| 4–6 | **Top TOC** | A small, **non-sticky** `<nav class="toc">` block right under the meta. Scrolls away with content. |
| 7+ | **Sidebar TOC** | `<body class="has-sidebar-toc">`, then `<nav class="toc sidebar">` as the first child of `<main>`, then `<article>` next to it. The sidebar lives in its own grid column — never overlaps the article. |

Every `<h2>` gets an `id` so anchor links resolve.

**The only sticky/fixed elements allowed in any render:**
1. The sidebar TOC (own grid column, never overlaps content).
2. The theme-toggle button (top-right, ≤ 40px wide).
3. The deck-mode slide-number indicator (bottom-right, single line).

Banned: any other use of `position: fixed` or `position: sticky`. No docked top bar, no floating header, no "back to top" pill, no sticky section sub-nav.

Narrow viewports (< 900px): the sidebar TOC collapses to a non-sticky block above the article (the template handles this). Do not re-introduce stickiness on mobile.

## Pattern picker by document type

The note's frontmatter (or folder) usually tells you the type. Match:

| Doc type | Reach for |
|---|---|
| **PRD / spec** | Sidebar TOC · status pills (P0/P1/P2) · `<details>` for FAQ · side-by-side "before/after" grids · Mermaid `sequenceDiagram` or `flowchart` |
| **Roadmap / quarterly plan** | Vertical timeline · status pills · `<details>` per epic · sparkline of progress per workstream |
| **ADR / design doc** | Side-by-side options grid · callout for the decision · `<details>` rejected alternatives · Mermaid `flowchart` |
| **Post-mortem / incident** | Timeline · color-coded severity callouts · `<details>` per contributing factor · annotated diff blocks |
| **Code review / explainer** | Tabbed code samples · annotated callouts beside lines · copy buttons · `<details>` for tangents |
| **Research / corpus-learning map** | Sidebar TOC · `<details>` per mental model · tabbed examples · timeline of intellectual history · callouts for "where experts disagree" |
| **Lesson plan / study guide** | Tabbed examples · `<details>` for deep-dives · sparkline of progress · sidebar nav · quiz blocks |
| **JLPT mock-exam result** | Score badges per section · sparkline of trend across attempts · side-by-side correct/incorrect · `<details>` per missed item |
| **Trader pattern-watch summary** | Timeline of trade events · status pills (win/loss) · sparkline equity curve · callouts for open questions |
| **Stakeholder / exec brief** | Status pills · 3-column "what changed / impact / next" grid · timeline of milestones · NO `<details>` (execs read top-to-bottom) |
| **Deck (any presented briefing ≥ 5 sections)** | Single-file deck pattern (one section per slide, arrow-key nav, page indicator) |
| **Design system note / palette** | Color swatches · type-scale grid · live spacing/radius slider · copy-CSS button |
| **Configurator / playground** | Sliders + live preview + Copy-CSS button |
| **Spike / fan-out** | N candidate approaches in a `grid-N` of `.card`s · trade-offs per card · callout for the recommendation |
| **Mockup sheet** | Each direction as a live-rendered `.card` · tokens visible · annotation strip below |
| **Annotated diff** | `<pre>` of the diff with `data-line` attrs · `.callout--warn/--danger` floated next to specific lines · severity badges |
| **Module map** | Mermaid `flowchart` for boxes-and-arrows · hand-SVG annotations only if pixel-precise · legend in corner |
| **Concept explainer** | TL;DR callout at top · `<abbr title="…">` glossary-on-hover · tabbed code samples · interactive demo |

If the type isn't above, scan the *capabilities* table and pick 2–3 that match the content.

## Steps

1. **Read the markdown.** Use the core `read` tool on `md_path` (resolved against the vault root). Parse out the frontmatter (title, tags, source_agent, etc.) and the body.
2. **Decide the pattern set.** Look at the note's type (folder or frontmatter `type:`). From the picker above, pick 2–3 patterns that fit. If none would meaningfully improve the read, **stop and tell the caller**: *"The markdown is fine as-is — no render needed."*
3. **Decide the TOC mode.** Count `##` headings in the body. 0–3 → none. 4–6 → top. 7+ → sidebar. Override only if the caller passed an explicit `toc`.
4. **Generate the body HTML** by converting the markdown to semantic HTML, then enriching with the chosen patterns:
   - Mermaid blocks for any diagram references (`flowchart`, `sequenceDiagram`, etc.) — write them as `<pre class="mermaid">…</pre>`.
   - `<details>` for sections marked "FAQ", "Appendix", "Alternatives considered", "Deep dive".
   - Status pills for inline markers like `[P0]`, `[shipped]`, `[blocked]`.
   - Timelines for date-prefixed bullet lists.
   - Tabs for parallel code blocks (multi-language, before/after).
   - Callouts for `> [!note]`, `> [!warning]`, `> [!danger]` blockquotes from the Obsidian source.
5. **Wrap in the template** below. Inline the CSS, then drop in only the CDN scripts that are used. Add only the inline JS snippets the chosen patterns require.
6. **Call `write_render`** with the assembled HTML, the original `title`, and the `md_path` (so the response records both paths together).
7. **Return** `{ html_path, html_url, md_path, title }` to the caller.
8. **The agent's user-facing reply** is then:
   > Open: `file:///…/file.html`
   > Source: `vault/…/file.md` (markdown is the source of truth — edit it there and re-render)

   Do not paste the rendered body inline.

## Self-contained HTML template

Use this as the scaffold — fill in `{{TITLE}}`, `{{BODY}}`, `{{HEAD_CDN}}`, `{{META_FOOTER}}`, `{{INLINE_SCRIPTS}}`. Only the four trusted CDN sources are allowed; everything else is inline. The file renders readably even if the CDN is blocked.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{{TITLE}}</title>

<!-- {{HEAD_CDN}} — drop in only what's used.
     Tailwind:   <script src="https://cdn.tailwindcss.com"></script>
     Fonts:      <link rel="preconnect" href="https://fonts.googleapis.com">
                 <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                 <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
     Lucide:     <script src="https://unpkg.com/lucide@latest"></script>     (init at body end)
     Mermaid:    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script> (init at body end)
-->

<style>
  :root {
    /* shadcn-flavored neutral palette */
    --bg: hsl(0 0% 100%);
    --fg: hsl(240 10% 4%);
    --muted: hsl(240 4% 46%);
    --muted-bg: hsl(240 5% 96%);
    --border: hsl(240 6% 90%);
    --accent: hsl(240 6% 10%);
    --accent-fg: hsl(0 0% 98%);
    --code-bg: hsl(240 5% 96%);

    --success: hsl(142 71% 38%);
    --success-bg: hsl(142 71% 92%);
    --warn:    hsl(38 92% 45%);
    --warn-bg: hsl(38 92% 92%);
    --error:   hsl(0 72% 50%);
    --error-bg:hsl(0 72% 94%);
    --info:    hsl(217 91% 50%);
    --info-bg: hsl(217 91% 94%);

    --radius: 8px;
    --radius-sm: 4px;
    --maxw: 760px;
    --maxw-wide: 1080px;
    --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
                 "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  :root[data-theme="dark"], :root.dark {
    --bg: hsl(240 10% 4%); --fg: hsl(0 0% 98%); --muted: hsl(240 5% 65%);
    --muted-bg: hsl(240 4% 12%); --border: hsl(240 4% 16%);
    --accent: hsl(0 0% 98%); --accent-fg: hsl(240 10% 4%);
    --code-bg: hsl(240 4% 12%);
    --success-bg: hsl(142 50% 16%); --warn-bg: hsl(38 60% 18%);
    --error-bg: hsl(0 50% 20%); --info-bg: hsl(217 50% 20%);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: hsl(240 10% 4%); --fg: hsl(0 0% 98%); --muted: hsl(240 5% 65%);
      --muted-bg: hsl(240 4% 12%); --border: hsl(240 4% 16%);
      --accent: hsl(0 0% 98%); --accent-fg: hsl(240 10% 4%);
      --code-bg: hsl(240 4% 12%);
      --success-bg: hsl(142 50% 16%); --warn-bg: hsl(38 60% 18%);
      --error-bg: hsl(0 50% 20%); --info-bg: hsl(217 50% 20%);
    }
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--fg); font-family: var(--font-sans);
         font-size: 16px; line-height: 1.65; -webkit-font-smoothing: antialiased; }

  main { max-width: var(--maxw); margin: 0 auto; padding: 64px 24px 96px; }
  main.wide { max-width: var(--maxw-wide); }

  h1, h2, h3, h4 { line-height: 1.25; letter-spacing: -0.01em; margin: 1.6em 0 0.5em; font-weight: 600; }
  h1 { font-size: 2rem; margin-top: 0; letter-spacing: -0.02em; }
  h2 { font-size: 1.4rem; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
  h3 { font-size: 1.1rem; }
  p, ul, ol, blockquote, table, pre { margin: 0.9em 0; }
  ul, ol { padding-left: 1.4em; }
  li + li { margin-top: 0.25em; }
  a { color: var(--accent); text-underline-offset: 2px; }
  blockquote { border-left: 3px solid var(--border); padding: 0.1em 0 0.1em 14px; color: var(--muted); }
  hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
  img, svg { max-width: 100%; }
  ::selection { background: var(--accent); color: var(--accent-fg); }

  code { background: var(--code-bg); padding: 1px 6px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 0.92em; }
  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; overflow-x: auto; position: relative; }
  pre code { background: transparent; padding: 0; font-size: 0.9em; }

  table { border-collapse: collapse; width: 100%; font-size: 0.95em; }
  th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: var(--muted-bg); font-weight: 600; }

  .meta { color: var(--muted); font-size: 0.875rem; margin-bottom: 2em; padding-bottom: 1em; border-bottom: 1px solid var(--border); }
  footer.doc-footer { margin-top: 4em; padding-top: 1.5em; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85rem; }

  /* TOC — top variant. NEVER position: sticky / fixed. Top TOC scrolls away with content. */
  .toc { background: var(--muted-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px; margin: 1.5em 0 2em; font-size: 0.95em; position: static; }
  .toc-title { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.5em; }
  .toc ul { margin: 0; padding-left: 1.2em; }

  /* TOC — sidebar variant. The ONLY allowed sticky navigation. Own grid column,
     never overlays the article. Switch on with <body class="has-sidebar-toc">. */
  body.has-sidebar-toc main { display: grid; grid-template-columns: 220px minmax(0, var(--maxw)); gap: 48px; max-width: calc(var(--maxw) + 268px); align-items: start; }
  body.has-sidebar-toc .toc.sidebar { position: sticky; top: 24px; align-self: start; background: transparent; border: none; padding: 0; max-height: calc(100vh - 48px); overflow-y: auto; }
  body.has-sidebar-toc .toc.sidebar ul { list-style: none; padding-left: 0; }
  body.has-sidebar-toc .toc.sidebar li { margin: 2px 0; }
  body.has-sidebar-toc .toc.sidebar a { display: block; padding: 4px 10px; border-radius: var(--radius-sm); color: var(--muted); text-decoration: none; font-size: 0.9rem; }
  body.has-sidebar-toc .toc.sidebar a:hover { background: var(--muted-bg); color: var(--fg); }
  body.has-sidebar-toc .toc.sidebar a.active { background: var(--accent); color: var(--accent-fg); }
  @media (max-width: 900px) {
    body.has-sidebar-toc main { grid-template-columns: 1fr; max-width: var(--maxw); }
    body.has-sidebar-toc .toc.sidebar { position: static; max-height: none; overflow: visible; margin-bottom: 1.5em; padding: 14px 18px; background: var(--muted-bg); border: 1px solid var(--border); border-radius: var(--radius); }
  }

  /* HARD RULE: only the sidebar TOC, theme toggle, and deck slide-number may be
     position: sticky / fixed. Anything else is the overlay anti-pattern. */

  /* badges */
  .badge { display: inline-block; padding: 2px 8px; font-size: 0.78em; font-weight: 600; border-radius: 999px; line-height: 1.4; border: 1px solid var(--border); background: var(--muted-bg); color: var(--fg); }
  .badge--ok    { background: var(--success-bg); color: var(--success); border-color: transparent; }
  .badge--warn  { background: var(--warn-bg);    color: var(--warn);    border-color: transparent; }
  .badge--error { background: var(--error-bg);   color: var(--error);   border-color: transparent; }
  .badge--info  { background: var(--info-bg);    color: var(--info);    border-color: transparent; }

  /* callouts */
  .callout { border-left: 3px solid var(--border); background: var(--muted-bg); padding: 12px 16px; border-radius: var(--radius-sm); margin: 1.2em 0; }
  .callout .callout-title { font-weight: 600; margin-bottom: 4px; font-size: 0.95em; }
  .callout--note  { border-color: var(--info);    background: var(--info-bg); }
  .callout--ok    { border-color: var(--success); background: var(--success-bg); }
  .callout--warn  { border-color: var(--warn);    background: var(--warn-bg); }
  .callout--danger{ border-color: var(--error);   background: var(--error-bg); }

  /* timeline */
  .timeline { list-style: none; padding-left: 0; border-left: 2px solid var(--border); margin-left: 8px; }
  .timeline li { position: relative; padding: 6px 0 14px 22px; }
  .timeline li::before { content: ""; position: absolute; left: -7px; top: 12px; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg); }
  .timeline .ts { display: block; font-size: 0.82em; color: var(--muted); font-family: var(--font-mono); }

  /* grids + cards */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 1em 0; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 1em 0; }
  @media (max-width: 720px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
  .card { border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; background: var(--bg); }

  /* tabs — CSS only */
  .tabs { display: flex; flex-wrap: wrap; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin: 1em 0; background: var(--bg); }
  .tabs > input[type=radio] { display: none; }
  .tabs > label { padding: 8px 14px; cursor: pointer; font-size: 0.9em; color: var(--muted); border-bottom: 2px solid transparent; }
  .tabs > .tab-panel { display: none; width: 100%; padding: 14px 16px; order: 99; border-top: 1px solid var(--border); }
  .tabs > input[type=radio]:checked + label { color: var(--fg); border-bottom-color: var(--accent); }
  .tabs > input#tab-1:checked ~ .tab-panel[data-for="tab-1"],
  .tabs > input#tab-2:checked ~ .tab-panel[data-for="tab-2"],
  .tabs > input#tab-3:checked ~ .tab-panel[data-for="tab-3"],
  .tabs > input#tab-4:checked ~ .tab-panel[data-for="tab-4"] { display: block; }

  /* details */
  details { border: 1px solid var(--border); border-radius: var(--radius); padding: 0 16px; margin: 1em 0; background: var(--bg); }
  details > summary { cursor: pointer; padding: 12px 0; font-weight: 600; list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: "▸"; display: inline-block; margin-right: 8px; transition: transform 0.15s; color: var(--muted); }
  details[open] > summary::before { transform: rotate(90deg); }

  /* diagrams + sparkline */
  .diagram { border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; background: var(--bg); margin: 1.2em 0; overflow-x: auto; }
  .diagram svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
  .sparkline { vertical-align: middle; }

  /* buttons */
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font: inherit; font-size: 0.85em; font-weight: 500; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; }
  .btn:hover { background: var(--muted-bg); }
  .btn--primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .btn--ok { background: var(--success); color: white; border-color: var(--success); }
  .copy-btn { position: absolute; top: 8px; right: 8px; opacity: 0; transition: opacity 0.15s; }
  pre:hover .copy-btn { opacity: 1; }

  /* swatches */
  .swatch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin: 1em 0; }
  .swatch { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .swatch-chip { height: 64px; }
  .swatch-meta { padding: 8px 10px; font-size: 0.85em; }
  .swatch-name { font-weight: 600; }
  .swatch-value { color: var(--muted); font-family: var(--font-mono); font-size: 0.85em; }

  /* theme toggle */
  .theme-toggle { position: fixed; top: 16px; right: 16px; z-index: 10; }

  /* deck mode */
  body.deck main { max-width: 100%; padding: 0; }
  body.deck .slide { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 8vh 10vw; scroll-snap-align: start; }
  body.deck { scroll-snap-type: y mandatory; overflow-y: scroll; }
  body.deck .slide h2 { border: none; padding: 0; font-size: 2.4rem; }
  body.deck .slide h1 { font-size: 3rem; }
  body.deck .slide-num { position: fixed; bottom: 16px; right: 16px; color: var(--muted); font-size: 0.85em; font-family: var(--font-mono); }
</style>
</head>
<body>
<main>
{{BODY}}
{{META_FOOTER}}
</main>
{{INLINE_SCRIPTS}}
</body>
</html>
```

## Inline JS — security guardrails

CDN scripts are allowed (the four trusted sources). Inline `<script>` is allowed. But the file *is* code the moment it's opened. Any JS — inline or CDN — MUST follow all of:

1. **No third-party script sources beyond the trusted four.** Tailwind, Google Fonts, Lucide, Mermaid — that's the allowlist. No analytics, no Sentry, no GA, no Hotjar.
2. **No data exfiltration.** Inline JS may not `fetch()` or `XMLHttpRequest` anywhere.
3. **No dynamic code.** No `eval()`, no `new Function()`, no `setTimeout("string", …)`.
4. **No `innerHTML` from user-controlled data.** Use `textContent` / `createElement`. Only literal author-written strings may go into `innerHTML`.
5. **No inline event-handler attributes.** Never `onclick="…"`. Always `addEventListener`.
6. **No persistent state beyond obvious prefs.** `localStorage` is allowed for theme / last-selected-tab only.
7. **Stay narrow in scope.** Allowed: copy buttons, tab switching, theme toggle, anchor-active TOC, slider→preview configurators, deck-key nav, Mermaid/Lucide initializers. Out of scope: telemetry, content fetching, prefetch, ad/affiliate logic.
8. **Graceful degradation.** If the CDN is unreachable, the doc still reads. Mermaid not loaded → raw text fallback. Lucide not loaded → empty icon slots, layout intact. JS off → tabs collapse to stacked sections, copy buttons absent, theme falls back to `prefers-color-scheme`.

## Inline JS snippets (drop in only if used)

### `copy-button`

```html
<script>
  document.querySelectorAll('pre').forEach(pre => {
    const btn = document.createElement('button');
    btn.className = 'btn copy-btn'; btn.type = 'button'; btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code')?.innerText ?? pre.innerText);
        const old = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('btn--ok');
        setTimeout(() => { btn.textContent = old; btn.classList.remove('btn--ok'); }, 1200);
      } catch {}
    });
    pre.appendChild(btn);
  });
</script>
```

### `theme-toggle`

```html
<button class="btn theme-toggle" type="button" id="theme-toggle" aria-label="Toggle theme">🌓</button>
<script>
  (function () {
    const root = document.documentElement;
    const saved = localStorage.getItem('theme');
    if (saved) root.setAttribute('data-theme', saved);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const isDark = root.getAttribute('data-theme') === 'dark'
        || (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      const next = isDark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  })();
</script>
```

### `mermaid`

```html
<div class="diagram">
  <pre class="mermaid">
flowchart LR
    A[Start] --> B{Decision}
    B -- yes --> C[Path A]
    B -- no  --> D[Path B]
    C --> E[Done]
    D --> E
  </pre>
</div>

<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<script>
  (function () {
    if (!window.mermaid) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    mermaid.initialize({ startOnLoad: true, theme: isDark ? 'dark' : 'default', securityLevel: 'strict' });
  })();
</script>
```

Prefer Mermaid over hand-SVG when the diagram type has a name Mermaid supports: `flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`, `gantt`, `mindmap`, `timeline`, `journey`, `pie`, `gitGraph`. Use hand-SVG only for pixel-precise / custom layouts.

### `lucide`

```html
<button class="btn"><i data-lucide="copy"></i> Copy</button>
<div class="callout callout--warn"><div class="callout-title"><i data-lucide="triangle-alert"></i> Heads up</div>…</div>

<script src="https://unpkg.com/lucide@latest"></script>
<script>window.lucide && lucide.createIcons();</script>
```

### `toc-active` (sidebar mode only)

```html
<script>
  (function () {
    const links = document.querySelectorAll('.toc.sidebar a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const map = new Map();
    links.forEach(a => { const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) map.set(t, a); });
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const a = map.get(e.target); if (!a) return;
        if (e.isIntersecting) { links.forEach(l => l.classList.remove('active')); a.classList.add('active'); }
      });
    }, { rootMargin: '-30% 0px -65% 0px' });
    map.forEach((_, target) => obs.observe(target));
  })();
</script>
```

### `deck-nav`

```html
<script>
  (function () {
    if (!document.body.classList.contains('deck')) return;
    const slides = [...document.querySelectorAll('.slide')]; if (!slides.length) return;
    const numEl = document.querySelector('.slide-num');
    function update() {
      const idx = slides.findIndex(s => s.getBoundingClientRect().top >= -window.innerHeight / 2);
      if (numEl) numEl.textContent = `${Math.max(idx, 0) + 1} / ${slides.length}`;
    }
    document.addEventListener('keydown', e => {
      const cur = slides.findIndex(s => s.getBoundingClientRect().top >= -window.innerHeight / 2);
      let next = cur;
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) next = Math.min(cur + 1, slides.length - 1);
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) next = Math.max(cur - 1, 0);
      else return;
      e.preventDefault(); slides[next].scrollIntoView({ behavior: 'smooth' });
    });
    addEventListener('scroll', update, { passive: true }); update();
  })();
</script>
```

## Footer

Append a `<footer class="doc-footer">` with:

- Source markdown path (so the user knows where to edit)
- Generating agent (`source_agent` from frontmatter)
- Render timestamp (ISO date)

Example:

```html
<footer class="doc-footer">
  Rendered from <code>vault/pm/prd/2026-05-15-foo.md</code> · 2026-05-15 · generated by <strong>pm</strong>
</footer>
```

## Don't

- **Don't write HTML to the vault.** Always use `write_render`, which targets `renders/` outside the vault. HTML in the vault breaks Obsidian's graph.
- **Don't auto-render.** Personas (or the user) explicitly trigger render. There is no global "save and render" hook.
- **Don't synthesize content.** Render reads the markdown source. If you find yourself inventing sections that weren't in the md, stop — edit the markdown via `note-taker` first, then re-render.
- **Don't produce styled markdown.** If the output is just "h1 + paragraphs + tables + code blocks" with no diagrams, callouts, badges, collapsibles, or grids — you built the wrong artifact. Pick 2–3 patterns from the picker or tell the caller the markdown is sufficient.
- **Don't pull from CDNs outside the trusted four.** Tailwind, Google Fonts, Lucide, Mermaid. Anything else is forbidden.
- **Don't depend on the network for content.** CDNs render the page; they don't fetch the page's data. If the file is unreadable when offline, you've put content behind a network request — fix it.
- **Don't dock a TOC to the viewport.** No `position: sticky` / `position: fixed` on a top TOC. No floating "Contents" pill. No "back to top" button hovering over text. See "Navigation and layout — TOC rules" above. The only sticky/fixed elements in any render are the sidebar TOC, the theme toggle, and the deck slide-number indicator.
- **Don't omit the dark-mode block.**
- **Don't add custom colors** beyond the CSS vars unless the doc is *about* color.
- **Don't use ASCII diagrams.** Write Mermaid for named types; hand-SVG for the rest. Never ASCII.
- **Don't ship the "default-AI aesthetic."** No gradients, no glass morphism, no neon glow, no emoji headers, no purple-to-pink branding. Stick to the token palette.
- **Don't violate the inline-JS guardrails.** No `fetch`, no `eval`, no inline `onclick=`, no `innerHTML` of user data, no telemetry.
- **Don't paste the rendered body inline** in the chat reply. The URL is the deliverable.
- **Don't include the markdown source as a comment or code block** in the HTML — the md path goes in the footer, the file lives in the vault.
