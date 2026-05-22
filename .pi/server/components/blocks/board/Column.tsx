import type { ReactNode } from "react";
import type { Card as BoardCard, Status } from "@/lib/board-types";
import { STATUS_LABELS } from "@/lib/board-types";
import { ScrollArea } from "@/components/ui/scroll-area";
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
        "flex w-full flex-col rounded-xl border border-border/60 bg-[color-mix(in_oklab,var(--color-cloud-fog)_30%,var(--color-parchment-white))]",
        dimmed && "opacity-70",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", STATUS_TONE[status])} />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">
            {STATUS_LABELS[status]}
          </h2>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">{cards.length}</span>
      </header>
      <ScrollArea className="h-[calc(100vh-240px)] max-h-[520px] min-h-[200px]">
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
      </ScrollArea>
    </section>
  );
}
