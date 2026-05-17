"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

/*
 * Small client island that mounts <Toaster /> and exposes four buttons to
 * trigger each toast variant. Mount once per page that needs toasts.
 */
export function SonnerDemo() {
  return (
    <>
      <Toaster position="bottom-right" />
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="h-11 px-4 rounded-[12px] bg-transparent border border-muted-stone text-deep-cognac hover:bg-cloud-fog font-normal text-[15px] shadow-none"
          onClick={() =>
            toast("Note saved", {
              description: "Filed to vault/news/bookmarks/",
            })
          }
        >
          Default
        </Button>
        <Button
          variant="outline"
          className="h-11 px-4 rounded-[12px] bg-transparent border border-muted-stone text-deep-cognac hover:bg-cloud-fog font-normal text-[15px] shadow-none"
          onClick={() =>
            toast.success("Bookmark added", {
              description: "Synced to Obsidian in 200ms.",
            })
          }
        >
          Success
        </Button>
        <Button
          variant="outline"
          className="h-11 px-4 rounded-[12px] bg-transparent border border-muted-stone text-deep-cognac hover:bg-cloud-fog font-normal text-[15px] shadow-none"
          onClick={() =>
            toast.info("New scrape", {
              description: "12 items added across 4 topics.",
            })
          }
        >
          Info
        </Button>
        <Button
          variant="outline"
          className="h-11 px-4 rounded-[12px] bg-transparent border border-muted-stone text-deep-cognac hover:bg-cloud-fog font-normal text-[15px] shadow-none"
          onClick={() => toast.error("Feed unreachable", { description: "Skipped that source for this run." })}
        >
          Error
        </Button>
      </div>
    </>
  );
}
