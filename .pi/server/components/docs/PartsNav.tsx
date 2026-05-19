import { cn } from "@/lib/utils";

export interface PartLink {
  slug: string;
  title: string;
}

interface PartsNavProps {
  parts: PartLink[];
  currentSlug?: string;
  className?: string;
}

/*
 * Sibling-page nav for multi-part renders. Written by
 * `write_html_render_multipart` into each part's frontmatter so the same
 * list can be reconstructed on every part page. Renders above the on-page
 * TOC in both the desktop sidebar and the mobile sheet.
 */
export function PartsNav({ parts, currentSlug, className }: PartsNavProps) {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  return (
    <nav
      aria-label="Document parts"
      className={cn("font-sans mb-6", className)}
    >
      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Parts
      </p>
      <ol className="space-y-1.5">
        {parts.map((p, i) => {
          const active = p.slug === currentSlug;
          return (
            <li
              key={p.slug}
              className={cn(
                "text-[13px] leading-[1.4]",
                active
                  ? "font-medium text-foreground"
                  : "font-normal text-[color:var(--color-pressed-cacao)]",
              )}
            >
              {active ? (
                <span
                  aria-current="page"
                  className="block"
                >
                  <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                  {p.title}
                </span>
              ) : (
                <a
                  href={`/v/${p.slug}`}
                  className="block hover:text-[color:var(--color-burnt-umber)] transition-colors"
                >
                  <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                  {p.title}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function parsePartsFromFrontmatter(
  frontmatter: Record<string, unknown> | undefined,
): { parts: PartLink[]; currentSlug?: string } {
  if (!frontmatter) return { parts: [] };
  const raw = frontmatter.parts;
  const currentSlug =
    typeof frontmatter.part_slug === "string" ? frontmatter.part_slug : undefined;
  if (!Array.isArray(raw)) return { parts: [], currentSlug };
  const parts: PartLink[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as { slug?: unknown }).slug === "string" &&
      typeof (item as { title?: unknown }).title === "string"
    ) {
      parts.push({
        slug: (item as { slug: string }).slug,
        title: (item as { title: string }).title,
      });
    }
  }
  return { parts, currentSlug };
}
