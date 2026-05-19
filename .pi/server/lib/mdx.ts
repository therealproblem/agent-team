import { promises as fs } from "node:fs";
import path from "node:path";
import { compileMDX } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import remarkGfm from "remark-gfm";
import { remarkAlert } from "remark-github-blockquote-alert";
import { remarkMermaidJsx } from "@/lib/remark-mermaid-jsx";
import { mdxComponents } from "@/components/docs/mdx-components";
import { extractToc, type TocEntry } from "@/lib/toc";

export const CONTENT_DIR = path.resolve(process.cwd(), "content");
export const V_DIR = path.join(CONTENT_DIR, "v");

export interface CompiledMdx {
  content: React.ReactNode;
  frontmatter: Record<string, unknown>;
  toc: TocEntry[];
}

export async function readMdxFile(slug: string): Promise<string | null> {
  const file = path.join(V_DIR, `${slug}.mdx`);
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function compileMdxFile(slug: string): Promise<CompiledMdx | null> {
  const raw = await readMdxFile(slug);
  if (raw == null) return null;

  const { content, frontmatter } = await compileMDX<Record<string, unknown>>({
    source: raw,
    components: mdxComponents,
    options: {
      parseFrontmatter: true,
      mdxOptions: {
        remarkPlugins: [remarkGfm, remarkMermaidJsx, remarkAlert],
        rehypePlugins: [
          rehypeSlug,
          [
            rehypePrettyCode,
            {
              theme: "github-light",
              keepBackground: false,
            },
          ],
        ],
      },
    },
  });

  return {
    content,
    frontmatter: frontmatter ?? {},
    toc: extractToc(raw),
  };
}

export async function listMdxSlugs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(V_DIR);
    return entries
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => f.replace(/\.mdx$/, ""));
  } catch {
    return [];
  }
}
