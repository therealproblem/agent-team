import type { ReactNode } from "react";
import type { Card as BoardCard, Status } from "@/lib/board-types";
import { STATUS_LABELS } from "@/lib/board-types";
import { cn } from "@/lib/utils";
import { CardItem } from "./CardItem";
import { STATUS_TONE } from "./persona-theme";

export function Column({
  status,
  cards,
  cardBodies,
  projectSlug,
  openCardSlug,
  dimmed,
}: {
  status: Status;
  cards: BoardCard[];
  cardBodies: Record<string, ReactNode>;
  projectSlug: string;
  openCardSlug?: string | null;
  dimmed?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex h-full w-[calc(100vw-2.5rem)] flex-shrink-0 flex-col rounded-xl border border-border/60 bg-[color-mix(in_oklab,var(--color-cloud-fog)_30%,var(--color-parchment-white))]",
        "md:w-auto md:min-w-[300px]",
        dimmed && "opacity-70",
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", STATUS_TONE[status])} />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">
            {STATUS_LABELS[status]}
          </h2>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">{cards.length}</span>
      </header>
      {/* Native overflow-y-auto rather than Radix ScrollArea: the Radix
          variant defaults to type="hover" and injects CSS that hides the
          native scrollbar, so wheel-scroll has no visible affordance and
          touchpad users assume the column doesn't scroll. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-2">
          {cards.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">No cards</p>
          ) : (
            cards.map((c) => (
              <CardItem
                key={c.slug}
                card={c}
                projectSlug={projectSlug}
                bodyContent={cardBodies[c.slug] ?? null}
                defaultOpen={openCardSlug === c.slug}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
