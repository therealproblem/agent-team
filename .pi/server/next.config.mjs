import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Don't leak local filesystem paths in production source maps.
  productionBrowserSourceMaps: false,
  // Alias `@theguild/remark-mermaid/mermaid` → our local component so any
  // legacy import path still resolves to the DESIGN-2-themed Mermaid
  // renderer. The new MDX pipeline (remark-mermaid-jsx + mdx-components)
  // injects the component directly and doesn't rely on this alias, but
  // keeping it makes the resolver stable for stray code paths.
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@theguild/remark-mermaid/mermaid": resolve(
        __dirname,
        "components/docs/Mermaid.tsx",
      ),
    };
    return config;
  },
};
