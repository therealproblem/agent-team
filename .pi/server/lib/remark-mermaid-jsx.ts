import { visit } from "unist-util-visit";

/*
 * Rewrites fenced ```mermaid``` code blocks into MDX JSX nodes
 * `<Mermaid chart="…" />`. The component is supplied via the `components`
 * map passed to MDXRemote, so no ESM import statement is emitted — which
 * matters because next-mdx-remote compiles MDX at request time and won't
 * see webpack aliases. Replaces `@theguild/remark-mermaid` for this
 * pipeline.
 */
export function remarkMermaidJsx() {
  return (tree: any) => {
    visit(tree, "code", (node: any, index: number | null, parent: any) => {
      if (node.lang !== "mermaid" || index == null || !parent) return;
      parent.children[index] = {
        type: "mdxJsxFlowElement",
        name: "Mermaid",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "chart",
            // Encode the chart as base64 so the JSX attribute serialization
            // is opaque ASCII with no newlines, quotes, or escape sequences
            // for MDX/JSX/React to mangle. The Mermaid component detects
            // and decodes the `b64:` prefix.
            value:
              "b64:" +
              Buffer.from(node.value as string, "utf8").toString("base64"),
          },
        ],
        children: [],
      };
    });
  };
}
