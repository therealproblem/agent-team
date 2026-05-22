import Link from "next/link";
import type { Project, Status } from "@/lib/board-types";
import { STATUSES, STATUS_LABELS, PERSONA_LABELS } from "@/lib/board-types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { PERSONA_THEME, STATUS_TONE } from "./persona-theme";
import { ProjectDeleteButton } from "./ProjectDeleteButton";

const PROJECT_STATUS_TONE: Record<Project["status"], string> = {
  active: "bg-[var(--color-burnt-umber)] text-[var(--color-white)]",
  paused: "bg-[var(--color-cloud-fog)] text-[var(--color-pressed-cacao)]",
  done: "bg-[var(--color-cloud-fog)] text-[var(--color-muted-stone)]",
  archived: "bg-[var(--color-cloud-fog)] text-[var(--color-muted-stone)] opacity-70",
};

function totalCount(counts: Record<Status, number>): number {
  return STATUSES.reduce((sum, s) => sum + counts[s], 0);
}

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function ProgressStrip({ counts }: { counts: Record<Status, number> }) {
  const total = totalCount(counts);
  if (total === 0) {
    return (
      <div className="h-1.5 w-full rounded-full bg-[var(--color-cloud-fog)]" />
    );
  }
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-cloud-fog)]">
      {STATUSES.map((s) => {
        const pct = (counts[s] / total) * 100;
        if (pct === 0) return null;
        return (
          <span
            key={s}
            className={cn("h-full", STATUS_TONE[s])}
            style={{ width: `${pct}%` }}
            title={`${STATUS_LABELS[s]}: ${counts[s]}`}
          />
        );
      })}
    </div>
  );
}

export function ProjectIndex({ projects }: { projects: Project[] }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 md:px-6 md:py-14">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
          Projects
        </h1>
        <p className="text-sm text-muted-foreground">
          Each project is a folder under{" "}
          <code className="bg-[var(--color-cloud-fog)] px-1.5 py-0.5 font-mono text-[12px]">
            vault/projects/&lt;slug&gt;/
          </code>
          . Cards live in{" "}
          <code className="bg-[var(--color-cloud-fog)] px-1.5 py-0.5 font-mono text-[12px]">
            board/*.md
          </code>
          . Personas edit the markdown; this view is read-only.
        </p>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectTile key={p.slug} project={p} />
          ))}
        </div>
      )}
      <Toaster />
    </main>
  );
}

function ProjectTile({ project }: { project: Project }) {
  const total = totalCount(project.cardCounts);
  const ownerTheme = project.owner ? PERSONA_THEME[project.owner] : null;
  return (
    <div className="group relative">
      <Link
        href={`/board/${encodeURIComponent(project.slug)}`}
        className="block"
        data-no-style
      >
        <Card className="h-full gap-3 rounded-xl border border-border/70 px-5 py-4 transition-colors group-hover:border-[var(--color-burnt-umber)]">
          <div className="flex items-start justify-between gap-2 pr-7">
            <h2 className="flex-1 font-serif text-lg font-semibold leading-tight text-foreground">
              {project.name}
            </h2>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                PROJECT_STATUS_TONE[project.status],
              )}
            >
              {project.status}
            </span>
          </div>

        {project.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {project.description}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">No description</p>
        )}

        <div className="flex flex-col gap-1.5 pt-1">
          <ProgressStrip counts={project.cardCounts} />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {total} card{total === 1 ? "" : "s"}
              {project.cardCounts.in_progress > 0 && (
                <span className="ml-1.5 text-foreground">
                  · {project.cardCounts.in_progress} in progress
                </span>
              )}
            </span>
            {project.updated && <span>{relativeDate(project.updated)}</span>}
          </div>
        </div>

        {ownerTheme && project.owner ? (
          <div className="pt-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                ownerTheme.chip,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", ownerTheme.dot)} />
              {PERSONA_LABELS[project.owner]}
            </span>
          </div>
        ) : null}
        </Card>
      </Link>
      <ProjectDeleteButton projectSlug={project.slug} projectName={project.name} />
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <h2 className="font-serif text-lg font-semibold text-foreground">No projects yet</h2>
      <p className="text-sm text-muted-foreground">
        Create a folder under{" "}
        <code className="bg-[var(--color-cloud-fog)] px-1.5 py-0.5 font-mono text-[12px]">
          vault/projects/&lt;slug&gt;/
        </code>{" "}
        with a <code className="font-mono text-[12px]">project.md</code> and a{" "}
        <code className="font-mono text-[12px]">board/</code> directory.
      </p>
    </Card>
  );
}
