"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import type { Card as BoardCard, Project, Status } from "@/lib/board-types";
import { STATUSES, PERSONAS, type Persona } from "@/lib/board-types";
import { Column } from "./Column";
import { Filters } from "./Filters";

export function BoardView({ project, cards }: { project: Project; cards: BoardCard[] }) {
  const searchParams = useSearchParams();
  const personaParam = searchParams.get("persona");
  const subParam = searchParams.get("sub");

  const activePersona = (PERSONAS as readonly string[]).includes(personaParam ?? "")
    ? (personaParam as Persona)
    : null;

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (activePersona && c.persona !== activePersona) return false;
      if (subParam && c.sub_persona !== subParam) return false;
      return true;
    });
  }, [cards, activePersona, subParam]);

  const byStatus = useMemo(() => {
    const map: Record<Status, BoardCard[]> = {
      backlog: [],
      in_progress: [],
      in_review: [],
      blocked: [],
      done: [],
    };
    for (const c of filtered) map[c.status].push(c);
    return map;
  }, [filtered]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 md:py-8">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href="/board"
            className="inline-flex items-center gap-1 hover:text-foreground"
            data-no-style
          >
            <ArrowLeft className="h-3 w-3" />
            All projects
          </Link>
          <span>/</span>
          <span className="text-foreground">{project.name}</span>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            {project.name}
          </h1>
          {project.description ? (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {project.description}
            </p>
          ) : null}
        </div>
        <Filters />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
        {STATUSES.map((s) => (
          <Column key={s} status={s} cards={byStatus[s]} dimmed={s === "done"} />
        ))}
      </div>
    </div>
  );
}
