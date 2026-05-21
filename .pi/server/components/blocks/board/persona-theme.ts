import type { Persona, Status } from "@/lib/board-types";

export const PERSONA_THEME: Record<Persona, { dot: string; chip: string; ring: string }> = {
  pm: {
    dot: "bg-[var(--color-pressed-cacao)]",
    chip: "bg-[var(--color-cloud-fog)] text-[var(--color-pressed-cacao)] border border-[color-mix(in_oklab,var(--color-pressed-cacao)_30%,transparent)]",
    ring: "ring-[color-mix(in_oklab,var(--color-pressed-cacao)_40%,transparent)]",
  },
  engineer: {
    dot: "bg-[var(--color-burnt-umber)]",
    chip: "bg-[var(--color-cloud-fog)] text-[var(--color-burnt-umber)] border border-[color-mix(in_oklab,var(--color-burnt-umber)_30%,transparent)]",
    ring: "ring-[color-mix(in_oklab,var(--color-burnt-umber)_40%,transparent)]",
  },
};

export const UNASSIGNED_THEME = {
  dot: "bg-[var(--color-warm-ash)]",
  chip: "bg-[var(--color-cloud-fog)] text-[var(--color-muted-stone)] border border-[var(--color-border)]",
  ring: "ring-[color-mix(in_oklab,var(--color-warm-ash)_40%,transparent)]",
};

export const STATUS_TONE: Record<Status, string> = {
  request: "bg-[var(--color-sunset-orange)]",
  triage: "bg-[var(--color-deep-cognac)]",
  backlog: "bg-[var(--color-warm-ash)]",
  in_progress: "bg-[var(--color-burnt-umber)]",
  in_review: "bg-[var(--color-pressed-cacao)]",
  blocked: "bg-[var(--color-fire-opal)]",
  done: "bg-[var(--color-muted-stone)]",
};

export const PRIORITY_DOT: Record<string, string> = {
  p0: "bg-[var(--color-fire-opal)]",
  p1: "bg-[var(--color-sunset-orange)]",
  p2: "bg-[var(--color-pressed-cacao)]",
  p3: "bg-[var(--color-muted-stone)]",
};
