"use client";

import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Toc } from "@/components/docs/Toc";
import type { TocEntry } from "@/lib/toc";

interface MobileTocSheetProps {
  entries: TocEntry[];
}

/*
 * Mobile hamburger + slide-in drawer holding the TOC. Replaces the
 * CSS-only checkbox drawer from the Nextra-era layout.tsx.
 */
export function MobileTocSheet({ entries }: MobileTocSheetProps) {
  if (entries.filter((e) => e.depth >= 2).length === 0) return null;
  return (
    <div className="fixed top-3 left-3 z-50 md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open table of contents">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 overflow-y-auto bg-background p-6">
          <SheetTitle className="sr-only">Table of contents</SheetTitle>
          <Toc entries={entries} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
