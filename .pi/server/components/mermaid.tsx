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
 * Agents must NOT emit `style …` overrides or `%%{init}%%` palette
 * blocks in chart source — the defaults below are the palette.
 */

import { jsx } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";

// DESIGN-2 tokens → Mermaid themeVariables. Editorial-parchment look:
// white nodes, black borders/text/edges, dark-navy accent for charts.
const MERMAID_THEME_VARIABLES = {
  background: "transparent",
  fontFamily: "inherit",

  // Core (flowchart, sequence, class diagrams)
  primaryColor: "#ffffff",
  primaryTextColor: "#000000",
  primaryBorderColor: "#000000",
  secondaryColor: "#f1e9e7",
  secondaryTextColor: "#000000",
  secondaryBorderColor: "#000000",
  tertiaryColor: "#ffffff",
  tertiaryTextColor: "#000000",
  tertiaryBorderColor: "#000000",
  lineColor: "#000000",
  textColor: "#000000",
  mainBkg: "#ffffff",
  nodeBorder: "#000000",
  nodeTextColor: "#000000",

  // Subgraphs / clusters
  clusterBkg: "#f1e9e7",
  clusterBorder: "#000000",

  // Edge labels
  edgeLabelBackground: "#f1e9e7",
  labelTextColor: "#000000",
  labelBoxBkgColor: "#ffffff",
  labelBoxBorderColor: "#000000",

  // Sequence diagrams
  actorBkg: "#ffffff",
  actorBorder: "#000000",
  actorTextColor: "#000000",
  actorLineColor: "#000000",
  signalColor: "#000000",
  signalTextColor: "#000000",
  loopTextColor: "#000000",
  noteBkgColor: "#f1e9e7",
  noteBorderColor: "#000000",
  noteTextColor: "#000000",
  activationBkgColor: "#ffffff",
  activationBorderColor: "#000000",
  sequenceNumberColor: "#ffffff",

  // Pie palette — dark-navy accent + neutrals.
  pie1: "#032F62",
  pie2: "#000000",
  pie3: "#7b7f83",
  pie4: "#ffffff",
  pieTitleTextColor: "#000000",
  pieSectionTextColor: "#000000",
  pieLegendTextColor: "#000000",
  pieStrokeColor: "#000000",
  pieOuterStrokeColor: "#000000",

  cScale0: "#032F62",
  cScale1: "#000000",
  cScale2: "#7b7f83",

  // xychart-beta uses its own nested theme block. Without these, bars
  // render in mermaid's default near-invisible cream against parchment.
  xyChart: {
    backgroundColor: "transparent",
    titleColor: "#000000",
    xAxisLabelColor: "#000000",
    xAxisTitleColor: "#000000",
    xAxisTickColor: "#000000",
    xAxisLineColor: "#000000",
    yAxisLabelColor: "#000000",
    yAxisTitleColor: "#000000",
    yAxisTickColor: "#000000",
    yAxisLineColor: "#000000",
    plotColorPalette: "#032F62, #000000, #7b7f83, #ffffff",
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
    // presentation skill.
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
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "inherit",
        theme: "base",
        themeVariables: MERMAID_THEME_VARIABLES,
        themeCSS: "margin: 1.5rem auto 0;",
      });
      try {
        const { svg: rendered } = await mermaid.render(
          id.replaceAll(":", ""),
          stripColorOverrides(chart.replaceAll("\\n", "\n")),
          containerRef.current ?? undefined,
        );
        if (!cancelled) setSvg(rendered);
      } catch (error) {
        console.error("Error while rendering mermaid", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, isVisible, id]);

  return jsx("div", { ref: containerRef, dangerouslySetInnerHTML: { __html: svg } });
}
