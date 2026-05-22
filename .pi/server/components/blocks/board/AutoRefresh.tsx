"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Board markdown can be edited by agents (and other processes) outside the
// browser, so the client polls at a slow cadence to pick up those writes.
// Visibility-gated so background tabs don't burn traffic; also fires on
// visibility regain so tabbing back to the board feels instant.
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}
