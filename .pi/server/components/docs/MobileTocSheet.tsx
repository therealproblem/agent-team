"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Toc } from "@/components/docs/Toc";
import { PartsNav, type PartLink } from "@/components/docs/PartsNav";
import type { TocEntry } from "@/lib/toc";

interface MobileTocSheetProps {
  entries: TocEntry[];
  parts?: PartLink[];
  currentSlug?: string;
}

/*
 * Mobile TOC drawer. The trigger button portals into SiteHeader's left
 * slot (`#site-header-mobile-slot`) so it doesn't overlap the sticky
 * brand text. The sheet itself renders at document root via Radix. For
 * multi-part renders, the same "Parts" nav block shown in the desktop
 * sidebar is hoisted above the TOC inside the sheet.
 */
export function MobileTocSheet({ entries, parts, currentSlug }: MobileTocSheetProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("site-header-mobile-slot"));
  }, []);

  const hasToc = entries.filter((e) => e.depth >= 2).length > 0;
  const hasParts = Array.isArray(parts) && parts.length > 0;
  if (!hasToc && !hasParts) return null;
  if (!slot) return null;

  return createPortal(
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Open table of contents"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="scrollbar-hide w-72 overflow-y-auto bg-background p-6">
        <SheetTitle className="sr-only">Table of contents</SheetTitle>
        {hasParts ? <PartsNav parts={parts!} currentSlug={currentSlug} /> : null}
        <Toc entries={entries} />
      </SheetContent>
    </Sheet>,
    slot,
  );
}
