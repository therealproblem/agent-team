import type { ReactNode } from "react";
import { Toc } from "@/components/docs/Toc";
import { MobileTocSheet } from "@/components/docs/MobileTocSheet";
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
 * Renders are URL-only; there is intentionally no nav between them.
 */
export function DocLayout({ children, toc, frontmatter }: DocLayoutProps) {
  // Hoist the frontmatter title into a real <h1> at the top of the article.
  // Agents put the title in frontmatter only — their body starts at `##`.
  // Without this, the first visible heading is an h2, which is wrong for
  // accessibility (one h1 per document) and SEO. The TOC builds from `##+`
  // so this h1 is intentionally outside its scope.
  const title = typeof frontmatter?.title === "string" ? frontmatter.title : null;
  return (
    <>
      <MobileTocSheet entries={toc} />
      <div className="mx-auto flex max-w-6xl gap-10 px-4 py-8 md:px-6 md:py-12">
        <aside className="hidden md:block md:w-56 md:shrink-0">
          <div className="sticky top-20">
            <Toc entries={toc} />
          </div>
        </aside>
        <article className="min-w-0 flex-1 max-w-3xl mx-auto md:mx-0">
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
