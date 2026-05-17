import GithubSlugger from "github-slugger";

export interface TocEntry {
  depth: number;
  value: string;
  id: string;
}

/*
 * Extract a flat TOC from MDX/Markdown source via regex.
 *
 * We avoid pulling unified/remark just for this — heading lines are stable
 * to identify (`^#{1,6} ` after stripping fenced code blocks and frontmatter)
 * and `github-slugger` matches the IDs that `rehype-slug` produces, so anchor
 * links land on the right element.
 */
export function extractToc(source: string): TocEntry[] {
  let body = source;
  // Strip YAML/TOML frontmatter
  body = body.replace(/^---\n[\s\S]*?\n---\n?/, "");
  body = body.replace(/^\+\+\+\n[\s\S]*?\n\+\+\+\n?/, "");
  // Strip fenced code blocks so `# inside code` isn't mistaken for a heading
  body = body.replace(/```[\s\S]*?```/g, "");
  body = body.replace(/~~~[\s\S]*?~~~/g, "");

  const slugger = new GithubSlugger();
  const entries: TocEntry[] = [];
  const lines = body.split("\n");
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const depth = m[1].length;
    const value = m[2].replace(/`/g, "").trim();
    entries.push({ depth, value, id: slugger.slug(value) });
  }
  return entries;
}
