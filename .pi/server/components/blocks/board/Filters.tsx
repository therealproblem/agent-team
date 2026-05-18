"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { PERSONAS, PERSONA_LABELS, SUB_PERSONAS, type Persona } from "@/lib/board-types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PERSONA_THEME } from "./persona-theme";

export function Filters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const personaParam = searchParams.get("persona");
  const subParam = searchParams.get("sub");
  const activePersona = (PERSONAS as readonly string[]).includes(personaParam ?? "")
    ? (personaParam as Persona)
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
        setParams({ persona: null, sub: null });
      } else {
        setParams({ persona: value || null, sub: null });
      }
    },
    [activePersona, setParams],
  );

  const subPersonas = useMemo(
    () => (activePersona ? SUB_PERSONAS[activePersona] : []),
    [activePersona],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Persona
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
        {(activePersona || subParam) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setParams({ persona: null, sub: null })}
          >
            Clear
          </Button>
        )}
      </div>

      {activePersona && subPersonas.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pl-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Sub-persona
          </span>
          <ToggleGroup
            type="single"
            spacing={1}
            value={subParam ?? ""}
            onValueChange={(v) => setParams({ sub: v || null })}
            className="flex-wrap"
          >
            {subPersonas.map((s) => (
              <ToggleGroupItem
                key={s}
                value={s}
                className="h-6 rounded-full border border-border/60 px-2 text-[11px] font-normal"
              >
                {s}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
    </div>
  );
}
