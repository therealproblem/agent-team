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
  /* Per-page gutter lives on `@page { margin }` so every page gets the
   * same top/bottom breathing room — `body { padding }` only applies once
   * (at the very start and very end of the body), so on a multi-page doc
   * intermediate pages would butt content against the page edge.
   * `@page { background-color }` paints the parchment into the margin area
   * so there's no white frame; modern Chrome `--headless=new` honours this
   * (the legacy "@page background ignored" bug is fixed). Per-template
   * overrides set @page { margin }, NOT body { padding }. */
  @page {
    size: A4;
    margin: 32mm 20mm;
    background-color: #f5f4ed;
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
  html, body { margin: 0; }
  /* Force Chrome to actually print the background colour. Without this,
   * Chrome's print preview omits backgrounds by default and the parchment
   * disappears in the PDF entirely. Both prefixed and unprefixed are set
   * because Chrome accepts both at different versions. */
  html, body {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  html { background: var(--paper); }
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: var(--serif);
    font-weight: 400;
    font-size: 11pt;
    line-height: 1.55;
    /* Gutter lives on @page { margin } above, not here — body padding
     * only applies once per document (start + end), so using it would
     * leave intermediate pages flush against the page edge. */
    padding: 0;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* Headings — weight 500, serif. No synthetic bold. Titles 1.1–1.3 line-height.
   * Keep with next: a heading must never be stranded at the bottom of a page
   * while its content (paragraph, figure, table) jumps to the next. Both the
   * legacy and modern keywords are set — some Chrome builds only honour one. */
  h1, h2, h3, h4 {
    font-family: var(--serif);
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.005em;
    page-break-after: avoid;
    break-after: avoid;
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
  /* Code blocks — wrap, don't scroll. PDFs can't scroll, so `overflow: auto`
   * leaves clipped lines + a useless scrollbar (visible in print). `pre-wrap`
   * preserves newlines and the original indentation, while `overflow-wrap:
   * anywhere` breaks pathological long tokens (URLs, base64 blobs). */
  pre {
    background: var(--paper-soft);
    padding: 12px 14px;
    border-radius: 4px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 9.5pt;
    line-height: 1.4;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  pre code { background: transparent; padding: 0; }

  /* Figures and inline SVG diagrams — never split across pages. A diagram
   * cut in half is useless, and the page-break-after: avoid on its preceding
   * heading depends on the figure also refusing to split: otherwise Chrome
   * keeps the heading + first half on page N and pushes the second half to
   * N+1. Both legacy and modern keywords set for cross-Chrome reliability. */
  figure,
  svg,
  .diagram-block {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  /* Strip default <figure> margin so an inline-SVG inside a figure block
   * doesn't gain a 40px gutter from the user agent stylesheet. */
  figure { margin: 1em 0; }

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
