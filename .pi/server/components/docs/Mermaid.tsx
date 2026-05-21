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

import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { MermaidLightbox } from "./MermaidLightbox";

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

export function Mermaid({
  chart,
  chartNumber: chartNumberRaw,
}: {
  chart: string;
  // The remark plugin emits this as a string attribute (see
  // remark-mermaid-jsx.ts for why), so accept either shape and coerce to a
  // 1-based integer below.
  chartNumber?: number | string;
}) {
  const chartNumber =
    typeof chartNumberRaw === "string"
      ? Number.parseInt(chartNumberRaw, 10)
      : chartNumberRaw;
  const id = useId();
  const [svg, setSvg] = useState("");
  // `failed` flips on when mermaid.render() throws, which lights up the
  // Fix-syntax button below the chart. Reset whenever the source changes so
  // a redrawn (or successfully repaired) chart starts from a clean slate.
  const [failed, setFailed] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  // After a successful fix, the route returns the repaired Mermaid source.
  // We keep it in local state and re-render in-place so the user sees the
  // fixed diagram immediately — without a full page refresh. The `.mdx` on
  // disk is rewritten by the route, so any subsequent reload still gets the
  // fixed version.
  const [overrideSource, setOverrideSource] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Separate target for mermaid.render's temporary measurement DOM.
  // Keeping it off the React-managed outer container avoids reconciliation
  // races when mermaid attaches and detaches its own nodes.
  const renderTargetRef = useRef<HTMLDivElement | null>(null);
  // Counter bumped on every render attempt — mermaid stamps each rendered
  // <svg> with the id we pass and leaves a `<style id="mermaid-svg-{id}">`
  // in the document. Calling render() twice with the same id collides and
  // throws, which would land in our catch and blank the chart. Combine the
  // stable React id with this monotonically-increasing suffix so successive
  // attempts (e.g. after a fix-driven overrideSource swap, or a Next.js HMR
  // refresh) each get a fresh id.
  const renderAttemptRef = useRef(0);
  const isVisible = useIsVisible(containerRef);

  // Whenever the upstream chart source changes (RSC re-render with a fresh
  // `chart` prop), wipe the override and failure state so the new source is
  // rendered cleanly. The render effect below depends on overrideSource too,
  // so a fix-driven override drives a re-render the same way a prop change
  // would.
  useEffect(() => {
    setOverrideSource(null);
    setFailed(false);
    setFixError(null);
  }, [chart]);

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
        // themeCSS is injected *inside* the rendered SVG as a <style> block,
        // so it styles the diagram's internal nodes — not the <svg> element
        // itself. SVG sizing happens on the wrapper div (see the `className`
        // on renderTarget below). Leave themeCSS empty for now.
        themeCSS: "",
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
        // A local `overrideSource` (set by a successful fix) takes precedence
        // over the prop so we re-render in place without a page refresh.
        const decoded =
          overrideSource ??
          (chart.startsWith("b64:")
            ? new TextDecoder().decode(
                Uint8Array.from(atob(chart.slice(4)), (c) => c.charCodeAt(0)),
              )
            : chart.replaceAll("\\n", "\n"));
        renderAttemptRef.current += 1;
        const renderId = `${id.replaceAll(":", "")}-${renderAttemptRef.current}`;
        const { svg: rendered } = await mermaid.render(
          renderId,
          stripColorOverrides(decoded),
          renderTargetRef.current ?? undefined,
        );
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch (error) {
        // Avoid logging the full error object — its React fiber refs cause
        // a "Converting circular structure to JSON" crash in dev overlay.
        console.error(
          "Error while rendering mermaid:",
          (error as Error)?.message ?? String(error),
        );
        if (!cancelled) {
          setSvg("");
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, overrideSource, isVisible, id]);

  async function handleFixClick() {
    if (fixing) return;
    setFixing(true);
    setFixError(null);
    try {
      // Slug is the last path segment of the current URL — pages live at
      // /v/<slug>, so window.location.pathname has the form "/v/<slug>".
      const segments = window.location.pathname.split("/").filter(Boolean);
      const slug = segments[segments.length - 1];
      // The "original" we send to the route is whatever we tried to render
      // most recently — i.e. the current overrideSource if a previous fix
      // produced one, otherwise the decoded prop. The route uses this to
      // verify the chart on disk hasn't drifted in the meantime.
      const original =
        overrideSource ??
        (chart.startsWith("b64:")
          ? new TextDecoder().decode(
              Uint8Array.from(atob(chart.slice(4)), (c) => c.charCodeAt(0)),
            )
          : chart.replaceAll("\\n", "\n"));
      const res = await fetch("/api/fix-mermaid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, chartNumber, original }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fixed?: string;
      };
      if (!res.ok || typeof data.fixed !== "string") {
        setFixError(data.error ?? `request failed (${res.status})`);
        return;
      }
      // Drive the re-render via overrideSource — the render effect picks it
      // up and re-runs mermaid.render() against the repaired source. The
      // `.mdx` on disk has already been rewritten by the route, so a full
      // page reload would show the same result, but skipping the reload
      // keeps the user's scroll position and avoids reflowing siblings.
      setOverrideSource(data.fixed);
    } catch (e) {
      setFixError((e as Error).message);
    } finally {
      setFixing(false);
    }
  }

  // Cross-component coordination for the page-level toast. Each Mermaid
  // emits a "set" event when it enters the failed state and a paired "clear"
  // event when it leaves it (either because a fix succeeded, the source
  // changed, or the component unmounted). The toast aggregator subscribes
  // to both and shows a single aggregate banner with a "Fix all" button.
  useEffect(() => {
    if (!chartNumber || !failed) return;
    window.dispatchEvent(
      new CustomEvent("mermaid-error:set", { detail: { chartNumber } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("mermaid-error:clear", { detail: { chartNumber } }),
      );
    };
  }, [failed, chartNumber]);

  useEffect(() => {
    if (!chartNumber) return;
    const onFix = (e: Event) => {
      const detail = (e as CustomEvent<{ chartNumber?: number }>).detail;
      if (detail?.chartNumber === chartNumber && failed && !fixing) {
        void handleFixClick();
      }
    };
    window.addEventListener("mermaid-error:fix", onFix);
    return () => window.removeEventListener("mermaid-error:fix", onFix);
    // handleFixClick is intentionally not listed — we read `failed` /
    // `fixing` to gate it, and a stable reference would force re-binding the
    // listener on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartNumber, failed, fixing, overrideSource]);

  // Only let the chart open the lightbox once it has actually rendered —
  // clicking a blank placeholder before mermaid finishes would show an empty
  // viewer. `failed` charts also stay non-clickable; their affordance is the
  // Fix-syntax button below.
  const canExpand = Boolean(svg) && !failed;

  // True from mount until the first successful mermaid.render() (or until
  // the chart enters the failed state). Covers both the "scrolled into view,
  // mermaid is computing layout" gap and the longer "below the fold, waiting
  // for IntersectionObserver" idle. Keeping the same placeholder for both
  // states avoids a flash on fast renders and reserves vertical space so the
  // article doesn't reflow under the reader when the SVG finally arrives.
  const isLoading = !svg && !failed;

  // The mermaid SVG is injected via dangerouslySetInnerHTML, so it needs
  // its own dedicated wrapper. The outer div is a centered flex column so
  // the SVG, caption, and Fix-syntax button line up under each other and
  // each chart sits centered within the article column regardless of the
  // SVG's natural width. Order: loading placeholder (while pending), then
  // diagram, then caption, then (when broken) the per-chart Fix button.
  return jsxs("div", {
    ref: containerRef,
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      marginTop: "1.5rem",
    },
    children: [
      isLoading
        ? jsxs(
            "div",
            {
              role: "status",
              "aria-live": "polite",
              style: {
                width: "100%",
                minHeight: "120px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                color: "#7f6e60",
                fontSize: "0.75rem",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                letterSpacing: "0.05em",
              },
              children: [
                jsx(
                  Loader2,
                  {
                    size: 14,
                    className: "animate-spin",
                    "aria-hidden": true,
                  },
                  "spinner",
                ),
                jsx(
                  "span",
                  {
                    children: chartNumber
                      ? `Rendering chart ${chartNumber}…`
                      : "Rendering chart…",
                  },
                  "label",
                ),
              ],
            },
            "loading",
          )
        : null,
      jsx(
        "div",
        {
          ref: renderTargetRef,
          // `[&>svg]:` forces the injected SVG to span the wrapper's full
          // width with proportional height. We can't put these rules in
          // mermaid's `themeCSS` because that block is injected inside the
          // SVG (it styles the SVG's *contents*, not the SVG element).
          // `group` + cursor / role attrs make the rendered diagram act as a
          // button that opens the zoom-and-pan lightbox; `tabindex`/keyboard
          // handlers cover keyboard activation since this isn't a real
          // <button> (a <button> would strip the SVG's intrinsic semantics).
          //
          // `data-mermaid-svg` marks this as a Mermaid render target so
          // globals.css can re-paint edge strokes / arrowheads for dark
          // mode (Mermaid bakes lineColor as inline `stroke="#2b180a"`
          // which collapses to ~0 contrast on the dark page bg).
          className:
            "group relative w-full [&>svg]:block [&>svg]:mx-auto [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-full" +
            (canExpand ? " cursor-zoom-in" : ""),
          "data-mermaid-svg": "",
          dangerouslySetInnerHTML: { __html: svg },
          role: canExpand ? "button" : undefined,
          tabIndex: canExpand ? 0 : undefined,
          "aria-label": canExpand
            ? chartNumber
              ? `Open chart ${chartNumber} in viewer`
              : "Open chart in viewer"
            : undefined,
          onClick: canExpand ? () => setLightboxOpen(true) : undefined,
          onKeyDown: canExpand
            ? (e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setLightboxOpen(true);
                }
              }
            : undefined,
        },
        "svg",
      ),
      // Only mount the lightbox while it's open so a fresh mount runs each
      // time the user clicks — that's what guarantees view state (scale, tx,
      // ty) starts at INITIAL_VIEW with no one-frame flash of the previous
      // session's zoom. A persistent mount with internal `if (!open) return
      // null` would carry stale state across opens.
      canExpand && lightboxOpen
        ? jsx(
            MermaidLightbox,
            {
              open: true,
              onClose: () => setLightboxOpen(false),
              svg,
              caption: chartNumber ? `Chart ${chartNumber}` : undefined,
            },
            "lightbox",
          )
        : null,
      chartNumber
        ? jsx(
            "div",
            {
              "aria-hidden": true,
              style: {
                fontSize: "0.75rem",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                color: "#7f6e60",
                marginTop: "1rem",
                textAlign: "center",
                letterSpacing: "0.05em",
              },
              children: `Chart ${chartNumber}`,
            },
            "label",
          )
        : null,
      failed
        ? jsxs(
            "div",
            {
              style: {
                marginTop: "0.75rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
              },
              children: [
                jsx(
                  "button",
                  {
                    type: "button",
                    onClick: handleFixClick,
                    disabled: fixing,
                    style: {
                      fontSize: "0.8125rem",
                      fontFamily: "inherit",
                      padding: "0.375rem 0.875rem",
                      borderRadius: "6px",
                      border: "1px solid #2b180a",
                      background: fixing ? "#f0e6dc" : "#fdf6ee",
                      color: "#2b180a",
                      cursor: fixing ? "wait" : "pointer",
                      letterSpacing: "0.02em",
                    },
                    children: fixing ? "Fixing…" : "Fix syntax",
                  },
                  "btn",
                ),
                fixError
                  ? jsx(
                      "div",
                      {
                        role: "alert",
                        style: {
                          fontSize: "0.75rem",
                          color: "#7a2a0a",
                          maxWidth: "32rem",
                          textAlign: "center",
                        },
                        children: fixError,
                      },
                      "err",
                    )
                  : null,
              ],
            },
            "fix",
          )
        : null,
    ],
  });
}
