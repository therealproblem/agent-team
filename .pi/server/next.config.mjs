import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Don't leak local filesystem paths in production source maps.
  productionBrowserSourceMaps: false,
  // Allow HMR from the public domain in dev mode.
  ...(process.env.NODE_ENV === 'development' && process.env.AGENTS_TEAM_SERVER_PUBLIC_URL
    ? {
        allowedDevOrigins: [
          new URL(process.env.AGENTS_TEAM_SERVER_PUBLIC_URL).origin,
        ],
      }
    : {}),
  // `@terrastruct/d2` ships a 21MB WASM blob + a 100k-line ELK bundle.
  // Letting webpack pull all of that into the server bundle on every dev
  // request takes minutes per page. Externalizing it makes Next.js
  // require() the package from node_modules at runtime — D2's own
  // compile/render then runs in ~25ms per diagram (see scripts/d2-bench.mjs).
  serverExternalPackages: ["@terrastruct/d2"],
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
