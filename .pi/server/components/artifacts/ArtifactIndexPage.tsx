import Link from "next/link";
import { FileText, FileType, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ArtifactListItem } from "@/lib/artifacts";

type ArtifactKind = "render" | "pdf";

interface ArtifactIndexPageProps {
  title: string;
  description: string;
  kind: ArtifactKind;
  items: ArtifactListItem[];
  emptyTitle: string;
  emptyDescription: string;
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function ArtifactIcon({ kind }: { kind: ArtifactKind }) {
  const className = "size-5 text-muted-foreground";
  return kind === "pdf" ? <FileType className={className} /> : <FileText className={className} />;
}

export function ArtifactIndexPage({
  title,
  description,
  kind,
  items,
  emptyTitle,
  emptyDescription,
}: ArtifactIndexPageProps) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 md:py-16">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="size-3.5" />
            Protected index
          </Badge>
          <div className="space-y-2">
            <h1 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">{description}</p>
          </div>
        </div>
        <div className="rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "artifact" : "artifacts"}
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{emptyTitle}</CardTitle>
            <CardDescription>{emptyDescription}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const updated = formatDate(item.updatedAt);
            return (
              <Card key={item.slug} className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-start gap-4 pt-0">
                  <div className="mt-1 rounded-lg border bg-muted/40 p-2">
                    <ArtifactIcon kind={kind} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link href={item.href} className="text-base font-medium leading-6 hover:underline">
                      {item.title}
                    </Link>
                    <p className="truncate font-mono text-xs text-muted-foreground">{item.href}</p>
                  </div>
                  {updated && <time className="hidden text-sm text-muted-foreground sm:block">{updated}</time>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
