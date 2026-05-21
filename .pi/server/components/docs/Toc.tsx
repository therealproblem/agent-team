"use client";

import { useEffect, useRef, useState } from "react";
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
 * Live TOC with a rail-and-fill scroll-position indicator.
 *
 * On every scroll/resize (RAF-throttled), we compute which heading on the
 * page is currently active — defined as the *last* TOC-tracked heading
 * whose top edge sits at or above TRIGGER_OFFSET_PX from the viewport top.
 *
 * The TOC then renders three stacked left-edge cues so the reader can see
 * position in one glance:
 *   • Rail   — continuous 1px line behind every item, in the muted border
 *              colour. Anchors the eye even when no section is active.
 *   • Fill   — burnt-umber strip from the top of the rail down to the
 *              centre of the active item. Reads as "you've covered this
 *              much of the doc."
 *   • Bar    — 3px burnt-umber bar spanning the full height of the active
 *              item, overlaying the rail/fill. The unambiguous "here."
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
  const [fillHeight, setFillHeight] = useState(0);
  const ulRef = useRef<HTMLUListElement>(null);

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
      const finalId = active ?? ids[0] ?? null;
      setActiveId(finalId);

      // Progress-fill height: top of the ul down to the centre of the
      // active li. Section-granular (not per-pixel) — it jumps when the
      // active section changes, and the CSS transition smooths the jump.
      if (finalId && ulRef.current) {
        const activeLi = ulRef.current.querySelector<HTMLElement>(
          `[data-toc-id="${CSS.escape(finalId)}"]`,
        );
        if (activeLi) {
          const ulTop = ulRef.current.getBoundingClientRect().top;
          const liRect = activeLi.getBoundingClientRect();
          setFillHeight(liRect.top - ulTop + liRect.height / 2);
        }
      }
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
      <ul ref={ulRef} className="relative">
        {/* Continuous rail behind every item. 2px so it reads as a real
            track rather than a hairline; sits behind the bar at the same x. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-[-12px] top-0 bottom-0 w-[2px] rounded-full bg-[color:var(--color-warm-ash)]/60"
        />
        {/* Progress fill — top of the rail down to the centre of the
            active item. Burnt-umber, same 2px width as the rail so the
            covered portion is fully repainted (not a thin stripe over a
            wider track). */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-[-12px] top-0 w-[2px] rounded-full bg-[color:var(--color-burnt-umber)] transition-[height] duration-200 ease-out"
          style={{ height: `${fillHeight}px` }}
        />
        {items.map((entry, i) => {
          const active = entry.id === activeId;
          return (
            <li
              key={`${entry.id}-${i}`}
              data-toc-id={entry.id}
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
              {/* Active background chip — extends past the text on both
                  sides and covers the rail/fill at this segment so the row
                  reads as the "thumb" on the track. Cloud-fog tint
                  contrasts the parchment page background without competing
                  with the burnt-umber bar. Square edges so the chip reads
                  as a continuous band against the rail rather than a
                  detached pill. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -inset-y-1.5 left-[-20px] right-[-10px] transition-colors duration-150",
                  active ? "bg-[color:var(--color-cloud-fog)]" : "bg-transparent",
                )}
              />
              {/* Active bar — 4px wide, full item height, sits on top of
                  the chip and overlays the rail/fill by 1px on each side.
                  Square caps to match the chip's straight edges. */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute left-[-13px] top-0 bottom-0 w-[4px] bg-[color:var(--color-burnt-umber)] transition-opacity duration-150",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              <a
                href={`#${entry.id}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  // pl-2 is always-on (not gated by `active`) so the text
                  // position is stable across activations — no horizontal
                  // jump when scrolling between sections.
                  "relative block pl-2 transition-colors",
                  active
                    ? "text-[color:var(--color-burnt-umber)] font-semibold"
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
