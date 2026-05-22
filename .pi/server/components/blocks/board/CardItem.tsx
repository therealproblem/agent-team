"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, MessageSquarePlus, Trash2, Unlock } from "lucide-react";
import { toast } from "sonner";
import type { Card as BoardCard, Comment } from "@/lib/board-types";
import { PERSONA_LABELS, STATUS_LABELS } from "@/lib/board-types";
import { addComment, deleteCard, unblockCard } from "@/lib/board-actions";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PERSONA_THEME, PRIORITY_DOT, STATUS_TONE, UNASSIGNED_THEME } from "./persona-theme";

const COMMENT_ROLE_LABELS: Record<Comment["role"], string> = {
  user: "You",
  pm: "PM",
  engineer: "Engineer",
};

const COMMENT_ROLE_TONE: Record<Comment["role"], string> = {
  user: "bg-[var(--color-cloud-fog)] text-[var(--color-deep-cognac)]",
  pm: "bg-[color-mix(in_oklab,var(--color-burnt-umber)_10%,transparent)] text-[var(--color-burnt-umber)]",
  engineer: "bg-[color-mix(in_oklab,var(--color-pressed-cacao)_15%,transparent)] text-[var(--color-pressed-cacao)]",
};

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

function PriorityChip({ priority }: { priority: BoardCard["priority"] }) {
  if (!priority) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-cloud-fog)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[priority])} />
      {priority.toUpperCase()}
    </span>
  );
}

function relativeTime(ts: string): string {
  if (!ts) return "";
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return ts;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

function CommentList({ comments }: { comments: Comment[] }) {
  if (comments.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        No comments yet — be the first to add context.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {comments.map((c, i) => (
        <li
          key={`${c.ts}-${i}`}
          className="flex flex-col gap-1 rounded-md border border-border/60 bg-card/50 px-3 py-2"
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 font-medium",
                COMMENT_ROLE_TONE[c.role],
              )}
            >
              {COMMENT_ROLE_LABELS[c.role]}
            </span>
            <span className="text-muted-foreground normal-case tracking-normal">
              {c.author}
            </span>
            <span className="ml-auto text-muted-foreground normal-case tracking-normal">
              {relativeTime(c.ts)}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {c.body}
          </p>
        </li>
      ))}
    </ul>
  );
}

function CommentForm({
  projectSlug,
  cardSlug,
}: {
  projectSlug: string;
  cardSlug: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = value.trim();
    if (!body || pending) return;
    startTransition(async () => {
      const res = await addComment({ projectSlug, cardSlug, body });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't post comment.");
        return;
      }
      setValue("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a comment…"
        rows={3}
        maxLength={4000}
        className="text-sm"
        disabled={pending}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={pending || !value.trim()}
          className="h-7 gap-1.5 text-xs"
        >
          <MessageSquarePlus className="h-3 w-3" />
          {pending ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </form>
  );
}

function UnblockButton({
  projectSlug,
  cardSlug,
}: {
  projectSlug: string;
  cardSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = comment.trim();
    if (!body || pending) return;
    startTransition(async () => {
      const res = await unblockCard({ projectSlug, cardSlug, comment: body });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't unblock card.");
        return;
      }
      setComment("");
      setOpen(false);
      router.refresh();
      toast.success("Card moved to Backlog.");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
        >
          <Unlock className="h-3 w-3" />
          Unblock
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Unblock this card</DialogTitle>
          <DialogDescription>
            Explain how it's unblocked or which PM/Engineer question was answered.
            The note is recorded as a comment and the card moves back to Backlog.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What changed?"
            rows={4}
            maxLength={4000}
            autoFocus
            required
            disabled={pending}
            className="text-sm"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !comment.trim()}
              className="h-7 text-xs"
            >
              {pending ? "Unblocking…" : "Move to Backlog"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCardButton({
  projectSlug,
  cardSlug,
  title,
  onDone,
}: {
  projectSlug: string;
  cardSlug: string;
  title: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      const res = await deleteCard({ projectSlug, cardSlug });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't archive card.");
        return;
      }
      onDone();
      router.refresh();
      toast.success("Card archived.");
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-[var(--color-sunset-orange)] hover:bg-[color-mix(in_oklab,var(--color-sunset-orange)_8%,transparent)] hover:text-[var(--color-sunset-orange)]"
        >
          <Trash2 className="h-3 w-3" />
          Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this card?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{title}</span> will be
            moved to <code className="font-mono text-xs">board/_archive/</code>.
            You can restore it by moving the file back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            {pending ? "Archiving…" : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CardItem({
  card,
  projectSlug,
  bodyContent,
}: {
  card: BoardCard;
  projectSlug: string;
  bodyContent: ReactNode | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <div className="flex flex-wrap items-center gap-1.5">
              <PersonaChip card={card} />
              <PriorityChip priority={card.priority} />
              {card.comments.length > 0 ? (
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                  title={`${card.comments.length} comment${card.comments.length === 1 ? "" : "s"}`}
                >
                  💬 {card.comments.length}
                </span>
              ) : null}
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
      <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-3xl">
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
          <PriorityChip priority={card.priority} />
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
          <div className="prose prose-sm min-w-0 max-w-none break-words text-sm leading-relaxed text-foreground prose-headings:font-serif prose-headings:text-foreground prose-a:text-foreground prose-strong:text-foreground prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:text-foreground">
            {bodyContent}
          </div>
        ) : card.body ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {card.body}
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">No description</p>
        )}

        <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Comments
              {card.comments.length > 0 ? (
                <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">
                  ({card.comments.length})
                </span>
              ) : null}
            </h4>
          </div>
          <CommentList comments={card.comments} />
          <CommentForm projectSlug={projectSlug} cardSlug={card.slug} />
        </div>

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

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <DeleteCardButton
            projectSlug={projectSlug}
            cardSlug={card.slug}
            title={card.title}
            onDone={() => setOpen(false)}
          />
          {card.status === "blocked" ? (
            <UnblockButton projectSlug={projectSlug} cardSlug={card.slug} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
