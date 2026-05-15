import nextra from "nextra";
import { remarkMermaid } from "@theguild/remark-mermaid";

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
});
