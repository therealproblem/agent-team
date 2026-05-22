"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import type { Card as BoardCard, Project, Status } from "@/lib/board-types";
import { STATUSES, PERSONAS, PRIORITIES, type Persona, type Priority } from "@/lib/board-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { Column } from "./Column";
import { Filters } from "./Filters";
import { RequestForm } from "./RequestForm";

export function BoardView({
  project,
  cards,
  details,
  cardBodies,
}: {
  project: Project;
  cards: BoardCard[];
  details: ReactNode | null;
  cardBodies: Record<string, ReactNode>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const personaParam = searchParams.get("persona");
  const subParam = searchParams.get("sub");
  const priorityParam = searchParams.get("priority");

  const hasPendingTitle = useMemo(() => cards.some((c) => c.titlePending), [cards]);
  useEffect(() => {
    if (!hasPendingTitle) return;
    const start = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - start > 90_000) {
        clearInterval(interval);
        return;
      }
      router.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [hasPendingTitle, router]);

  const activePersona = (PERSONAS as readonly string[]).includes(personaParam ?? "")
    ? (personaParam as Persona)
    : null;
  const activePriority = (PRIORITIES as readonly string[]).includes(priorityParam ?? "")
    ? (priorityParam as Priority)
    : null;

  const [requestOpen, setRequestOpen] = useState(false);

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (activePersona && c.persona !== activePersona) return false;
      if (subParam && c.sub_persona !== subParam) return false;
      if (activePriority && c.priority !== activePriority) return false;
      return true;
    });
  }, [cards, activePersona, subParam, activePriority]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, [] as BoardCard[]])) as Record<
      Status,
      BoardCard[]
    >;
    for (const c of filtered) map[c.status].push(c);
    return map;
  }, [filtered]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 md:py-8">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href="/projects"
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
              {project.name}
            </h1>
            {details ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                  >
                    <FileText className="h-3 w-3" />
                    Details
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle className="font-serif text-xl leading-snug">
                      {project.name}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                      Full project details for {project.name}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground prose-headings:font-serif prose-headings:text-foreground prose-a:text-foreground prose-strong:text-foreground prose-code:text-foreground">
                    {details}
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
            <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
              <DialogTrigger asChild>
                <Button type="button" size="sm" className="h-7 gap-1.5 text-xs">
                  <Plus className="h-3 w-3" />
                  Submit request
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-serif text-xl leading-snug">
                    Submit a request
                  </DialogTitle>
                  <DialogDescription>
                    Lands in the Request column for PM to triage.
                  </DialogDescription>
                </DialogHeader>
                <RequestForm
                  projectSlug={project.slug}
                  onSuccess={() => setRequestOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
          {project.description ? (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {project.description}
            </p>
          ) : null}
        </div>
        <Filters />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-7">
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            cards={byStatus[s]}
            cardBodies={cardBodies}
            projectSlug={project.slug}
            dimmed={s === "done"}
          />
        ))}
      </div>
      <Toaster />
    </div>
  );
}
