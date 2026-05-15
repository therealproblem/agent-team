# Kami inline-SVG snippets

Drop-in patterns referenced by [SKILL.md](../SKILL.md). Each one uses only Kami CSS vars (`--paper`, `--paper-soft`, `--ink`, `--ink-soft`, `--ink-mute`, `--rule`, `--accent`). No `rgba()`, no second chromatic hue, solid hex / CSS var fills only.

## Sparkline — numbers over time

```html
<svg viewBox="0 0 120 28" width="120" height="28" aria-hidden="true">
  <polyline fill="none" stroke="var(--accent)" stroke-width="1.5"
            points="0,20 12,18 24,15 36,17 48,12 60,9 72,11 84,7 96,8 108,5 120,4" />
</svg>
```

Use inline next to a metric heading, or stacked in a "small multiples" row at the top of a report section.

## Horizontal bar plot — distribution / proportion

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

## Process flow — sequenced steps (horizontal)

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

## Vertical timeline — incident / roadmap / version history

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

## Radial score — 0–100 indicator

```html
<svg viewBox="0 0 60 60" aria-hidden="true">
  <circle cx="30" cy="30" r="26" fill="none" stroke="var(--rule)" stroke-width="3"/>
  <circle cx="30" cy="30" r="26" fill="none" stroke="var(--accent)" stroke-width="3"
          stroke-dasharray="163" stroke-dashoffset="49"
          transform="rotate(-90 30 30)"/>
  <text x="30" y="34" font-family="var(--serif)" font-size="14" fill="var(--ink)" text-anchor="middle">70</text>
</svg>
```

Math: circumference is `2π × 26 ≈ 163`. For score `s` out of 100, `stroke-dashoffset = 163 × (1 - s/100)`. First circle is the track, second is the filled arc.

## Architecture sketch — modules + edges

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

## Vertical sequential flow — pipeline / stacked steps

Use when the source markdown shows a top-to-bottom pipeline (numbered steps, "first … then … finally"). Do **not** reuse the horizontal-flow snippet rotated 90° — the polygon arrowheads in that snippet point right, and a sideways triangle on a vertical line reads as a tick mark, not an arrow.

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

**Arrowhead geometry** (memorize): for a down-pointing triangle whose tip sits at `(X, Y)`, the polygon is `points="X-6,Y-10 X+6,Y-10 X,Y"` — 12px wide, 10px tall. The line that feeds the arrow must end exactly at the polygon's top edge (`Y-10`), never inside the triangle. A line stopping at `Y-6` leaves a visible stem poking out the top in print (anti-aliasing exposes it). Same rule rotated for horizontal arrows.

## Fan-out — one parent → N children (comb routing)

Use whenever a single box has edges down to multiple boxes below it. **Do NOT** draw N diagonal lines from a single point on the parent — that reads as a starburst. Use a comb: short trunk down from the parent, horizontal bus, drop into each child.

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
    <!-- Drops -->
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

For 3 children, add a middle drop at the parent's center X. For 4+, keep them evenly spaced along the bus; if the bus would exceed the canvas, switch to a two-level tree (parent → 2 group nodes → leaves) instead of cramming.

**Fan-out / pipeline anti-patterns:**
- **Starburst origin.** Multiple connectors sharing one origin point fanning diagonally. Use trunk + bus.
- **Floating arrowhead.** Tip sits in empty space, not overlapping a child's top edge. Tip must land on (or just inside) the target box's border.
- **Phantom edge.** Arrow points to no target. Drop the path or add the target box — never ship a dangling arrow.
- **Pencil-mark arrowheads.** A bare `<line>` without polygon, or polygon under ~8px wide. At print scale these read as decoration. Use the 12×10 polygon.
- **Stem poking through the arrowhead.** Line's `y2` must equal the polygon's top edge coordinate, never "a few px short of the tip."

## Gantt — schedule across parallel workstreams

Use when the source markdown describes a multi-workstream schedule (quarterly roadmap, sprint plan, project plan with overlapping tracks). **Mermaid `gantt` is banned** — hand-roll inline SVG. Status is encoded by *fill style*, not hue (single-hue rule forbids the usual green / orange / red palette).

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

Pair the chart with a small legend strip (three or four `.swatch` chips) naming the fill styles: filled = done/active, outlined = planned, dashed = at-risk. Reader learns the convention once per document.

**Gantt anti-patterns:**
- **Second chromatic hue.** Resist colouring at-risk bars red, done green, in-flight orange. Status is fill *style*, not fill *colour*.
- **Zero-width milestone.** `<rect width="0">` disappears in print. Use a filled diamond `<polygon>` (8px square rotated 45°).
- **In-bar labels.** Text painted on top of an accent bar fights the bar or vanishes into it. Row label says what; bar's left edge says when. Sufficient.
- **Dependency arrows draped across the chart.** Gantt is for *when*, not *because-of*. Draw a separate flow diagram for the dependency graph.
