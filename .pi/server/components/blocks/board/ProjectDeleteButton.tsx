"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProject } from "@/lib/board-actions";
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

export function ProjectDeleteButton({
  projectSlug,
  projectName,
}: {
  projectSlug: string;
  projectName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      const res = await deleteProject({ projectSlug });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't archive project.");
        return;
      }
      setOpen(false);
      router.refresh();
      toast.success("Project archived.");
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          aria-label={`Archive ${projectName}`}
          title="Archive project"
          // Stop the click from bubbling to the wrapping <Link>.
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-[color-mix(in_oklab,var(--color-sunset-orange)_10%,transparent)] hover:text-[var(--color-sunset-orange)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this project?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{projectName}</span> and
            all its cards will be moved to{" "}
            <code className="font-mono text-xs">vault/projects/_archive/</code>.
            You can restore it by moving the folder back.
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
