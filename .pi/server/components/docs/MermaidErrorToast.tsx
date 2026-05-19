"use client";

/*
 * Page-level orchestrator for Mermaid render failures.
 *
 * Each <Mermaid> component independently dispatches "mermaid-error:set" when
 * its diagram fails to render and "mermaid-error:clear" when it succeeds (or
 * unmounts). This component subscribes to those events, keeps a Set of
 * currently-broken chart numbers, and shows a single aggregate toast with
 * a "Fix all" button that walks the set in numeric order, firing one
 * targeted "mermaid-error:fix" event per chart and awaiting the matching
 * clear before moving on. Sequential — not parallel — to avoid two fix
 * requests racing on the same .mdx file.
 *
 * Mounting once in DocLayout is enough; the events are window-scoped.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

const FIX_TIMEOUT_MS = 60_000;

function fixOne(chartNumber: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("mermaid-error:clear", onClear);
      clearTimeout(safety);
      resolve();
    };
    const onClear = (e: Event) => {
      const detail = (e as CustomEvent<{ chartNumber?: number }>).detail;
      if (detail?.chartNumber === chartNumber) settle();
    };
    window.addEventListener("mermaid-error:clear", onClear);
    // Safety: if the fix never completes (route timeout, model returned the
    // same source), advance the queue anyway so a single stuck chart doesn't
    // block the rest.
    const safety = setTimeout(settle, FIX_TIMEOUT_MS);
    window.dispatchEvent(
      new CustomEvent("mermaid-error:fix", { detail: { chartNumber } }),
    );
  });
}

export function MermaidErrorToast() {
  const [failedCharts, setFailedCharts] = useState<Set<number>>(new Set());
  const [fixingAll, setFixingAll] = useState(false);
  const toastIdRef = useRef<string | number | null>(null);
  // Mirror state for the toast onClick — useState closure would capture a
  // stale snapshot since sonner's action is bound at toast-creation time.
  const stateRef = useRef({ failedCharts, fixingAll });
  stateRef.current = { failedCharts, fixingAll };

  useEffect(() => {
    const onSet = (e: Event) => {
      const detail = (e as CustomEvent<{ chartNumber?: number }>).detail;
      if (typeof detail?.chartNumber !== "number") return;
      setFailedCharts((prev) => {
        if (prev.has(detail.chartNumber!)) return prev;
        const next = new Set(prev);
        next.add(detail.chartNumber!);
        return next;
      });
    };
    const onClear = (e: Event) => {
      const detail = (e as CustomEvent<{ chartNumber?: number }>).detail;
      if (typeof detail?.chartNumber !== "number") return;
      setFailedCharts((prev) => {
        if (!prev.has(detail.chartNumber!)) return prev;
        const next = new Set(prev);
        next.delete(detail.chartNumber!);
        return next;
      });
    };
    window.addEventListener("mermaid-error:set", onSet);
    window.addEventListener("mermaid-error:clear", onClear);
    return () => {
      window.removeEventListener("mermaid-error:set", onSet);
      window.removeEventListener("mermaid-error:clear", onClear);
    };
  }, []);

  // Drive the toast lifecycle off the aggregate state. Reuse the same toast
  // id across updates so the user sees the message change in place rather
  // than getting stacked toasts as charts fail one after another.
  useEffect(() => {
    const count = failedCharts.size;
    if (count === 0) {
      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
      return;
    }

    const noun = count === 1 ? "chart has" : "charts have";
    const label = fixingAll ? "Fixing…" : "Fix all";
    const description = fixingAll
      ? "Repairing each diagram in order. The page will not reload."
      : "Click Fix all to repair them sequentially via pi.";

    const opts = {
      id: toastIdRef.current ?? undefined,
      duration: Number.POSITIVE_INFINITY,
      description,
      action: {
        label,
        onClick: async () => {
          if (stateRef.current.fixingAll) return;
          setFixingAll(true);
          try {
            const numbers = [...stateRef.current.failedCharts].sort(
              (a, b) => a - b,
            );
            for (const n of numbers) {
              await fixOne(n);
            }
          } finally {
            setFixingAll(false);
          }
        },
      },
    };

    const newId = fixingAll
      ? toast.loading(`Fixing ${count} ${noun} syntax errors`, opts)
      : toast.error(`${count} ${noun} a syntax error`, opts);
    toastIdRef.current = newId;
  }, [failedCharts, fixingAll]);

  return <Toaster position="bottom-right" />;
}
