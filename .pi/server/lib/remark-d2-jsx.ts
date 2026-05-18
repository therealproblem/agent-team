import { visit } from "unist-util-visit";
import { D2 } from "@terrastruct/d2";

/*
 * Renders fenced ```d2``` code blocks to inline SVG at MDX compile time.
 *
 * Unlike the mermaid pipeline (which ships JS to the client and renders in
 * useEffect), D2 is Go-native shipped as WASM here. The strength of D2 is
 * its layout engine — we run it once during MDX compile and embed the
 * resulting SVG directly, so:
 *   - no D2 runtime in the client bundle
 *   - no late-paint / FOUC
 *   - layout uses ELK (D2's recommended engine for graph-style diagrams),
 *     which is the whole reason we reached for D2 over mermaid
 *
 * Authors must NOT ship `vars: { d2-config: { theme-overrides: ... } }`
 * blocks of their own — the parchment palette below is enforced via a
 * prepended config block on every compile.
 */

// Delphi tokens → D2 theme-overrides. Cognac-Stained Parchment look:
// parchment-cream fills, deep-cognac borders/text, Burnt Umber accent.
// Mirrors the MERMAID_THEME_VARIABLES palette in components/docs/Mermaid.tsx
// so both engines render in the same colors.
const D2_THEME_PRELUDE = `vars: {
  d2-config: {
    theme-overrides: {
      B1: "#2b180a"
      B2: "#3e2407"
      B3: "#5a4734"
      B4: "#7f6e60"
      B5: "#a99d93"
      B6: "#fdf6ee"
      AA2: "#f65726"
      AA4: "#f0e6dc"
      AA5: "#fdf6ee"
      AB4: "#f0e6dc"
      AB5: "#fdf6ee"
      N1: "#2b180a"
      N2: "#3e2407"
      N3: "#5a4734"
      N4: "#7f6e60"
      N5: "#94877c"
      N6: "#c8b59c"
      N7: "#fdf6ee"
    }
  }
}
`;

// One D2 instance per process. The WASM module is initialized lazily on
// first compile and reused for every subsequent diagram.
let d2Singleton: D2 | null = null;
function getD2(): D2 {
  if (d2Singleton == null) d2Singleton = new D2();
  return d2Singleton;
}

// Cache compiled SVGs by source so repeated renders of the same MDX page
// (common under next-mdx-remote/rsc with no per-page memoization) don't pay
// the WASM compile cost more than once per process per diagram.
const svgCache = new Map<string, string>();

// Mutex. The @terrastruct/d2 worker layer stores `currentResolve` /
// `currentReject` on the D2 instance, so two concurrent compile/render
// calls overwrite each other's continuations and the wrong worker reply
// gets routed to the wrong caller (manifests as `render()` returning a
// CompileResponse-shaped object instead of an SVG string). Serialize.
let d2Queue: Promise<unknown> = Promise.resolve();
function withD2Lock<T>(work: () => Promise<T>): Promise<T> {
  const next = d2Queue.then(work, work);
  d2Queue = next.catch(() => undefined);
  return next;
}

async function renderD2(source: string): Promise<string> {
  const cached = svgCache.get(source);
  if (cached != null) return cached;

  const svg = await withD2Lock(async () => {
    const cachedInside = svgCache.get(source);
    if (cachedInside != null) return cachedInside;
    const d2 = getD2();
    const withTheme = D2_THEME_PRELUDE + source;
    // Use the structured CompileRequest form. The string-input overload's
    // second argument is typed as `Omit<CompileRequest, "fs">` (so it
    // expects `{ options: {...} }`), even though the runtime accepts a
    // flat options object too — pass the explicit shape to keep tsc happy.
    const result = await d2.compile({
      fs: { index: withTheme },
      options: {
        layout: "elk",
        themeID: 0,
        pad: 20,
        center: true,
        noXMLTag: true,
      },
    });
    const out = await d2.render(result.diagram, result.renderOptions);
    if (typeof out !== "string") {
      throw new Error(
        `d2.render returned ${typeof out} — concurrent call bug?`,
      );
    }
    // D2's outer <svg> wrapper has only viewBox, no width/height. CSS
    // `width: auto` then fills the column and `height: auto` blows the
    // diagram up to several thousand pixels tall. Bake natural pixel
    // dimensions from viewBox onto the outer SVG so it renders at its
    // intrinsic size and only scales DOWN via `max-width: 100%`.
    const sized = sizeOuterSvg(out);
    svgCache.set(source, sized);
    return sized;
  });

  return svg;
}

function sizeOuterSvg(svg: string): string {
  const m = svg.match(/^(\s*<svg\b)([^>]*)>/);
  if (!m) return svg;
  const [full, open, attrs] = m;
  if (/\bwidth\s*=/.test(attrs) || /\bheight\s*=/.test(attrs)) return svg;
  const vb = attrs.match(/\bviewBox\s*=\s*"([^"]+)"/);
  if (!vb) return svg;
  const parts = vb[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return svg;
  const w = parts[2];
  const h = parts[3];
  return svg.replace(
    full,
    `${open}${attrs} width="${w}" height="${h}">`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function errorBlock(message: string, source: string): string {
  return (
    `<div class="d2-error" role="alert">` +
    `<strong>D2 render failed:</strong> ${escapeHtml(message)}` +
    `<pre><code>${escapeHtml(source)}</code></pre>` +
    `</div>`
  );
}

export function remarkD2Jsx() {
  return async (tree: any) => {
    const matches: { node: any; index: number; parent: any }[] = [];
    visit(tree, "code", (node: any, index: number | null, parent: any) => {
      if (node.lang !== "d2" || index == null || !parent) return;
      matches.push({ node, index, parent });
    });
    if (matches.length === 0) return;

    await Promise.all(
      matches.map(async ({ node, index, parent }) => {
        const source = node.value as string;
        let payload: string;
        let attrName: "svg" | "error";
        try {
          payload = await renderD2(source);
          attrName = "svg";
        } catch (error) {
          const message =
            typeof error === "string"
              ? error
              : ((error as Error)?.message ?? JSON.stringify(error));
          payload = errorBlock(String(message), source);
          attrName = "error";
        }
        // Emit an MDX JSX flow element rather than a raw `html` node.
        // `next-mdx-remote/rsc` runs without rehype-raw and rejects unknown
        // mdast `raw` nodes during compile ("Cannot handle unknown node
        // `raw`"). The `<D2>` component (registered in mdx-components) just
        // injects the pre-rendered SVG via dangerouslySetInnerHTML.
        //
        // Base64-encoded so the JSX attribute serialization stays opaque
        // ASCII (SVG contains `<`, `>`, `"`, and newlines that would
        // otherwise need careful escaping for JSX). Same trick the mermaid
        // pipeline uses.
        parent.children[index] = {
          type: "mdxJsxFlowElement",
          name: "D2",
          attributes: [
            {
              type: "mdxJsxAttribute",
              name: attrName,
              value:
                "b64:" + Buffer.from(payload, "utf8").toString("base64"),
            },
          ],
          children: [],
        };
      }),
    );
  };
}
