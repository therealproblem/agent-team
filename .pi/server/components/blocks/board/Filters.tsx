"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import {
  PERSONAS,
  PERSONA_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  type Persona,
  type Priority,
} from "@/lib/board-types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PERSONA_THEME, PRIORITY_DOT } from "./persona-theme";

export function Filters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const personaParam = searchParams.get("persona");
  const priorityParam = searchParams.get("priority");
  const activePersona = (PERSONAS as readonly string[]).includes(personaParam ?? "")
    ? (personaParam as Persona)
    : null;
  const activePriority = (PRIORITIES as readonly string[]).includes(priorityParam ?? "")
    ? (priorityParam as Priority)
    : null;

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const handlePersonaChange = useCallback(
    (value: string) => {
      // toggle-group "single" sends "" when deselecting
      if (value === activePersona) {
        setParams({ persona: null });
      } else {
        setParams({ persona: value || null });
      }
    },
    [activePersona, setParams],
  );

  const handlePriorityChange = useCallback(
    (value: string) => {
      if (value === activePriority || !value) {
        setParams({ priority: null });
      } else {
        setParams({ priority: value });
      }
    },
    [activePriority, setParams],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Agent
        </span>
        <ToggleGroup
          type="single"
          spacing={1}
          value={activePersona ?? ""}
          onValueChange={handlePersonaChange}
          className="flex-wrap"
        >
          {PERSONAS.map((p) => {
            const theme = PERSONA_THEME[p];
            const active = activePersona === p;
            return (
              <ToggleGroupItem
                key={p}
                value={p}
                aria-label={`Filter ${PERSONA_LABELS[p]}`}
                className={cn(
                  "h-7 gap-1.5 rounded-full border border-border/70 px-2.5 text-xs font-medium",
                  active && "ring-2 ring-offset-1",
                  active && theme.ring,
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
                {PERSONA_LABELS[p]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        {(activePersona || activePriority) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setParams({ persona: null, priority: null })}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Priority
        </span>
        <ToggleGroup
          type="single"
          spacing={1}
          value={activePriority ?? ""}
          onValueChange={handlePriorityChange}
          className="flex-wrap"
        >
          {PRIORITIES.map((p) => {
            const active = activePriority === p;
            return (
              <ToggleGroupItem
                key={p}
                value={p}
                aria-label={`Filter ${PRIORITY_LABELS[p]}`}
                className={cn(
                  "h-7 gap-1.5 rounded-full border border-border/70 px-2.5 text-xs font-medium",
                  active && "ring-2 ring-offset-1 ring-[var(--color-burnt-umber)]",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[p])} />
                {PRIORITY_LABELS[p]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>
    </div>
  );
}
