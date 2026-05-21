"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitRequest } from "@/lib/board-actions";

interface Props {
  projectSlug: string;
  onSuccess?: () => void;
}

export function RequestForm({ projectSlug, onSuccess }: Props) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submitDisabled = pending || description.trim().length === 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitRequest({ projectSlug, description });
      if (result.ok) {
        toast.success("Request submitted", {
          description: "In the Request column. A title is being generated in the background.",
        });
        setDescription("");
        onSuccess?.();
        router.refresh();
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="request-description">What do you want the team to consider?</Label>
        <Textarea
          id="request-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the request — context, examples, anything PM should know. A title will be generated for you."
          rows={7}
          maxLength={4000}
          required
          autoFocus
        />
        <p className="text-[11px] text-muted-foreground">
          The card appears instantly. A short title is generated in the background and replaces the placeholder when ready (~10–15s).
        </p>
      </div>
      {error ? (
        <p className="text-xs text-[var(--color-fire-opal)]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitDisabled}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
