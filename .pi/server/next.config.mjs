import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import nextra from "nextra";
import { remarkMermaid } from "@theguild/remark-mermaid";

const __dirname = dirname(fileURLToPath(import.meta.url));

const withNextra = nextra({
  // Disable Pagefind index build entirely. Hiding the search UI alone leaves
  // /_pagefind/index/... enumerable, defeating URL-secrecy.
  search: false,
  defaultShowCopyCode: true,
  mdxOptions: {
    remarkPlugins: [remarkMermaid],
  },
});

export default withNextra({
  reactStrictMode: true,
  // Don't leak local filesystem paths in production source maps.
  productionBrowserSourceMaps: false,
  // Alias `@theguild/remark-mermaid/mermaid` → our local component so every
  // Mermaid block renders with DESIGN-2 themeVariables (white nodes, black
  // borders, cobalt accent). Upstream component bakes `theme: 'default'`,
  // which has near-zero contrast on parchment.
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@theguild/remark-mermaid/mermaid": resolve(
        __dirname,
        "components/mermaid.tsx",
      ),
    };
    return config;
  },
});
