---
description: Default skill for ANY long-form artifact — PRDs, reports, lessons, summaries, exam results, research write-ups, exec briefs, post-mortems, decks. Produces a single HTML file with hand-tuned shadcn-style CSS, opt-in CDN assets (Tailwind, Google Fonts, Lucide icons, Mermaid diagrams), and inline vanilla JS for interactivity — collapsibles, tabs, copy buttons, sliders, theme toggle. Returns a `file://` URL. Use this BEFORE reaching for markdown unless the user has explicitly asked for another format. Companion mode (`companion=true`) writes a `.md` alongside the `.html` for repo-resident artifacts that go through PR review. Prefers Mermaid for named diagram types (flowchart / sequence / state / class / ER / gantt / mindmap / timeline) — hand-SVG only for custom layouts. The skill produces visual, interactive HTML — not styled markdown.
---

# Document

The default output convention for any non-trivial artifact in this system.

> If you would otherwise produce a multi-section markdown document and hand it back inline, **stop** — produce a self-contained, interactive HTML file through this skill and hand back a URL instead.

The premise (from Thariq Shihipar's *"Using Claude Code: The Unreasonable Effectiveness of HTML"*): markdown became the default agent output during the small-context era, when every token mattered. With large context windows, the right output format is the one most *useful* to read — and that is almost always rich HTML, not markdown.

A document produced through this skill is **visual + interactive**, not "markdown with CSS". If the result looks like a styled README, the skill was used wrong.

## Default — always

- Output format: **single `.html` file**. The page is opened in a browser with a working network connection — CDN assets are allowed. Inline what you wrote (your own CSS, your own JS); pull from CDN what you didn't (Tailwind, Google Fonts, Lucide icons, Mermaid).
- Storage: written into the vault under `docs/<YYYY-MM-DD>-<slug>.html` via the existing `write_note` tool.
- Reply to the user: a single `file://` URL pointing to the saved file, plus a one-sentence summary. Nothing else inline.

The mantra: **one HTML file, trusted CDNs only, no telemetry, render rich.**

## External assets — what's allowed

CDN access is enabled. These four sources are trusted; pull from them when they help. Everything else (analytics, trackers, third-party JS not in this list) stays forbidden.

| Asset | When to use | Snippet |
|---|---|---|
| **Tailwind (Play CDN)** | One-off layout / spacing / color utilities that don't fit our component classes. Don't replace the component classes — augment. | `<script src="https://cdn.tailwindcss.com"></script>` |
| **Google Fonts** | Headline typography in design-focused docs (decks, palette proposals, brand work). Default docs stay on system fonts. | `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">` |
| **Lucide icons** | Action buttons, inline status icons, callouts. Matches the shadcn aesthetic our CSS already mirrors. | `<script src="https://unpkg.com/lucide@latest"></script>` then `<i data-lucide="check"></i>` + `<script>lucide.createIcons();</script>` |
| **Mermaid** | Any diagram with a name (flowchart, sequence, state, class, ER, gantt, mindmap, timeline). **Prefer Mermaid over hand-written SVG** for these — the syntax is shorter and the layout is automatic. | See "Mermaid diagrams" below |

The hand-tuned CSS in the template is still the foundation — Tailwind is an escape hatch, not a replacement. Build with `.card` / `.callout` / `.badge` first; reach for `class="grid grid-cols-3 gap-4"` only when the component classes don't cover the case.

## The Companion Pattern — markdown AND HTML for significant artifacts

For any artifact that **lives in the repo and gets reviewed in PRs** (PRDs, ADRs, design docs, RFCs, post-mortems, roadmaps), produce *both* outputs side by side:

- `feature.md` — the **source of truth**. Versioned, git-diffable, anyone can edit it from any editor. This is what reviewers comment on.
- `feature.html` — the **visual execution** of the same content. What the team reads when they want to *understand*, not when they want to *review changes*.

This dissolves the article's debate. Markdown owns version control and agent-to-agent flow; HTML owns the reading experience. **For repo-resident artifacts, ship both.** The `companion: true` input below produces both files; the markdown is the source the HTML was generated from, so they stay in lockstep.

When NOT to use companion mode: ephemeral artifacts (a one-off briefing, a personal study guide, a presentation deck, a research write-up that lives in the vault not the repo). HTML alone is fine there — there's no PR review step.

## What HTML unlocks (beyond styled markdown)

The reason to choose HTML is that markdown literally cannot represent these. If you're not using at least 2–3 of these per document, you are producing styled markdown and missing the point.

| Capability | What it replaces | When to reach for it |
|---|---|---|
| **Mermaid diagrams** (preferred for named types) | ASCII art, "imagine a flowchart here", hand-written SVG for flow/sequence/state | Flowcharts, sequence diagrams, state machines, ER diagrams, gantt, mindmap, timeline. Mermaid renders these from short text definitions — far less code than equivalent SVG. **Reach for this first.** |
| **Inline SVG diagrams** | Mermaid for custom-layout cases | Architecture diagrams with specific spatial constraints, annotated illustrations, module maps with hot-path highlight, anything where you need pixel-precise control or a Mermaid type doesn't fit |
| **`<details>` collapsibles** | "Skip to section X if you already know Y" | Long-form with optional deep-dives; FAQs; appendix content; nested debugging traces |
| **Tabs (CSS-only)** | Parallel walls of code or copy | Side-by-side language samples (TS / Python / cURL); before/after; multiple environments |
| **Status pills / badges** | Plain text "DONE", "WIP" | Roadmaps, status reports, dependency tables, release notes |
| **Color swatches** | Hex codes in a table | Design system docs, palette proposals, branding artifacts |
| **Sparklines / inline bar charts (SVG)** | Numeric tables nobody reads | Metrics reports, A/B summaries, before/after comparisons |
| **Vertical timeline** | Bulleted date list | Project history, decision logs, weekly retros, case studies |
| **Side-by-side grids** | Sequential sections forcing scroll | Before/after, comparison tables, multi-option proposals |
| **Callout boxes** (note / warn / danger) | Block quotes everyone glazes over | Important caveats, security notes, "you probably want X instead" |
| **Copy-to-clipboard buttons** | "Select the block manually" | Code snippets, commands, generated configs |
| **Theme toggle** | Hoping the user has dark mode | Any doc the user might read in a different light setting |
| **Sliders / live configurators** | Static "try `--padding: 12px`" | Design configurators, query playgrounds, what-if calculators |
| **Anchor-linked sidebar TOC with active-section highlight** | A boring `<nav>` at the top | Long docs where users land on a section and want to navigate |
| **Decks** (arrow-key slides) | A bulleted list called "Slides" | Anything presented; a 5-section briefing is a deck |

## Pattern picker by document type

This skill produces many kinds of artifacts. The richer-HTML pattern that fits each:

| Document type | Reach for |
|---|---|
| **PRD / spec** | Sidebar TOC · status pills (P0/P1/P2) · `<details>` for FAQ/appendix · side-by-side "before/after" grids · Mermaid `sequenceDiagram` or `flowchart` for the user-flow |
| **Roadmap / quarterly plan** | Vertical timeline · status pills · `<details>` per epic · sparkline of progress per workstream |
| **ADR / design doc** | Side-by-side options grid · callout for the decision · `<details>` rejected alternatives · Mermaid `flowchart` or `C4Context`-style diagram for the architecture |
| **Post-mortem** | Timeline · color-coded severity callouts · `<details>` per contributing factor · annotated diff blocks |
| **Code review / explainer** | Tabbed code samples (multi-language or before/after) · annotated callouts beside lines · copy buttons · `<details>` for tangents |
| **Research / corpus-learning map** | Sidebar TOC · `<details>` per mental model · tabbed code/example samples · timeline of intellectual history · callouts for "where experts disagree" |
| **Lesson plan / study guide** | Tabbed examples · `<details>` for "deeper dive" · sparkline of progress · sidebar nav · interactive quiz blocks |
| **JLPT mock-exam result** | Score badges per section · sparkline of trend across attempts · side-by-side correct/incorrect · `<details>` per missed item |
| **Trader pattern-watch summary** | Timeline of trade events · status pills (win/loss/scratch) · sparkline of equity curve · callouts for open questions |
| **Stakeholder / exec brief** | Status pills · 3-column "what changed / impact / next" grid · timeline of milestones · NO `<details>` (execs read top-to-bottom) |
| **Deck (any presented briefing ≥ 5 sections)** | Single-file slide deck pattern (one section per slide, arrow-key nav, page indicator) |
| **Design system note / palette proposal** | Color swatches · type-scale grid · live spacing/radius slider configurator · copy-CSS button |
| **Configurator / playground** | Sliders + live preview + Copy-CSS button (real interactive HTML; React-style without the framework) |
| **Spike / exploration ("fan-out")** | N candidate approaches in a `grid-N` of `.card`s · trade-offs row per card · callout for the recommendation · *no* hidden details — the reader is comparing |
| **Mockup sheet** (visual design directions) | Each direction as a live-rendered `.card` (real HTML, not screenshots) · tokens visible per direction · annotation strip below each |
| **Annotated diff / code review** | `<pre>` of the diff with `data-line` attributes · `.callout--warn`/`--danger` floated next to specific lines · severity badges in the right margin · jump links to each annotation |
| **PR writeup for reviewers** | Sidebar TOC of changed files · per-file "why this changed" + "what to focus on" cards · linked anchors back into the diff |
| **Module map** (code structure) | Mermaid `flowchart` (auto layout) for the boxes-and-arrows · hand-SVG annotations layered on top *only* if you need pixel-precise hot-path highlight · legend in the corner |
| **Component contact sheet** | Single page, `grid-3`+, showing every variant of a component (size × state × intent) · token labels under each |
| **Clickable flow** (mini-prototype) | 3–5 "screens" each in its own anchored section · `<a href="#screen-2">` for forward nav · back button per screen · feels like a wireframe rather than a doc |
| **Annotated flowchart** | Mermaid `flowchart` with each node `click`-linked to its anchor · `<details>` per step lists timing, failure modes, retry rules below the diagram |
| **Concept explainer (research)** | TL;DR callout at top · `<abbr title="…">` glossary-on-hover for jargon · tabbed code samples · interactive demo (slider / canvas) showing the concept moving |
| **Incident timeline / post-mortem** | Minute-by-minute `.timeline` · log excerpts in `<pre>` per entry · status pills (detection / mitigation / resolution) · `.callout--danger` for root cause |
| **Editor UI that exports markdown** | Form / board / toggle grid built with HTML inputs · "Export" button serializes state to markdown · `<textarea>` shows the output the user can copy. Pattern: HTML *in*, markdown *out* — let the user edit visually, save text |

If your doc type isn't above, look at the *capabilities* table and pick 2–3 that match the content.

## When to deviate

Use a different format **only** when the user explicitly asks, OR when one of the cases under "When markdown IS still right" applies.

| User says | Use |
|---|---|
| "as markdown", "in markdown" | `.md` via `note-taker` |
| "PDF" | HTML now, mention they can print → save as PDF |
| "send it to slack/email/etc." | Route through `scribe` for the audience, output inline |
| Short capture / journal entry / one-liner | `note-taker` markdown (this skill is for long-form) |

## When markdown IS still right

The article calls these out. Honor them — HTML isn't universally better.

- **Agent-to-agent communication.** When the output feeds back into another Pi session, subagent, or hand-off — markdown is leaner, easier to parse, and survives in-context inclusion without a rendering step.
- **Version control.** If the artifact lives in this repo and is reviewed in PRs (SYSTEM.md, AGENTS.md, SKILL.md files themselves), HTML diffs are noisy and harder to review. Markdown stays in git. *Exception:* if the same content also needs the visual treatment, use **companion mode** so both files exist and stay in lockstep.
- **Terminal output.** When the agent is streaming an answer the user reads in the TUI, HTML is unreadable; markdown / plain text renders fine.
- **Quick answers.** A 50-word reply doesn't deserve a styled page. If you'd say it in two paragraphs, say it.
- **Source-readable contexts.** Markdown survives being pasted into Slack, GitHub, Notion, email, terminals — anywhere. HTML needs a renderer. If the user is going to forward the artifact through any of those channels, ship markdown too (companion mode covers this).

Reach for HTML when the artifact is meant to be *read by a human in a browser*. Stay in markdown when it's meant to be *read by an agent, by the git diff viewer, or pasted into Slack*.

## Inputs

```
document.publish({
  title: "<short noun phrase>",
  body_html: "<inner HTML — no <html>/<head>/<body>; just the article contents>",
  body_md: "<markdown source — required when companion: true>",
  source_agent: "<agent name>",        // optional
  folder: "docs" | <free path>,        // default: "docs"
  toc: "sidebar" | "top" | "none",     // default: "none" for 0–3 h2 · "top" for 4–6 h2 · "sidebar" for 7+ h2.
                                       // "top" is non-sticky and scrolls away. "sidebar" lives in its own grid
                                       // column and never overlays the article. NEVER make the top TOC sticky.
  companion: true | false,             // default: false. When true, also write <slug>.md alongside <slug>.html.
                                       // Use for repo-resident artifacts that will be PR-reviewed (PRDs, ADRs,
                                       // RFCs, design docs, post-mortems, roadmaps). The HTML link in the chat
                                       // reply remains the deliverable; the md is for git review.
  meta: { author, date, tags, ... },   // optional — surfaced in the footer
  scripts: ["copy-button", "tabs", "theme-toggle", "<other>"]
                                       // optional — drops in the matching inline JS snippet
})
```

## Steps

1. **Decide the pattern set.** Look at the doc type. From the picker above, pick the 2–3 patterns that fit. Don't use every pattern in every doc.
2. **Slug the title** (`lowercase-hyphenated`).
3. **Resolve target path**: `<folder>/<YYYY-MM-DD>-<slug>.html`.
4. **Build the inner HTML** following the style rules below. Use the component classes from the template (`badge`, `swatch`, `callout`, `timeline`, `grid-2`, etc.) — don't reinvent them inline.
5. **Wrap in the template.** Inline any required JS snippets at the bottom.
6. **Call `write_note`** with the assembled HTML and the `.html` path. Pass `format: "html"`.
7. **Companion mode (if `companion: true`):** also call `write_note` with `body_md` and the `.md` path (same slug, same folder). The markdown should be the source the HTML was generated from — same prose, same structure — so that a future agent can read either and round-trip safely. **The HTML is still the user-facing deliverable**; the markdown is for git review and agent-to-agent flow.
8. **Return to the caller:**
   ```
   {
     html_path: "<vault-relative path>.html",
     html_url:  "file:///<absolute path>.html",
     md_path:   "<vault-relative path>.md",   // only when companion: true
     title: "<title>"
   }
   ```
9. **The agent's user-facing reply** is then:
   > Saved as **{title}**. Open: `file:///…/file.html`
   > (markdown source: `…/file.md`) — only when companion mode is on.

   Do not paste the document body inline. Do not include a markdown copy "for convenience" outside of companion mode. The URL is the deliverable.

## Self-contained HTML template

Use this as the scaffold — fill in `{{TITLE}}`, `{{BODY}}`, and (optionally) `{{HEAD_CDN}}`, `{{META_FOOTER}}`, `{{INLINE_SCRIPTS}}`. Only the four trusted CDN sources are allowed; everything else stays inline. The file should still render readably if the CDN is blocked (the hand-tuned CSS below is the foundation, not Tailwind).

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

    /* semantic tokens */
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
    --bg: hsl(240 10% 4%);
    --fg: hsl(0 0% 98%);
    --muted: hsl(240 5% 65%);
    --muted-bg: hsl(240 4% 12%);
    --border: hsl(240 4% 16%);
    --accent: hsl(0 0% 98%);
    --accent-fg: hsl(240 10% 4%);
    --code-bg: hsl(240 4% 12%);
    --success-bg: hsl(142 50% 16%);
    --warn-bg:    hsl(38 60% 18%);
    --error-bg:   hsl(0 50% 20%);
    --info-bg:    hsl(217 50% 20%);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: hsl(240 10% 4%);
      --fg: hsl(0 0% 98%);
      --muted: hsl(240 5% 65%);
      --muted-bg: hsl(240 4% 12%);
      --border: hsl(240 4% 16%);
      --accent: hsl(0 0% 98%);
      --accent-fg: hsl(240 10% 4%);
      --code-bg: hsl(240 4% 12%);
      --success-bg: hsl(142 50% 16%);
      --warn-bg:    hsl(38 60% 18%);
      --error-bg:   hsl(0 50% 20%);
      --info-bg:    hsl(217 50% 20%);
    }
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }

  /* layout — default reading width, with a .wide escape hatch */
  main { max-width: var(--maxw); margin: 0 auto; padding: 64px 24px 96px; }
  main.wide { max-width: var(--maxw-wide); }
  .wide-block { max-width: var(--maxw-wide); margin-left: calc((var(--maxw) - var(--maxw-wide)) / 2); }

  /* typography */
  h1, h2, h3, h4 { line-height: 1.25; letter-spacing: -0.01em; margin: 1.6em 0 0.5em; font-weight: 600; }
  h1 { font-size: 2rem; margin-top: 0; letter-spacing: -0.02em; }
  h2 { font-size: 1.4rem; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
  h3 { font-size: 1.1rem; }
  p, ul, ol, blockquote, table, pre { margin: 0.9em 0; }
  ul, ol { padding-left: 1.4em; }
  li + li { margin-top: 0.25em; }
  a { color: var(--accent); text-underline-offset: 2px; }
  blockquote { border-left: 3px solid var(--border); padding: 0.1em 0 0.1em 14px; color: var(--muted); font-style: normal; }
  hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
  img, svg { max-width: 100%; }
  ::selection { background: var(--accent); color: var(--accent-fg); }

  /* code */
  code { background: var(--code-bg); padding: 1px 6px; border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 0.92em; }
  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; overflow-x: auto; position: relative; }
  pre code { background: transparent; padding: 0; font-size: 0.9em; }
  kbd { background: var(--muted-bg); border: 1px solid var(--border); border-bottom-width: 2px; border-radius: var(--radius-sm); padding: 1px 6px; font: 0.85em var(--font-mono); }

  /* tables */
  table { border-collapse: collapse; width: 100%; font-size: 0.95em; }
  th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: var(--muted-bg); font-weight: 600; }

  /* meta + footer */
  .meta { color: var(--muted); font-size: 0.875rem; margin-bottom: 2em; padding-bottom: 1em; border-bottom: 1px solid var(--border); }
  .meta-row + .meta-row { margin-top: 0.25em; }
  footer.doc-footer { margin-top: 4em; padding-top: 1.5em; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85rem; }

  /* TOC — top variant. NEVER position: sticky / fixed. Top TOC scrolls away with content. */
  .toc { background: var(--muted-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px; margin: 1.5em 0 2em; font-size: 0.95em; position: static; }
  .toc-title { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.5em; }
  .toc ul { margin: 0; padding-left: 1.2em; }

  /* TOC — sidebar variant. The ONLY allowed sticky navigation. Lives in its own grid column,
     never overlays the article. Switch on with <body class="has-sidebar-toc"> */
  body.has-sidebar-toc main { display: grid; grid-template-columns: 220px minmax(0, var(--maxw)); gap: 48px; max-width: calc(var(--maxw) + 268px); align-items: start; }
  body.has-sidebar-toc .toc.sidebar { position: sticky; top: 24px; align-self: start; background: transparent; border: none; padding: 0; max-height: calc(100vh - 48px); overflow-y: auto; }
  body.has-sidebar-toc .toc.sidebar ul { list-style: none; padding-left: 0; }
  body.has-sidebar-toc .toc.sidebar li { margin: 2px 0; }
  body.has-sidebar-toc .toc.sidebar a { display: block; padding: 4px 10px; border-radius: var(--radius-sm); color: var(--muted); text-decoration: none; font-size: 0.9rem; }
  body.has-sidebar-toc .toc.sidebar a:hover { background: var(--muted-bg); color: var(--fg); }
  body.has-sidebar-toc .toc.sidebar a.active { background: var(--accent); color: var(--accent-fg); }
  /* Narrow viewport: sidebar collapses to a non-sticky top block. Never let it remain sticky
     when stacked over content — that's the overlay anti-pattern. */
  @media (max-width: 900px) {
    body.has-sidebar-toc main { grid-template-columns: 1fr; max-width: var(--maxw); }
    body.has-sidebar-toc .toc.sidebar { position: static; max-height: none; overflow: visible; margin-bottom: 1.5em; padding: 14px 18px; background: var(--muted-bg); border: 1px solid var(--border); border-radius: var(--radius); }
  }

  /* Hard rule: nothing in a document is allowed to be position: fixed / sticky except
     (a) the sidebar TOC (above), (b) the theme toggle button (top-right, small),
     (c) the deck slide-number indicator. No floating top bars, no docked headers,
     no "back to top" pills that hover over content. If you find yourself writing
     `position: fixed` or `position: sticky` on anything else, stop. */

  /* badges / pills */
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

  /* color swatches */
  .swatch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin: 1em 0; }
  .swatch { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .swatch-chip { height: 64px; }
  .swatch-meta { padding: 8px 10px; font-size: 0.85em; }
  .swatch-name { font-weight: 600; }
  .swatch-value { color: var(--muted); font-family: var(--font-mono); font-size: 0.85em; }

  /* timeline */
  .timeline { list-style: none; padding-left: 0; border-left: 2px solid var(--border); margin-left: 8px; }
  .timeline li { position: relative; padding: 6px 0 14px 22px; }
  .timeline li::before { content: ""; position: absolute; left: -7px; top: 12px; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg); }
  .timeline .ts { display: block; font-size: 0.82em; color: var(--muted); font-family: var(--font-mono); }

  /* side-by-side grids */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 1em 0; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 1em 0; }
  @media (max-width: 720px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
  .card { border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; background: var(--bg); }

  /* tabs — CSS only, no JS. Markup: <div class="tabs"><input id=t1 ...><label for=t1>...</label>...<div class="tab-panel" data-for=t1>...</div></div> */
  .tabs { display: flex; flex-wrap: wrap; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin: 1em 0; background: var(--bg); }
  .tabs > input[type=radio] { display: none; }
  .tabs > label { padding: 8px 14px; cursor: pointer; font-size: 0.9em; color: var(--muted); border-bottom: 2px solid transparent; }
  .tabs > .tab-panel { display: none; width: 100%; padding: 14px 16px; order: 99; border-top: 1px solid var(--border); }
  .tabs > input[type=radio]:checked + label { color: var(--fg); border-bottom-color: var(--accent); }
  /* a tab-panel becomes visible when the matching radio is :checked — use sibling combinator on input id ↔ panel data-for */
  .tabs > input#tab-1:checked ~ .tab-panel[data-for="tab-1"],
  .tabs > input#tab-2:checked ~ .tab-panel[data-for="tab-2"],
  .tabs > input#tab-3:checked ~ .tab-panel[data-for="tab-3"],
  .tabs > input#tab-4:checked ~ .tab-panel[data-for="tab-4"] { display: block; }

  /* details / collapsibles */
  details { border: 1px solid var(--border); border-radius: var(--radius); padding: 0 16px; margin: 1em 0; background: var(--bg); }
  details > summary { cursor: pointer; padding: 12px 0; font-weight: 600; list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { content: "▸"; display: inline-block; margin-right: 8px; transition: transform 0.15s; color: var(--muted); }
  details[open] > summary::before { transform: rotate(90deg); }
  details > *:not(summary) { padding-bottom: 12px; }

  /* SVG diagrams (set as the container — svg inside fills) */
  .diagram { border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; background: var(--bg); margin: 1.2em 0; overflow-x: auto; }
  .diagram svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }

  /* sparkline (inline SVG bar/line chart) — give the SVG class="sparkline" and width/height */
  .sparkline { vertical-align: middle; }

  /* buttons (copy, toggle, etc.) */
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font: inherit; font-size: 0.85em; font-weight: 500; background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; }
  .btn:hover { background: var(--muted-bg); }
  .btn--primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .btn--ok { background: var(--success); color: white; border-color: var(--success); }
  .copy-btn { position: absolute; top: 8px; right: 8px; opacity: 0; transition: opacity 0.15s; }
  pre:hover .copy-btn { opacity: 1; }

  /* theme toggle */
  .theme-toggle { position: fixed; top: 16px; right: 16px; z-index: 10; }

  /* deck mode — opt in via <body class="deck">. arrow keys / page-up/down between sections */
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

CDN scripts are allowed (the four trusted sources above). Inline `<script>` is allowed. But the file *is* code the moment it's opened. The Kurtis Redux critique ("reading text has now become running code") still applies. Any JS — inline or CDN — in a document this skill produces MUST follow all of:

1. **No third-party script sources beyond the trusted four.** Tailwind Play CDN, Google Fonts, Lucide, Mermaid — that's the allowlist. No analytics, no Sentry, no GA, no Hotjar, no random GitHub gists. Add a source only if it's been audited and added to the "External assets" table above.
2. **No data exfiltration.** Inline JS may not `fetch()` or `XMLHttpRequest` to anywhere. The CDN scripts above don't phone home for content data; if a future asset would, it's out.
3. **No dynamic code.** No `eval()`, no `new Function()`, no `setTimeout("string", …)`. All your code is static text in the file.
4. **No `innerHTML` from user-controlled data.** Use `textContent` or `createElement` + property assignments. Only literal strings the script author wrote may be assigned to `innerHTML`.
5. **No inline event-handler attributes.** Never `onclick="…"` in markup. Always `addEventListener` from a script block.
6. **No persistent state beyond obvious prefs.** `localStorage` is allowed for *user preferences only* (theme, last-selected tab). Never store user content, never store anything that would leak if the file were re-opened on another machine.
7. **Stay narrow in scope.** Allowed roles for inline JS: copy buttons, tab switching, theme toggle, anchor-active TOC, slider→preview configurators, deck-key nav, export-to-markdown buttons, Mermaid/Lucide initializers. Out of scope: telemetry, content fetching, "smart" prefetch, hidden iframes, ad/affiliate logic, anything that captures user interaction events for later analysis.
8. **Graceful degradation.** If the CDN is unreachable, the doc still reads. Mermaid not loaded → the diagram block falls back to its raw text. Lucide not loaded → icon slots are empty but layout doesn't break. Tailwind not loaded → the hand-tuned base CSS still styles everything. JS off → tabs collapse to stacked sections, copy buttons don't appear, theme falls back to `prefers-color-scheme`.

If any snippet violates the above, rewrite it or remove it. CDN access is a convenience for rendering — not a license to make the doc dependent on the open internet for *correctness* of the content.

## Inline JS snippets (drop in only if used)

All snippets below were audited against the seven rules above. Vanilla, no framework, no externals. Add at the bottom of `<body>`. Each degrades gracefully: content stays readable if the user has JS off.

### `copy-button` — appears on hover over `<pre>`

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

### `theme-toggle` — sun/moon button, persists in localStorage

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

### `mermaid` — render diagrams from text definitions (preferred for named diagram types)

Put each diagram in a `<pre class="mermaid">…</pre>` block. The Mermaid library reads the text and replaces it with an SVG. Theme picks up the page theme. The text inside the block is a graceful fallback if the CDN is blocked.

```html
<!-- somewhere in the body -->
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

<!-- at the bottom of <body> -->
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<script>
  (function () {
    if (!window.mermaid) return; // CDN blocked — leave the raw text visible as fallback
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    mermaid.initialize({ startOnLoad: true, theme: isDark ? 'dark' : 'default', securityLevel: 'strict' });
  })();
</script>
```

**Pick Mermaid over hand-SVG when** the diagram type has a name Mermaid supports: `flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`, `gantt`, `mindmap`, `timeline`, `journey`, `pie`, `gitGraph`. The text definition is far shorter than the equivalent SVG and the layout is automatic.

**Use hand-SVG instead when** you need pixel-precise positioning, custom annotations beside specific elements, hot-path highlighting on a module map, or a diagram type Mermaid doesn't support.

### `lucide` — inline icons

Use Lucide icons sparingly for action buttons, callouts, and status indicators. Markup uses `<i data-lucide="<name>"></i>` placeholders; the script swaps them for inline SVGs.

```html
<!-- examples -->
<button class="btn"><i data-lucide="copy"></i> Copy</button>
<div class="callout callout--warn"><div class="callout-title"><i data-lucide="triangle-alert"></i> Heads up</div>…</div>

<!-- at the bottom of <body> -->
<script src="https://unpkg.com/lucide@latest"></script>
<script>window.lucide && lucide.createIcons();</script>
```

Common icon names: `check`, `x`, `info`, `triangle-alert`, `circle-alert`, `copy`, `external-link`, `chevron-down`, `arrow-right`, `sun`, `moon`, `github`, `book-open`, `terminal`, `play`, `pause`. Full set: lucide.dev.

### `toc-active` — highlights the active section as the user scrolls

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

### `deck-nav` — arrow keys / page keys between slides

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

### Live configurator pattern (sliders → live preview → Copy CSS)

```html
<!-- markup -->
<div class="card configurator">
  <label>Radius <input type="range" id="cfg-radius" min="0" max="32" value="8"></label>
  <label>Padding <input type="range" id="cfg-pad" min="0" max="32" value="12"></label>
  <div id="cfg-preview" class="btn btn--primary">Live preview</div>
  <pre><code id="cfg-css">/* generated */</code></pre>
  <button class="btn" id="cfg-copy" type="button">Copy CSS</button>
</div>
<script>
  (function () {
    const r = document.getElementById('cfg-radius'), p = document.getElementById('cfg-pad');
    const prev = document.getElementById('cfg-preview'), out = document.getElementById('cfg-css');
    function render() {
      const css = `.btn {\n  border-radius: ${r.value}px;\n  padding: ${p.value}px ${parseInt(p.value)*1.5}px;\n}`;
      prev.style.borderRadius = r.value + 'px';
      prev.style.padding = p.value + 'px ' + (parseInt(p.value)*1.5) + 'px';
      out.textContent = css;
    }
    [r, p].forEach(el => el.addEventListener('input', render));
    document.getElementById('cfg-copy').addEventListener('click', () => navigator.clipboard.writeText(out.textContent));
    render();
  })();
</script>
```

## Style rules for `body_html`

- Lead with a single `<h1>{{title}}</h1>`.
- Optional `<div class="meta">` block under the H1 with author / date / tags rows (`<div class="meta-row">…</div>`).

### Navigation and layout — TOC, menus, floating elements

Layout determines whether the document is readable. The single most common defect from this skill has been a TOC stuck to the top of the viewport that **overlays the prose underneath** — the reader literally can't see the content they're scrolling to. The rules below exist to make that impossible.

**TOC placement — pick exactly one mode, by section count:**

| Sections (h2) | Mode | Markup |
|---|---|---|
| 0–3 | **None** — don't add a TOC at all. The doc is short enough to scroll. | — |
| 4–6 | **Top TOC** — a small, non-sticky `<nav class="toc">` block right under the meta. Scrolls away with content. | `<nav class="toc"><div class="toc-title">Contents</div><ul>…</ul></nav>` |
| 7+ | **Sidebar TOC** — `<body class="has-sidebar-toc">`, then `<nav class="toc sidebar">…</nav>` as the first child of `<main>`, then the article in a sibling `<article>`. The grid keeps the sidebar in its own column — it never overlays content. | See template |

Either way, every `<h2>` MUST have an `id` so anchor links resolve.

**Hard layout rules — these are not stylistic preferences:**

- **Any TOC, menu, or navigation list goes in the sidebar.** The top-TOC variant exists only for short docs (4–6 sections) and is **non-sticky** — it scrolls away as the user reads. Never make the top TOC `position: sticky` or `position: fixed`. Never put a TOC into a floating bar.
- **The only sticky/fixed elements allowed** in a document are:
  1. The sidebar TOC, which lives in its own grid column (never overlaps the article).
  2. The theme-toggle button, small, top-right, ≤ 40px wide.
  3. The deck-mode slide-number indicator, bottom-right, single line.
- **Banned: every other use of `position: fixed` or `position: sticky`.** No docked top bar, no floating header, no "back to top" pill hovering over content, no sticky section sub-nav, no sticky table headers in a normal doc, no floating action button. If the agent reaches for `position: fixed` or `position: sticky`, it's almost certainly building the overlay anti-pattern — stop and pick one of the two TOC modes above.
- **Never put a nav element on top of the article column.** "On top of" means: sharing the same horizontal real estate AND fixed in viewport space. The sidebar dodges this because it lives in a separate grid column. A fixed top bar does not, and is forbidden.
- **Narrow viewports (< 900px):** the sidebar TOC collapses to a non-sticky block above the article (the template handles this). Do not re-introduce stickiness on mobile — overlay TOCs are even worse there.
- **Don't invent new positioning.** Use the template's `body.has-sidebar-toc` grid as-is. Do not write `position: sticky` or `position: fixed` in inline styles or in a second `<style>` block; the template's allowlist is the complete set.


- Section structure via `<h2>` for top-level sections, `<h3>` for sub-sections. Skip `<h4>` and below unless absolutely necessary.
- Use semantic HTML AND the component classes from the template:
  - **Status / metadata** → `<span class="badge badge--ok|warn|error|info">…</span>`
  - **Highlight / aside** → `<div class="callout callout--note|ok|warn|danger"><div class="callout-title">…</div>…</div>`
  - **Optional / deep-dive content** → `<details><summary>…</summary>…</details>`
  - **Comparison** → `<div class="grid-2"><div class="card">…</div><div class="card">…</div></div>`
  - **Color swatches** → `<div class="swatch-grid"><div class="swatch"><div class="swatch-chip" style="background:#…"></div><div class="swatch-meta">…</div></div></div>`
  - **Event sequence** → `<ul class="timeline"><li><span class="ts">2026-05-14</span>…</li></ul>`
  - **Parallel content** (multi-lang code, before/after) → `.tabs` block from the template
  - **Diagrams** → `<div class="diagram"><svg viewBox="…">…</svg></div>` — write actual SVG, not ASCII
- Inline styles ARE allowed for one-off values that depend on content (e.g. `style="background:#0ea5e9"` on a swatch chip). Don't add a second `<style>` block; extend the template's `:root` tokens or use Tailwind utility classes for one-off layout.
- Inline `<script>` is allowed for the snippets above and equivalent vanilla JS. External `<script src>` is allowed *only* for the four trusted CDNs (Tailwind, Lucide, Mermaid, plus Google Fonts via `<link>`). Content readability must survive any of them being blocked.
- No emoji unless the user wrote them.

## Footer

Append a `<footer class="doc-footer">` with:

- Generating agent (`source_agent`)
- Generation timestamp (ISO date)
- Vault path

Example:

```html
<footer class="doc-footer">
  Generated by <strong>pm</strong> · 2026-05-15 · <code>docs/2026-05-15-quarterly-roadmap.html</code>
</footer>
```

## Don't

- **Don't produce styled markdown.** If the rendered output is "h1 + paragraphs + tables + code blocks" with no diagrams, callouts, badges, collapsibles, or grids — you built the wrong artifact. Go back and pick 2–3 patterns from the picker.
- **Don't pull from CDNs outside the trusted four.** Tailwind Play, Google Fonts, Lucide, Mermaid — yes. Anything else (analytics, Sentry, GA, ad networks, random gists, jQuery, lodash, etc.) — no. Want to add another? Audit it and put it in the "External assets" table first.
- **Don't depend on the network for content.** CDNs render the page; they don't fetch the page's data. If the file is unreadable when offline, you've put content behind a network request — fix it.
- **Don't include the markdown source as a comment or code block** — the HTML is the artifact (unless `companion: true`, in which case the markdown lives in its own `.md` file).
- **Don't paste the rendered body back inline** in the chat reply. The URL is the deliverable.
- **Don't omit the dark-mode block** — the user toggles between modes.
- **Don't add custom colors** beyond the CSS vars unless the doc is *about* color (palette proposal, design system) — keep the visual language consistent across documents.
- **Don't reach for HTML when markdown is right** (see "When markdown IS still right"). Agent-to-agent output, files reviewed in git, terminal output, and quick replies stay markdown. For artifacts that *both* live in git AND need a rich reading experience, use **companion mode** — produce both files.
- **Don't use ASCII diagrams.** Write Mermaid for named diagram types (flowchart, sequence, state, class, ER, gantt, mindmap, timeline) — it auto-lays-out from short text. Drop to hand-SVG when you need a layout Mermaid can't produce. Never ASCII.
- **Don't ship the "default-AI aesthetic."** No linear/radial gradients, no glass morphism, no heavy shadows, no neon glow, no emoji-decorated headers, no purple-to-pink "AI brand" anything. Stick to the token palette. The document should look like a quiet, well-typeset reading page — not a SaaS landing page.
- **Don't dock a TOC, menu, or nav to the viewport.** No `position: sticky` / `position: fixed` on a top TOC. No floating "Contents" pill. No docked top bar. No "back to top" button that hovers over text. If the doc has ≥7 sections, put the TOC in a **sidebar** (own grid column, never overlaps the article). If the doc has 4–6 sections, use the non-sticky top TOC. If 0–3, no TOC at all. See "Navigation and layout" in Style rules — the only sticky elements allowed in a document are the sidebar TOC, the theme toggle, and the deck slide-number indicator.
- **Don't violate the inline-JS guardrails.** No `fetch`, no `eval`, no inline `onclick=`, no `innerHTML` of user data, no telemetry. See "Inline JS — security guardrails."
- **Don't write to the vault directly.** Always go through `write_note`.
