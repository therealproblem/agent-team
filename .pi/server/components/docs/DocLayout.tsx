import type { ReactNode } from "react";
import { Toc } from "@/components/docs/Toc";
import { MobileTocSheet } from "@/components/docs/MobileTocSheet";
import { PartsNav, parsePartsFromFrontmatter } from "@/components/docs/PartsNav";
import { MermaidErrorToast } from "@/components/docs/MermaidErrorToast";
import type { TocEntry } from "@/lib/toc";

interface DocLayoutProps {
  children: ReactNode;
  toc: TocEntry[];
  frontmatter?: Record<string, unknown>;
}

/*
 * Two-column layout for MDX renders. The site header lives in the root
 * app/layout.tsx — this component just owns the in-page chrome (TOC + prose).
 *
 *   Desktop (≥ md): TOC on the left, content centred (max-w-3xl).
 *   Mobile (< md): TOC behind a top-left hamburger Sheet; content full-width.
 *
 * Single-page renders are URL-only with no cross-document nav. Multi-part
 * renders (written by `write_html_render_multipart`) carry a `parts` array
 * in their frontmatter; when present, a "Parts" nav block is hoisted above
 * the on-page TOC in both the desktop sidebar and the mobile sheet so
 * readers can jump between siblings.
 */
export function DocLayout({ children, toc, frontmatter }: DocLayoutProps) {
  // Hoist the frontmatter title into a real <h1> at the top of the article.
  // Agents put the title in frontmatter only — their body starts at `##`.
  // Without this, the first visible heading is an h2, which is wrong for
  // accessibility (one h1 per document) and SEO. The TOC builds from `##+`
  // so this h1 is intentionally outside its scope.
  const title = typeof frontmatter?.title === "string" ? frontmatter.title : null;
  const { parts, currentSlug } = parsePartsFromFrontmatter(frontmatter);
  return (
    <>
      <MobileTocSheet entries={toc} parts={parts} currentSlug={currentSlug} />
      <MermaidErrorToast />
      <div className="mx-auto flex max-w-6xl gap-10 px-4 py-8 md:px-6 md:py-12">
        <aside className="hidden lg:block lg:w-56 lg:shrink-0 -my-8 lg:-my-12">
          <div className="scrollbar-hide sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto pr-2 py-6">
            <PartsNav parts={parts} currentSlug={currentSlug} />
            <Toc entries={toc} />
          </div>
        </aside>
        <article className="min-w-0 flex-1 max-w-3xl mx-auto lg:mx-0 w-full overflow-x-hidden">
          {title ? (
            <h1 className="font-serif font-light text-[40px] leading-[1.15] tracking-[-0.8px] text-foreground mb-10 mt-0">
              {title}
            </h1>
          ) : null}
          {children}
        </article>
      </div>
    </>
  );
}
