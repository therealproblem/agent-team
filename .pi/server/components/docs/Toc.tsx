"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { TocEntry } from "@/lib/toc";

interface TocProps {
  entries: TocEntry[];
  className?: string;
}

// Headings whose top edge has crossed this many pixels below the viewport
// top count as "passed" — the deepest passed heading is the active section.
// Chosen so a heading registers as active a beat *before* it pins to the
// header, which feels more natural than waiting until it scrolls fully past.
const TRIGGER_OFFSET_PX = 120;

/*
 * Live TOC with a scroll-position indicator.
 *
 * On every scroll/resize (RAF-throttled), we compute which heading on the
 * page is currently active — defined as the *last* TOC-tracked heading
 * whose top edge sits at or above TRIGGER_OFFSET_PX from the viewport top.
 * That entry gets the burnt-umber accent color and a left bar; the rest
 * keep the depth-based hierarchy from the original static component.
 *
 * Why a scroll handler instead of IntersectionObserver:
 *   The "deepest heading above the line" semantic requires comparing
 *   relative positions across all tracked headings on every update, which
 *   IO doesn't give you cleanly without re-deriving the position anyway.
 *   getBoundingClientRect on ~15 headings inside a RAF tick is well below
 *   1 ms; no measurable cost.
 *
 * Skips h1 (page title) and h4+; honors h2 + h3 the way the static
 * component did.
 */
export function Toc({ entries, className }: TocProps) {
  const items = entries.filter((e) => e.depth >= 2 && e.depth <= 3);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    const ids = items.map((i) => i.id);

    function computeActive() {
      let active: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= TRIGGER_OFFSET_PX) {
          active = id;
        } else {
          break;
        }
      }
      // Before the first heading reaches the trigger line, highlight the
      // first entry so the panel never reads as "nothing selected."
      setActiveId(active ?? ids[0] ?? null);
    }

    computeActive();

    let rafId: number | null = null;
    function schedule() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        computeActive();
      });
    }

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // `entries` is server-rendered per page and stable across re-renders of
    // this component, so depending on it is safe. We don't depend on `items`
    // because it's re-derived on every render (new array reference).
  }, [entries]);

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
        {items.map((entry, i) => {
          const active = entry.id === activeId;
          return (
            <li
              key={`${entry.id}-${i}`}
              className={cn(
                "relative",
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
              {/* Left indicator bar — fades in for the active entry. Positioned
                  on the li (not the anchor) so it sits at a consistent x
                  regardless of h2/h3 indent. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute left-[-10px] top-1/2 h-[1.1em] w-[2px] -translate-y-1/2 rounded-full bg-[color:var(--color-burnt-umber)] transition-opacity duration-150",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              <a
                href={`#${entry.id}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "block transition-colors",
                  active
                    ? "text-[color:var(--color-burnt-umber)] font-medium"
                    : "hover:text-[color:var(--color-burnt-umber)]",
                )}
              >
                {entry.value}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
