"use client";

/*
 * Local Mermaid renderer. Webpack-aliased from
 * `@theguild/remark-mermaid/mermaid` (see next.config.mjs) so the upstream
 * remark plugin emits `<Mermaid chart="…"/>` and resolves to this file.
 *
 * Why a local fork: `@theguild/remark-mermaid` calls
 * `mermaid.initialize({ theme: 'default' })`, which paints diagrams in
 * Mermaid's white-themed palette. On parchment (#f1e9e7) that palette
 * collapses to near-zero contrast. We initialize with `theme: 'base'`
 * and DESIGN-2 themeVariables so every fenced ```mermaid``` block looks
 * right against parchment without any per-diagram %%{init}%% block.
 *
 * Flowcharts render via the Eclipse Layout Kernel (`@mermaid-js/layout-elk`)
 * instead of Mermaid's default dagre engine. ELK handles dense / multi-rank
 * graphs (deep decision trees, fan-outs, subgraph-heavy architectures)
 * dramatically better — far fewer node collisions and smarter edge routing
 * on the kind of diagram that overwhelms dagre. Layout is still static, so
 * a structurally-too-wide diagram is still the author's job to fix (see
 * the breadth/depth caps in render-html/SKILL.md).
 *
 * Agents must NOT emit `style …` overrides or `%%{init}%%` palette
 * blocks in chart source — the defaults below are the palette.
 */

import { jsx } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";

// Delphi tokens → Mermaid themeVariables. Cognac-Stained Parchment look:
// parchment-cream node fills, deep-cognac borders/text/edges, warm-tan
// progression for mindmap level colors, Burnt Umber accent for charts.
const MERMAID_THEME_VARIABLES = {
  background: "transparent",
  fontFamily: "inherit",

  // Core (flowchart, sequence, class diagrams)
  primaryColor: "#fdf6ee",
  primaryTextColor: "#2b180a",
  primaryBorderColor: "#2b180a",
  secondaryColor: "#f0e6dc",
  secondaryTextColor: "#2b180a",
  secondaryBorderColor: "#2b180a",
  tertiaryColor: "#fdf6ee",
  tertiaryTextColor: "#2b180a",
  tertiaryBorderColor: "#2b180a",
  lineColor: "#2b180a",
  textColor: "#2b180a",
  mainBkg: "#fdf6ee",
  nodeBorder: "#2b180a",
  nodeTextColor: "#2b180a",

  // Subgraphs / clusters
  clusterBkg: "#f0e6dc",
  clusterBorder: "#2b180a",

  // Edge labels
  edgeLabelBackground: "#fdf6ee",
  labelTextColor: "#2b180a",
  labelBoxBkgColor: "#fdf6ee",
  labelBoxBorderColor: "#2b180a",

  // Sequence diagrams
  actorBkg: "#fdf6ee",
  actorBorder: "#2b180a",
  actorTextColor: "#2b180a",
  actorLineColor: "#2b180a",
  signalColor: "#2b180a",
  signalTextColor: "#2b180a",
  loopTextColor: "#2b180a",
  noteBkgColor: "#f0e6dc",
  noteBorderColor: "#2b180a",
  noteTextColor: "#2b180a",
  activationBkgColor: "#fdf6ee",
  activationBorderColor: "#2b180a",
  sequenceNumberColor: "#fdf6ee",

  // Pie palette — Burnt Umber accent + Delphi neutrals.
  pie1: "#3e2407",
  pie2: "#94877c",
  pie3: "#7f6e60",
  pie4: "#a99d93",
  pie5: "#f65726",
  pie6: "#2b180a",
  pie7: "#f0e6dc",
  pieTitleTextColor: "#2b180a",
  pieSectionTextColor: "#fdf6ee",
  pieLegendTextColor: "#2b180a",
  pieStrokeColor: "#2b180a",
  pieOuterStrokeColor: "#2b180a",

  // cScale — mindmap/timeline level colors. The first tier must be
  // visibly distinct from the page background (#fdf6ee Parchment) — using
  // Cloud Fog #f0e6dc here causes timeline section blocks to disappear
  // into the page. Starting at a deeper tan and stepping down keeps every
  // section / level / period readable. cScaleLabel pairs ensure text
  // contrast: dark on the lighter tans, cream on the deeper cocoa/cognac
  // tiers.
  cScale0: "#e0cdb2",
  cScale1: "#c8b59c",
  cScale2: "#b09e88",
  cScale3: "#94877c",
  cScale4: "#7f6e60",
  cScale5: "#5a4734",
  cScale6: "#3e2407",
  cScale7: "#2b180a",
  cScaleLabel0: "#2b180a",
  cScaleLabel1: "#2b180a",
  cScaleLabel2: "#fdf6ee",
  cScaleLabel3: "#fdf6ee",
  cScaleLabel4: "#fdf6ee",
  cScaleLabel5: "#fdf6ee",
  cScaleLabel6: "#fdf6ee",
  cScaleLabel7: "#fdf6ee",

  // Timeline-specific peers — used for the bordered event boxes that hang
  // off each section. Default mermaid uses cScalePeer with low contrast on
  // light themes, so explicitly set parchment cards with cognac borders.
  cScalePeer0: "#fdf6ee",
  cScalePeer1: "#fdf6ee",
  cScalePeer2: "#fdf6ee",
  cScalePeer3: "#fdf6ee",
  cScalePeer4: "#fdf6ee",
  cScalePeer5: "#fdf6ee",
  cScalePeer6: "#fdf6ee",
  cScalePeer7: "#fdf6ee",

  // xychart-beta uses its own nested theme block. Delphi colors for
  // axis/title/plot so charts read on the warm parchment background.
  xyChart: {
    backgroundColor: "transparent",
    titleColor: "#2b180a",
    xAxisLabelColor: "#2b180a",
    xAxisTitleColor: "#2b180a",
    xAxisTickColor: "#2b180a",
    xAxisLineColor: "#2b180a",
    yAxisLabelColor: "#2b180a",
    yAxisTitleColor: "#2b180a",
    yAxisTickColor: "#2b180a",
    yAxisLineColor: "#2b180a",
    plotColorPalette: "#3e2407, #94877c, #7f6e60, #a99d93, #f65726, #2b180a",
  },
};

/*
 * Strip color overrides agents are forbidden from emitting (see SKILL.md):
 *   - `style NodeId fill:#xxx,...` lines that paint nodes off-palette
 *   - `%%{init: {...}}%%` blocks that swap the theme out from under us
 *
 * `classDef accent fill:#032F62,stroke:#000000,color:#ffffff` is the one
 * sanctioned highlight, so `classDef`/`class` lines are preserved.
 */
function stripColorOverrides(chart: string): string {
  return chart
    .replace(/%%\{\s*init\s*:[\s\S]*?\}%%/g, "")
    .split("\n")
    .filter((line) => !/^\s*style\s+\S+\s+/i.test(line))
    .join("\n")
    // Rewrite the previous cobalt accent literal (#0058fe) to the current
    // dark-navy (#032F62). Old rendered pages and any agent muscle memory
    // for the old token keep rendering on-palette without re-running the
    // render-html skill.
    .replace(/#0058fe\b/gi, "#032F62");
}

function useIsVisible(ref: React.RefObject<HTMLDivElement | null>) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        setIsIntersecting(true);
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return isIntersecting;
}

export function Mermaid({ chart }: { chart: string }) {
  const id = useId();
  const [svg, setSvg] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisible = useIsVisible(containerRef);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;

    (async () => {
      const { default: mermaid } = await import("mermaid");
      // Renderer choice: dagre.
      //
      // ELK (@mermaid-js/layout-elk) gives nicer layout for dense multi-rank
      // flowcharts in principle, but under Next.js dev mode it throws
      // "Converting circular structure to JSON" on EVERY flowchart — React
      // attaches fiber refs to the DOM elements ELK serializes during
      // measurement, and its internal JSON.stringify chokes. Reproduces on
      // the simplest `A --> B` chart with the ELK layout loader registered.
      // Dagre renders the same charts without issue, so it's the default
      // here. Mindmaps / sequence / state / class diagrams use their own
      // renderers and are unaffected.
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "inherit",
        theme: "base",
        themeVariables: MERMAID_THEME_VARIABLES,
        themeCSS: "margin: 1.5rem auto 0;",
        flowchart: {
          nodeSpacing: 60,
          rankSpacing: 80,
          diagramPadding: 12,
          defaultRenderer: "dagre-wrapper",
          htmlLabels: true,
          curve: "basis",
        },
      });
      try {
        // The remark plugin encodes the source as `b64:<base64>` so MDX
        // attribute serialization stays opaque ASCII (no newlines, quotes,
        // or escape sequences for JSX/JSON to mangle). Decode here.
        const decoded = chart.startsWith("b64:")
          ? new TextDecoder().decode(
              Uint8Array.from(atob(chart.slice(4)), (c) => c.charCodeAt(0)),
            )
          : chart.replaceAll("\\n", "\n");
        const { svg: rendered } = await mermaid.render(
          id.replaceAll(":", ""),
          stripColorOverrides(decoded),
          containerRef.current ?? undefined,
        );
        if (!cancelled) setSvg(rendered);
      } catch (error) {
        // Avoid logging the full error object — its React fiber refs cause
        // a "Converting circular structure to JSON" crash in dev overlay.
        console.error(
          "Error while rendering mermaid:",
          (error as Error)?.message ?? String(error),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, isVisible, id]);

  return jsx("div", { ref: containerRef, dangerouslySetInnerHTML: { __html: svg } });
}
