import { cn } from "@/lib/utils";
import type { TocEntry } from "@/lib/toc";

interface TocProps {
  entries: TocEntry[];
  className?: string;
}

/*
 * Static TOC. Skips h1 (the page title) and applies a typographic hierarchy
 * by heading depth so h2 vs h3 vs h4+ are visually distinguishable beyond
 * indent alone — h2 are bold section anchors in Deep Cognac, h3 are softer
 * subsections in Pressed Cacao, h4+ are tertiary muted entries.
 *
 * No active-link tracking — would need client-side IntersectionObserver,
 * deliberately deferred until requested.
 */
export function Toc({ entries, className }: TocProps) {
  const items = entries.filter((e) => e.depth >= 2 && e.depth <= 3);
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Table of contents"
      className={cn("font-sans", className)}
    >
      <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        On this page
      </p>
      <ul>
        {items.map((entry, i) => (
          <li
            key={`${entry.id}-${i}`}
            className={cn(
              // Depth-based hierarchy. Each step down:
              //   • smaller font size
              //   • lighter weight
              //   • softer color
              //   • tighter top margin (groups visually under its parent)
              //   • deeper indent
              entry.depth === 2 &&
                "mt-3 first:mt-0 text-[14px] leading-[1.4] font-medium text-foreground",
              entry.depth === 3 &&
                "mt-1.5 pl-3 text-[13px] leading-[1.4] font-normal text-[color:var(--color-pressed-cacao)]",
              entry.depth >= 4 &&
                "mt-1 text-[12px] leading-[1.4] font-normal text-muted-foreground",
            )}
            style={
              entry.depth >= 4
                ? { paddingLeft: `${(entry.depth - 2) * 0.75}rem` }
                : undefined
            }
          >
            <a
              href={`#${entry.id}`}
              className="block hover:text-[color:var(--color-burnt-umber)] transition-colors"
            >
              {entry.value}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
