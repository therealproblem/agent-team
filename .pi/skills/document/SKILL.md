---
description: Default skill for ANY long-form artifact — PRDs, reports, lessons, summaries, exam results, research write-ups, exec briefs, post-mortems. Produces a self-contained HTML file (minimalist, shadcn-inspired) and returns a file:// URL the user can open. Use this BEFORE reaching for markdown unless the user has explicitly asked for another format.
---

# Document

The default output convention for any non-trivial artifact in this system.

> If you would otherwise produce a multi-section markdown document and hand it back inline, **stop** — produce HTML through this skill and hand back a URL instead.

The user reads documents in a browser. They've explicitly opted out of inline markdown for this purpose: dense prose, tables, headings, and code blocks are far easier to read on a styled page than in a terminal scrollback.

## Default — always

- Output format: **self-contained `.html` file** (everything inlined: styles in `<style>`, no external fonts/icons/scripts).
- Storage: written into the vault under `docs/<YYYY-MM-DD>-<slug>.html` via the existing `write_note` tool.
- Reply to the user: a single `file://` URL pointing to the saved file, plus a one-sentence summary of what the document contains. Nothing else inline.

## When to deviate

Use a different format **only** when the user explicitly asks:

| User says | Use |
|---|---|
| "as markdown", "in markdown" | `.md` via `note-taker` |
| "PDF" | HTML now, mention they can print → save as PDF |
| "send it to slack/email/etc." | Route through `scribe` for the audience, output inline |
| Short capture / journal entry / one-liner | `note-taker` markdown (this skill is for long-form) |

When in doubt: HTML.

## What counts as long-form

Reach for this skill for:

- PRDs, design docs, ADRs, post-mortems
- Research write-ups, market notes, news digests
- Lesson plans, study guides, JLPT mock-exam result sheets
- Roadmaps and quarterly plans
- Executive summaries and stakeholder reports
- Pattern-watch summaries (Trader)
- Anything with multiple H2 sections, or longer than ~400 words, or containing tables / multiple code blocks

Short captures (< 200 words, no structure) stay markdown via `note-taker`.

## Inputs

```
document.publish({
  title: "<short noun phrase>",
  body_html: "<inner HTML — no <html>/<head>/<body>; just the article contents>",
  source_agent: "<agent name>",        // optional
  folder: "docs" | <free path>,        // default: "docs"
  toc: true | false,                   // optional — emit a table of contents from h2s
  meta: { author, date, tags, ... }    // optional — surfaced in the footer
})
```

## Steps

1. Slug the title (`lowercase-hyphenated`).
2. Resolve target path: `<folder>/<YYYY-MM-DD>-<slug>.html`.
3. Build the full HTML by wrapping `body_html` in the template below.
4. Call `write_note` with the assembled HTML and that path. Pass `format: "html"` if the tool supports it; otherwise it's just a file write.
5. Return to the caller:
   ```
   {
     path: "<vault-relative path>",
     url: "file:///<absolute path>",
     title: "<title>"
   }
   ```
6. The agent's user-facing reply is then:
   > Saved as **{title}**. Open: `file:///…/file.html`

   Do not paste the document body inline. Do not include a markdown copy "for convenience". The URL is the deliverable.

## Self-contained HTML template

Use this verbatim — only fill in `{{TITLE}}` and `{{BODY}}` (and optionally `{{META_FOOTER}}`). Do not link to external stylesheets, fonts, CDNs, or scripts. The file must render identically with no network access.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{{TITLE}}</title>
<style>
  :root {
    --bg: hsl(0 0% 100%);
    --fg: hsl(240 10% 4%);
    --muted: hsl(240 4% 46%);
    --border: hsl(240 6% 90%);
    --accent: hsl(240 6% 10%);
    --code-bg: hsl(240 5% 96%);
    --radius: 8px;
    --maxw: 720px;
    --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
                 "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: hsl(240 10% 4%);
      --fg: hsl(0 0% 98%);
      --muted: hsl(240 5% 65%);
      --border: hsl(240 4% 16%);
      --accent: hsl(0 0% 98%);
      --code-bg: hsl(240 4% 12%);
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
  main {
    max-width: var(--maxw);
    margin: 0 auto;
    padding: 64px 24px 96px;
  }
  h1, h2, h3, h4 {
    line-height: 1.25;
    letter-spacing: -0.01em;
    margin: 1.6em 0 0.5em;
    font-weight: 600;
  }
  h1 { font-size: 2rem; margin-top: 0; letter-spacing: -0.02em; }
  h2 { font-size: 1.4rem; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
  h3 { font-size: 1.1rem; }
  p, ul, ol, blockquote, table, pre { margin: 0.9em 0; }
  ul, ol { padding-left: 1.4em; }
  li + li { margin-top: 0.25em; }
  a { color: var(--accent); text-underline-offset: 2px; }
  blockquote {
    border-left: 3px solid var(--border);
    padding: 0.1em 0 0.1em 14px;
    color: var(--muted);
    font-style: normal;
  }
  code {
    background: var(--code-bg);
    padding: 1px 6px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.92em;
  }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    overflow-x: auto;
  }
  pre code { background: transparent; padding: 0; font-size: 0.9em; }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.95em;
  }
  th, td {
    border: 1px solid var(--border);
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: var(--code-bg);
    font-weight: 600;
  }
  hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
  img { max-width: 100%; border-radius: var(--radius); }
  .meta {
    color: var(--muted);
    font-size: 0.875rem;
    margin-bottom: 2em;
    padding-bottom: 1em;
    border-bottom: 1px solid var(--border);
  }
  .meta-row + .meta-row { margin-top: 0.25em; }
  .toc {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 18px;
    margin: 1.5em 0 2em;
    font-size: 0.95em;
  }
  .toc-title {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 0.5em;
  }
  .toc ul { margin: 0; padding-left: 1.2em; }
  footer.doc-footer {
    margin-top: 4em;
    padding-top: 1.5em;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.85rem;
  }
  ::selection { background: var(--accent); color: var(--bg); }
</style>
</head>
<body>
<main>
{{BODY}}
{{META_FOOTER}}
</main>
</body>
</html>
```

## Style rules for `body_html`

- Lead with a single `<h1>{{title}}</h1>`.
- Optional `<div class="meta">` block under the H1 with author / date / tags rows (`<div class="meta-row">…</div>`).
- Optional `<nav class="toc"><div class="toc-title">Contents</div><ul>…</ul></nav>` if the doc has 4+ H2 sections.
- Section structure via `<h2>` for top-level sections, `<h3>` for sub-sections. Skip `<h4>` and below unless absolutely necessary.
- Use semantic HTML: `<table>`, `<ul>`, `<ol>`, `<blockquote>`, `<pre><code>`, `<hr>`. No divs-for-everything.
- No inline styles, no `<style>` outside the template, no `<script>`, no external fetches.
- No emoji unless the user wrote them.

## Footer

Append a `<footer class="doc-footer">` with:

- Generating agent (`source_agent`)
- Generation timestamp (ISO date)
- Vault path

Example:

```html
<footer class="doc-footer">
  Generated by <strong>pm</strong> · 2026-05-10 · <code>docs/2026-05-10-quarterly-roadmap.html</code>
</footer>
```

## Don't

- Don't include the markdown source as a comment or code block — the HTML is the artifact.
- Don't paste the rendered body back inline in the chat reply. The URL is the deliverable.
- Don't link to external CSS/JS/fonts/icons. Self-contained means *no network*.
- Don't omit the dark-mode block in `:root` — the user toggles between modes.
- Don't add custom colors beyond the CSS vars — keep the visual language consistent across documents.
- Don't write to the vault directly. Always go through `write_note`.
