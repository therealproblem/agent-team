"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Toc } from "@/components/docs/Toc";
import type { TocEntry } from "@/lib/toc";

interface MobileTocSheetProps {
  entries: TocEntry[];
}

/*
 * Mobile TOC drawer. The trigger button portals into SiteHeader's left
 * slot (`#site-header-mobile-slot`) so it doesn't overlap the sticky
 * brand text. The sheet itself renders at document root via Radix.
 */
export function MobileTocSheet({ entries }: MobileTocSheetProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById("site-header-mobile-slot"));
  }, []);

  if (entries.filter((e) => e.depth >= 2).length === 0) return null;
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
      <SheetContent side="left" className="w-72 overflow-y-auto bg-background p-6">
        <SheetTitle className="sr-only">Table of contents</SheetTitle>
        <Toc entries={entries} />
      </SheetContent>
    </Sheet>,
    slot,
  );
}
