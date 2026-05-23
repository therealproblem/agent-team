## Diagrams first — reach for an inline SVG before anything else

The Kami aesthetic is severe by design — parchment, serif, single hue, no decorative chrome. That severity makes diagrams **more** important, not less: in a document with no second color and no glass / glow / gradient, a single well-chosen diagram is the visual anchor.

A Kami PDF without a single diagram is almost always under-cooked. Before generating the HTML, scan the markdown for the patterns below and produce **at least one** inline SVG. WeasyPrint and Chrome both render inline SVG natively — no JS, no Mermaid (Mermaid renders late and is unsafe for the PDF snapshot), no external assets.

### Exit conditions — check these BEFORE scanning the patterns table

The patterns table below tells you *what* to draw once you've decided a diagram is right. This table tells you when an SVG is the wrong tool entirely. Run through these first; if any row matches the source markdown, do **not** draw an SVG — use the listed alternative.

| If the content is… | Use this instead, and do NOT draw a diagram |
|---|---|
| A **comparison of N independent options** (cloud vs. self-host, plan A vs. plan B, "when to pick X over Y"). **Markdown shape to recognise:** parallel sibling `###` subsections (`### Foo` then `### Bar`, same lead sentence + bullet shape) under a parent heading containing "distinction", "vs", "compared", "two …", "side by side", or a similar contrast cue. Two parallel concepts framed as a distinction are *never* a process flow — do **not** redraw them as `Foo → middle → Bar`, even if you can imagine a domain mechanism that connects them. The author wrote a distinction; ship a distinction. | `.grid-2` or `.grid-3` of bordered `.card`s — one card per option, criteria as a bulleted list inside. A callout above the grid carries the recommendation (if any). |
| A **single binary decision** ("should I do A or B?", "when to choose each") | Prose lede stating the question + 2-card grid for the answers. Do NOT use a decision diamond. The diamond is too small to hold a readable question at print scale, and the choice of which branch to fill with `--accent` injects editorial bias into the *geometry* before the reader has read a word — a chart should never argue for one branch by drawing it more vividly than the other. |
| A **multi-level decision tree leading to >4 leaves OR >2 levels of branching** ("how to choose between these 6 patterns", "which approach for problem X") | `.grid-N` of bordered `.card`s — one card per leaf outcome, with the decision criteria written as a bulleted list *inside* each card. A short prose lede above the grid lists the questions a reader should ask. **Trees with >2 levels overflow A4 portrait at any layout direction** — top-down stacks too tall, left-to-right squashes too wide and nodes overlap. The 6-pattern decision tree in agentic-design-patterns is the canonical violator: 3 levels of yes/no forks landing on 6 leaves, drawn as a flowchart it cannot help but overlap; drawn as 6 cards it reads in 30 seconds. Use the binary-decision exit above for 1 fork → 2 outcomes; use a single-level horizontal tree (in the patterns table) for 1 fork → ≤4 outcomes. Everything denser becomes cards. |
| An **absence, negation, or "this thing is gone"** state | Prose caption in `var(--ink-mute)`, or a struck-through label, or an empty bracketed slot `[ — ]`. Do NOT invent a glyph (`✕`, `?`, `!`, `∅`) and place it on an edge or between nodes without an adjacent caption — readers cannot decode an uncaptioned symbol. If you need to express "memory wiped between sessions", write the words "memory wiped" next to the gap; don't draw an X and hope. |
| **Pure enumeration without flow** ("here are 5 features", "the four pillars") | Numbered list or `.grid-N` of cards. Boxes-and-arrows imply causation or sequence; if neither exists in the source, the diagram lies. |
| The **table IS already the diagram** | Leave it as a table. An equity-report Numbers section, a feature comparison matrix, a pricing grid — the structure is the visual. Wrapping it in SVG adds nothing. |

If none of the above fires, continue to the patterns table.

### Content patterns that should be a diagram

| If the markdown contains… | Reach for |
|---|---|
| Sequenced steps or a process | Horizontal flow — rounded rects + arrows in `var(--ink-mute)`, accent fill on the current/highlighted node |
| Decisions with **≥3 outcomes** at ONE level (single fork, ≤4 outcomes) | Horizontal tree — parent node with comb-routed drops to each outcome (see fan-out snippet). For 2 outcomes use the binary-decision exit above. **For >4 outcomes, or any tree with >1 fork, use the multi-level decision-tree exit above (cards).** |
| **Multi-level** decision tree, ≤2 levels deep AND ≤4 total leaves | Left-to-right tree with labelled branches — see "Decision tree" snippet. Anything denser (3+ levels OR 5+ leaves) overflows A4 portrait at any layout direction and **must** use the cards exit instead — do not even attempt the SVG. |
| State transitions | Nodes-and-edges with state labels; "active" state filled `var(--accent)`, others outlined |
| Time-based progression — single thread (incident timeline, version history, one-track roadmap) | Vertical timeline with `var(--rule)` axis, accent dots for events |
| Schedule across multiple parallel workstreams (quarterly roadmap, sprint plan, project plan) | Gantt — rows per workstream, time axis on top, status encoded by fill (filled / outlined / dashed) not by hue |
| Architecture / module relationships | Boxes-and-arrows with subgraph boundaries; `var(--paper-soft)` fill for boxes inside the same system |
| Organizational hierarchy (org chart, taxonomy, file-tree) | Tree with ranked levels; serif text only, no icons |
| Numbers over time (equity curve, score trend, growth) | Sparkline — single `<polyline>` SVG, accent stroke |
| Distribution / proportion | Horizontal bar plot. **Preferred over pie** in Kami — same-hue bars read cleaner than pie slices that would tempt a second color |
| Ranked bar plot (top-N with the rest as context) | Horizontal bar plot with the top-N bars in `var(--accent)` and the remainder in `var(--ink-mute)`. **Never** use `var(--ink)` or `var(--ink-soft)` for the de-emphasized bars — those are body-text shades and read as nearly-black, which destroys the rank cue. |
| Score / rating | Radial indicator (SVG circle with centered text), or a 5-dot scale with filled vs. outlined dots |
| Side-by-side metrics with annotations | Small multiples — N tiny SVGs in a row, each a sparkline or bar |
| Geographic / map content (rare, but happens) | Hand-SVG outline, accent fill for the regions being discussed |

Pick at least one. If the markdown supports two, use two — Kami documents tolerate two diagrams gracefully per A4 page (figure-and-counter-figure is a print-design classic). Three on one page is usually too much.

### When NOT to add a diagram at all

- Single-paragraph `letter` template with no claim that has a visual shape.
- Resume sections that are pure lists (Experience, Education) — diluting the dense-text rhythm. EXCEPT: a sparkline / radial in the Skills section showing proficiency is on-brand.
- Cover pages — a single Kami cover with the title is more powerful undecorated.

### Palette constraint

Every SVG uses only Kami CSS vars: `var(--paper)`, `var(--paper-soft)`, `var(--ink)`, `var(--ink-soft)`, `var(--ink-mute)`, `var(--rule)`, `var(--accent)`. No additional colors. No `rgba()` (the same WeasyPrint discipline applies to SVG fills — solid hex / CSS var only).

**Each var has one role. Do not improvise — pick by role:**

| Var | Role | Use for |
|---|---|---|
| `--paper` / `--paper-soft` | Surface | Box fills, page background, "the diagram sits on parchment" |
| `--accent` | Emphasis (one thing) | The *one* element being argued for in the diagram — the highlighted node, the top-ranked bar, the focal box. Used sparingly: if 5 of 6 boxes are accent, accent has stopped emphasizing anything. |
| `--ink` | Primary body text | Node labels, axis labels. **Never** for chart bars, fills, or connector strokes — `--ink` is body-text-dark and reads as almost black when used as a fill. |
| `--ink-soft` | Secondary text | Captions, sub-labels under a node. |
| `--ink-mute` | Supporting structure | Connector strokes, arrowheads, de-emphasized bars in a ranked chart, sub-labels at small sizes. The de facto "diagram default" stroke. **Never put light-on-dark text labels inside a `--ink-mute` fill** — `--ink-mute` (#78716c) against `--paper` (#FAF9F5 / #f5f4ed) yields ~3.7:1, which fails WCAG AA for normal text. See the "Text inside a filled bar" rule below. |
| `--rule` | Thin separators | 1px dividers, the spine of a vertical timeline, dashed subgraph boundaries. Stroke only — never as a fill. |

**Text inside a filled bar / box (hard rule).** When a label sits *inside* a filled shape with light text (`--paper` / `--paper-soft`), the fill must be `--accent` (#1B365D, ~10:1 against parchment text). Any neutral fill (`--ink-mute`, `--ink-soft`, `--paper-soft`) is too pale for white text — labels on those shapes go *outside* the shape in `--ink-soft`. The most common failure: a paired comparison bar plot where one bar is `--accent` with inside label and the other is `--ink-mute` with the same inside-label treatment — the muted bar's text becomes unreadable. Fix by either (a) moving both labels outside the bars in `--ink-soft`, or (b) drawing both bars in `--accent` and letting bar length (not colour) encode the difference. The latter pairs with the symmetry rule below — comparison diagrams should not argue with colour.

**Connector-palette consistency (hard rule).** Within a single diagram, all connector strokes — lines, arrows, dashed edges — must share one palette. Pick either *all-`--ink-mute`* (default) or *all-`--accent`* (rare, only when the diagram's entire point is to show one accented flow). Do **not** mix: a blue arrow into one node + gray arrows into the rest reads as "this arrow is special" with no caption telling the reader why. If one connector deserves emphasis, label the emphasis in text, do not encode it in the stroke colour.

### Vocabulary constraint — the diagram speaks the source's words

Every node label, edge label, sub-label, and caption in the SVG must trace back to the source markdown. Allowed sources for a label, in priority order:

1. A heading or sub-heading from the source (`## Order book` → node label `Order book`).
2. A bolded term, list item, or table header from the source (`**aggressive trading activity**` → `aggressive trading`).
3. A noun phrase that appears verbatim, or in obvious plural/singular form, in the source body.

What is **not** allowed: coining a domain term to bridge or summarise — `Live auction`, `Matching engine`, `Decision`, `Process`, `Pipeline`, `Input` / `Output`, `Problem` / `Solution` — when the source markdown does not use that term. If you find yourself reaching for a label that is not in the source, that is the signal you are drawing your own theory of how the source's concepts fit together, not the source itself. The fix is not a better label; it is the wrong diagram. Go back to the exit-conditions table — almost always the source is a comparison (→ cards) or a pure enumeration (→ list/cards) and you reached for a flow because the source happened to have two-or-more concepts in it.

**Worked failure.** A source titled *"the core distinction between order book and order flow"* gets drawn as `Order book → Live auction → Order flow`. The source contains no "Live auction"; the agent invented an intermediate node to bridge the two real concepts and silently shipped its own microstructure model in place of the author's. The author wrote a *distinction* (parallel concepts, contrasted), the agent shipped a *process* (sequenced concepts, causally linked). Other failures in the same family: `Input → Processing → Output`, `Problem → Solution → Outcome`, `Question → Decision → Answer` — generic three-node flows whose middle node is the agent's invention, not the author's claim. Whenever the middle node isn't in the source, the flow is the agent's, not the author's. Stop and route through the exit-conditions table.

A defense-in-depth lint at the `write_export_pdf` boundary inspects every `<text>` element in the SVG and refuses the export if any multi-word label has zero word-anchors in the source. If you see that refusal, the fix is almost never "rename the label" — it is "replace the diagram with the structure the exit-conditions table prescribes for this content".

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

    <line x1="115" y1="40" x2="180" y2="40" stroke="var(--ink-mute)" stroke-width="1"/>
    <polygon points="180,36 188,40 180,44" fill="var(--ink-mute)"/>

    <line x1="295" y1="40" x2="360" y2="40" stroke="var(--ink-mute)" stroke-width="1"/>
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

    <line x1="130" y1="60" x2="130" y2="78" stroke="var(--ink-mute)" stroke-width="1.25"/>
    <polygon points="124,78 136,78 130,88" fill="var(--ink-mute)"/>

    <rect x="40" y="92"  width="180" height="50" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="130" y="114">2. Query Episodic Memory</text>
    <text x="130" y="130" font-size="9" fill="var(--ink-mute)">Past sessions mentioning "project"</text>

    <line x1="130" y1="142" x2="130" y2="160" stroke="var(--ink-mute)" stroke-width="1.25"/>
    <polygon points="124,160 136,160 130,170" fill="var(--ink-mute)"/>

    <rect x="40" y="174" width="180" height="50" rx="6" fill="var(--accent)" stroke="var(--accent)"/>
    <text x="130" y="196" fill="var(--paper)">3. Construct Prompt</text>
    <text x="130" y="212" font-size="9" fill="var(--paper)">System + Memory + Input</text>

    <line x1="130" y1="224" x2="130" y2="242" stroke="var(--ink-mute)" stroke-width="1.25"/>
    <polygon points="124,242 136,242 130,252" fill="var(--ink-mute)"/>

    <rect x="40" y="256" width="180" height="50" rx="6" fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="130" y="284">4. Model Inference</text>
  </g>
</svg>
```

Arrowhead geometry (memorize this): for a **down-pointing** triangle whose tip sits at `(X, Y)`, the polygon is `points="X-6,Y-10 X+6,Y-10 X,Y"` — 12px wide, 10px tall. That's the minimum size that reads as an arrow at print scale; smaller and it looks like a stray dot. **The line that feeds the arrow must end exactly at the polygon's top edge — i.e. at `Y-10`, which is 10px short of the tip, matching the polygon's height.** A common mistake is to stop the line "a few pixels short of the tip" (e.g. `Y-6`), which lands *inside* the triangle and leaves a visible stem poking out the top in print. Same-colour fill does not reliably mask the stem — anti-aliasing makes it show. Always: line ends at the top edge, never inside the triangle.

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
    <!-- Drop into each child: line ends at polygon top edge (y=124), tip overlaps child's top edge (y=134 ≈ child y=134) -->
    <line x1="100" y1="96" x2="100" y2="124" stroke="var(--ink-mute)" stroke-width="1.25"/>
    <polygon points="94,124 106,124 100,134" fill="var(--ink-mute)"/>
    <line x1="380" y1="96" x2="380" y2="124" stroke="var(--ink-mute)" stroke-width="1.25"/>
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

#### Decision tree — multi-level branching with labelled edges

Use when the source markdown describes a *sequence* of forks that leads to N outcomes — a "which pattern do I pick?" flowchart, a triage tree, an `if-elif-else` cascade. Fan-out (above) covers ONE level; this snippet covers TWO OR MORE.

**Lay the tree LEFT-TO-RIGHT, not top-down, on A4 portrait.** A top-down tree with ≥4 leaves is the single most common cause of right-edge clipping in this skill: leaves spread horizontally faster than the page is wide, and the rightmost leaf gets silently truncated in the PDF (the text extractor still sees the full label, but the reader does not). Sideways trees grow downward instead, and A4 portrait has 245mm of content height vs. 170mm of width.

**Edge labels** (Yes / No, condition names) sit **perpendicular to the connector**, offset 6-10px above the line — never sharing the line's own coordinate. A `<text>` placed on the same y-axis as a `<line>` collides with it at print scale; readers cannot tell which branch the label names.

```html
<svg viewBox="0 0 520 280" aria-hidden="true">
  <g font-family="var(--serif)" font-size="11" fill="var(--ink)">

    <!-- Root (left) -->
    <rect x="10" y="120" width="100" height="40" rx="6"
          fill="var(--accent)" stroke="var(--accent)"/>
    <text x="60" y="144" fill="var(--paper)" text-anchor="middle">Start</text>

    <!-- Level-1 decision node -->
    <rect x="160" y="120" width="120" height="40" rx="6"
          fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="220" y="144" text-anchor="middle">Condition A?</text>

    <!-- Root → Level-1 (single edge, no label needed before the first fork) -->
    <line x1="110" y1="140" x2="150" y2="140" stroke="var(--ink-mute)" stroke-width="1"/>
    <polygon points="150,136 158,140 150,144" fill="var(--ink-mute)"/>

    <!-- Level-1 fork: upper branch to Decision B, lower branch to Decision C -->
    <!-- Branch lines start at Decision A's right edge -->
    <line x1="280" y1="140" x2="320" y2="60"  stroke="var(--ink-mute)" stroke-width="1"/>
    <line x1="280" y1="140" x2="320" y2="220" stroke="var(--ink-mute)" stroke-width="1"/>

    <!-- Branch labels: positioned ABOVE the midpoint of each line, in --ink-mute -->
    <text x="298" y="92"  fill="var(--ink-mute)" font-size="9.5" text-anchor="middle">Yes</text>
    <text x="298" y="188" fill="var(--ink-mute)" font-size="9.5" text-anchor="middle">No</text>

    <!-- Level-2 decision (upper) -->
    <rect x="320" y="40" width="120" height="40" rx="6"
          fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="380" y="64" text-anchor="middle">Condition B?</text>

    <!-- Level-2 decision (lower) -->
    <rect x="320" y="200" width="120" height="40" rx="6"
          fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="380" y="224" text-anchor="middle">Condition C?</text>

    <!-- Leaves: 4 outcomes stacked vertically on the right -->
    <!-- Upper-Yes leaf -->
    <line x1="440" y1="60" x2="478" y2="20" stroke="var(--ink-mute)" stroke-width="1"/>
    <text x="460" y="36" fill="var(--ink-mute)" font-size="9.5" text-anchor="middle">Yes</text>
    <rect x="480" y="0" width="40" height="32" rx="6"
          fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="500" y="20" text-anchor="middle" font-size="10">Alpha</text>

    <!-- Upper-No leaf -->
    <line x1="440" y1="60" x2="478" y2="100" stroke="var(--ink-mute)" stroke-width="1"/>
    <text x="460" y="86" fill="var(--ink-mute)" font-size="9.5" text-anchor="middle">No</text>
    <rect x="480" y="80" width="40" height="32" rx="6"
          fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="500" y="100" text-anchor="middle" font-size="10">Beta</text>

    <!-- Lower-Yes leaf -->
    <line x1="440" y1="220" x2="478" y2="180" stroke="var(--ink-mute)" stroke-width="1"/>
    <text x="460" y="196" fill="var(--ink-mute)" font-size="9.5" text-anchor="middle">Yes</text>
    <rect x="480" y="160" width="40" height="32" rx="6"
          fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="500" y="180" text-anchor="middle" font-size="10">Gamma</text>

    <!-- Lower-No leaf -->
    <line x1="440" y1="220" x2="478" y2="260" stroke="var(--ink-mute)" stroke-width="1"/>
    <text x="460" y="246" fill="var(--ink-mute)" font-size="9.5" text-anchor="middle">No</text>
    <rect x="480" y="240" width="40" height="32" rx="6"
          fill="var(--paper-soft)" stroke="var(--rule)"/>
    <text x="500" y="260" text-anchor="middle" font-size="10">Delta</text>
  </g>
</svg>
```

**Scaling rules:**

- For **3 leaves**: drop one of the four leaf rows; center the remaining three vertically.
- For **5–6 leaves**: keep the same width (520) but expand height to ~360-400 and add intermediate decision nodes. Do not widen the viewBox past 520 on portrait — the page can't render it.
- For **7+ leaves**: a single A4 SVG cannot hold this at readable type. Split into two trees grouped by the first decision, or restructure the source markdown so the tree is shallower.
- For **asymmetric trees** (some branches end early as leaves, others continue forking): leaf boxes can appear at any column, not just the rightmost. Keep the LR direction; just place each leaf at the column where its branch terminates. Align all leaf right-edges to a consistent x-coordinate only if it doesn't force overflow.

**Named anti-patterns — never ship these:**

*Structural (fan-out / pipeline):*

- **Starburst origin.** Multiple connectors sharing one origin point and fanning out diagonally to children. Always use a trunk + bus (comb) instead.
- **Floating arrowhead.** An arrow whose tip sits in empty space, not overlapping any child's top edge. The tip must land on (or just inside) the target box's border.
- **Phantom edge.** A connector that points to no target at all. If the source markdown describes a path that has nowhere to go in your current diagram, drop the path or add the target box — don't ship a dangling arrow.
- **Pencil-mark arrowheads.** A `<line>` with no `<polygon>`, or a polygon under ~8px wide. At print scale these read as decoration, not as arrows. Use the 12×10 polygon from the snippets above.
- **Tree overflow.** A top-down decision tree whose leaf row spreads wider than the viewBox / page width. The rightmost leaves get silently clipped in the PDF — the text extractor still sees the full string ("Hierarchical"), but the reader sees "Hierarc". Cause: stacking ≥4 leaves horizontally on A4 portrait. Fix: rotate to LR layout (see the multi-level decision tree snippet), where leaves stack vertically and the tree grows down the page rather than off the right edge.
- **Label-on-line collision.** A branch label (`Yes` / `No` / a condition name) positioned at the same y-coordinate as the connector it names. The text and the line overlap and both become unreadable at print scale. Fix: offset the label 6-10px perpendicular to the line (above for horizontal connectors, beside for vertical), using `text-anchor="middle"` at the line's midpoint X.

*Glyph / typography:*

- **Uncaptioned glyph edge.** A symbol (`✕`, `?`, `!`, `∅`, dot, slash) placed between or on nodes with no adjacent caption telling the reader what it means. Readers cannot decode unlabelled symbols; either caption it within 4px or replace it with words. The classic offender is "session ✕ session ✕ session" to mean "memory wiped" — write the words.
- **Decision diamond for a binary choice.** A small rotated square with a question crammed into two cramped lines, two lines drooping out of its lower vertices toward two outcome boxes. At print scale the diamond is too small to hold a readable question, the lines tend to terminate mid-air short of the boxes, and any colour asymmetry between the two branches editorialises in geometry. For 2 outcomes use a prose lede + 2-card grid; see the exit-conditions table above.
- **Deep nested decision tree at column width.** A flowchart with 3+ levels of forks landing on 5+ leaves, drawn at A4-portrait column width. No layout engine — dagre, ELK, or otherwise — can stop adjacent nodes from overlapping when the engine computes positions at one scale and the SVG is shrunk to fit a 700px column: nodes that were comfortably spaced in native coordinates collide visually. The canonical broken-example is "how to pick one of 6 agentic patterns" rendered as 3 nested yes/no forks: it overlaps as `flowchart LR`, stacks too tall as `flowchart TD`, and reads in 30 seconds as a 6-card grid. Take the cards exit (see the exit-conditions table) the moment you see >2 levels or >4 leaves.

*Colour / palette:*

- **Mixed-palette connectors.** Some connectors in `--accent`, others in `--ink-mute`, within one diagram, with no caption explaining why one is special. Pick one stroke palette per diagram. See the connector-palette consistency rule above.
- **Dark-gray de-emphasis.** Using `--ink` or `--ink-soft` (body-text shades) to colour bars, fills, or boxes that are meant to *recede*. They read as near-black at print scale and out-shout the accented elements they're meant to defer to. The correct "recede" shade is `--ink-mute`. Same rule for any "ranked top-N" chart: top in `--accent`, rest in `--ink-mute`, never in `--ink`.
- **Asymmetric branch styling.** In a comparison or decision diagram, drawing one branch / box / arm in full accent and the other in `--ink-mute`. This *visually* argues for the accented branch before the reader has read the labels. Either accent both (and let text carry the recommendation) or accent neither.

### Pre-ship checklist for every SVG

Before embedding any inline SVG in the HTML, walk this list. If any item fails, fix or replace the SVG; do not ship and hope.

1. **Exit conditions cleared.** The content isn't a comparison, binary decision, absence/negation, or pure enumeration. (If it is, the SVG shouldn't exist — go back to the exit-conditions table.)
2. **One stroke palette.** Every connector / arrow / dashed edge in this SVG uses the same Kami var. No mixed `--accent` + `--ink-mute` strokes within one diagram.
3. **Every glyph is captioned.** No `✕`, `?`, `!`, `∅`, lone dots, or invented symbols sitting between nodes without an adjacent label.
4. **Arrowhead geometry.** Each polygon arrowhead is 12px×10px (or proportional), the feeding line ends exactly at the polygon's top edge (not inside it), and the tip overlaps the target box's border.
5. **No dangling lines.** Every line begins at a source box's edge and ends at either (a) a target box's border, or (b) the base of a polygon arrowhead that lands on a target. Nothing floats.
6. **`--ink` is text-only.** Search the SVG for `fill="var(--ink)"` and `stroke="var(--ink)"`. If either appears on a `<rect>`, `<line>`, `<polygon>`, or `<polyline>` that's meant to recede, replace with `--ink-mute`.
7. **No decision diamonds.** Search for `transform="rotate(45"` or four-point polygons that look diamond-shaped. If found, the content is almost certainly a binary decision — re-route to the 2-card grid.
8. **Symmetry where the content is symmetric.** In any comparison or fork-shaped diagram, both arms have the same fill treatment, the same stroke treatment, the same arrowhead treatment. The text labels carry any argument; the geometry stays neutral.
9. **viewBox width within page budget.** Width ≤ 520 on A4 portrait (or ≤ 800 on landscape, e.g. slides). If a tree, flow, or architecture sketch exceeds the budget, restructure — rotate top-down trees to LR layout (see the multi-level decision tree snippet), split into two diagrams, or move that single section to landscape. Right-edge overflow is invisible in the source markdown but silently clips text in the PDF.
10. **Edge labels off the line.** Any `<text>` that names a branch sits 6-10px perpendicular to the connector it names, never at the connector's own coordinate. Search the SVG for `<text>` and `<line>` elements that share a y-value (horizontal connector) or x-value (vertical connector) within ~3px; that's a collision waiting to happen in print.
11. **Decision-tree density cap.** If this SVG is a tree (forks landing on outcome boxes), count the levels of branching and the total number of leaves. Levels ≤ 2 AND leaves ≤ 4 → SVG is fine. Anything denser (3+ forks deep, or 5+ leaves) → STOP and route through the multi-level decision-tree exit (a card grid). At column width Chrome will scale the SVG down to fit, and node positions that were comfortably spaced at native size will collide. No layout engine survives the compression.
12. **Every label is anchored in the source.** For each `<text>` element, check the label against the source markdown. Single-word labels are exempt (axis values, category names, short tags — `Q1`, `Yes`, `62%`). For multi-word labels — node titles, sub-labels, edge captions — at least one significant word (≥4 chars, not a stopword) must appear in the source markdown (heading, bullet, bold, or prose body). A multi-word label with zero anchors is an invented concept; the diagram is arguing for a frame the source does not take. Remove the invented node and route through the exit-conditions table — almost always the source is a comparison. See the "Vocabulary constraint" section above for the canonical failure (`Order book → Live auction → Order flow` redrawing a distinction as a process).

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
