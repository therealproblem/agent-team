/*
 * Server component that renders SVG pre-built by remark-d2-jsx at MDX
 * compile time. No client JS, no hooks — D2 is rendered once on the server
 * and the SVG is embedded directly in the page response.
 *
 * Why a wrapper instead of emitting raw HTML from the remark plugin:
 * next-mdx-remote/rsc doesn't run rehype-raw, so a plain `html` mdast node
 * fails compile with "Cannot handle unknown node `raw`". Emitting an MDX
 * JSX element that resolves to this component sidesteps that entirely.
 */

function decode(value: string): string {
  if (!value.startsWith("b64:")) return value;
  return Buffer.from(value.slice(4), "base64").toString("utf8");
}

export function D2({ svg, error }: { svg?: string; error?: string }) {
  if (error != null) {
    return (
      <div
        className="d2-diagram-error"
        dangerouslySetInnerHTML={{ __html: decode(error) }}
      />
    );
  }
  if (svg == null) return null;
  return (
    <div
      className="d2-diagram"
      dangerouslySetInnerHTML={{ __html: decode(svg) }}
    />
  );
}
