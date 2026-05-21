"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { Card as BoardCard } from "@/lib/board-types";
import { PERSONA_LABELS, STATUS_LABELS } from "@/lib/board-types";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PERSONA_THEME, PRIORITY_DOT, STATUS_TONE, UNASSIGNED_THEME } from "./persona-theme";

function PersonaChip({ card }: { card: BoardCard }) {
  const theme = card.persona ? PERSONA_THEME[card.persona] : UNASSIGNED_THEME;
  const personaLabel = card.persona ? PERSONA_LABELS[card.persona] : "Unassigned";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        theme.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", theme.dot)} />
      {personaLabel}
      {card.sub_persona ? (
        <span className="font-normal opacity-80">· {card.sub_persona}</span>
      ) : null}
    </span>
  );
}

export function CardItem({
  card,
  bodyContent,
}: {
  card: BoardCard;
  bodyContent: ReactNode | null;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="block w-full cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-lg"
        >
          <Card className="gap-2 rounded-lg border border-border/70 bg-card px-4 py-3 shadow-none transition-colors hover:border-[var(--color-burnt-umber)]">
            <div className="flex items-start gap-1.5">
              {card.titlePending ? (
                <Loader2
                  className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-muted-foreground"
                  aria-label="Generating title…"
                />
              ) : null}
              <h3
                className={cn(
                  "text-sm font-medium leading-snug",
                  card.titlePending
                    ? "italic text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {card.title}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <PersonaChip card={card} />
              {card.warning ? (
                <AlertTriangle
                  className="h-3 w-3 text-[var(--color-sunset-orange)]"
                  aria-label={card.warning}
                />
              ) : null}
            </div>
          </Card>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl leading-snug">
            {card.titlePending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : null}
            <span className={cn(card.titlePending && "italic text-muted-foreground")}>
              {card.title}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Card details for {card.title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_TONE[card.status])} />
            {STATUS_LABELS[card.status]}
          </span>
          <PersonaChip card={card} />
          {card.priority ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[card.priority])} />
              {card.priority.toUpperCase()}
            </span>
          ) : null}
          {card.updated ? (
            <span className="text-[11px] text-muted-foreground">updated {card.updated}</span>
          ) : null}
        </div>

        {card.warning ? (
          <div className="flex items-start gap-1.5 rounded-md border border-[color-mix(in_oklab,var(--color-sunset-orange)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-sunset-orange)_8%,transparent)] px-3 py-2 text-xs text-[var(--color-sunset-orange)]">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{card.warning}</span>
          </div>
        ) : null}

        {bodyContent ? (
          <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground prose-headings:font-serif prose-headings:text-foreground prose-a:text-foreground prose-strong:text-foreground prose-code:text-foreground">
            {bodyContent}
          </div>
        ) : card.body ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {card.body}
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">No description</p>
        )}

        {(card.tags.length > 0 || card.link) && (
          <div className="flex flex-col gap-2 border-t border-border/60 pt-3 text-xs">
            {card.tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Tags
                </span>
                {card.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-[var(--color-cloud-fog)] px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            ) : null}
            {card.link ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Link
                </span>
                <Link
                  href={`/v/${encodeURIComponent(card.link.replace(/\.mdx?$/i, ""))}`}
                  className="truncate font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  title={card.link}
                >
                  ↗ {card.link}
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
