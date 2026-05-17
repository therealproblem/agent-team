"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

/*
 * Client-side refresh trigger. POSTs to /news/refresh with
 * `Accept: application/json` so the route returns the inserted count
 * instead of a redirect, then calls `router.refresh()` to re-render the
 * server component with the new store contents. Disables itself and
 * surfaces a spinner while the fetch is in flight.
 */
export default function RefreshButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const busy = pending;

  async function onClick() {
    if (busy) return;
    setPending(true);
    const t = toast.loading("Refreshing news…");
    try {
      const res = await fetch("/news/refresh", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        ok: boolean;
        topics: number;
        inserted: number;
        errors?: string[];
      };
      const noun = data.inserted === 1 ? "item" : "items";
      toast.success(`${data.inserted} new ${noun}`, {
        id: t,
        description: `Across ${data.topics} topic${data.topics === 1 ? "" : "s"}${
          data.errors?.length ? ` · ${data.errors.length} feed error${data.errors.length === 1 ? "" : "s"}` : ""
        }.`,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Refresh failed", {
        id: t,
        description: (err as Error).message,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Toaster position="bottom-right" />
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] bg-transparent border border-muted-stone text-deep-cognac hover:bg-cloud-fog hover:border-deep-cognac font-sans font-medium text-[15px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-muted-stone"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
            Refreshing
          </>
        ) : (
          <>
            <RefreshCw className="size-4" strokeWidth={1.75} />
            Refresh
          </>
        )}
      </button>
    </>
  );
}
