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
// white nodes, black borders/text/edges, cobalt accent for charts.
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

  // Pie / xychart bar palette — cobalt accent + neutrals.
  pie1: "#0058fe",
  pie2: "#000000",
  pie3: "#7b7f83",
  pie4: "#ffffff",
  pieTitleTextColor: "#000000",
  pieSectionTextColor: "#000000",
  pieLegendTextColor: "#000000",
  pieStrokeColor: "#000000",
  pieOuterStrokeColor: "#000000",

  // xychart-beta picks up cScale*
  cScale0: "#0058fe",
  cScale1: "#000000",
  cScale2: "#7b7f83",
};

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
          chart.replaceAll("\\n", "\n"),
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
