"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  id: number;
  initialBookmarked: boolean;
  initialVaultPath: string | null;
}

type Status = "idle" | "loading" | "error";

/*
 * BookmarkButton — icon-only bookmark toggle for a single /news item.
 * Outlined ribbon when not bookmarked, filled when bookmarked. POSTs /
 * DELETEs against /news/bookmark.
 */
export default function BookmarkButton({ id, initialBookmarked, initialVaultPath }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [vaultPath, setVaultPath] = useState<string | null>(initialVaultPath);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function toggle() {
    if (status === "loading") return;
    setStatus("loading");
    setErrorMsg(null);
    const method = bookmarked ? "DELETE" : "POST";
    try {
      const res = await fetch("/news/bookmark", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        bookmarked?: boolean;
        vault_path?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }
      setBookmarked(Boolean(data.bookmarked));
      setVaultPath(data.vault_path ?? null);
      setStatus("idle");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }

  const title = errorMsg
    ? `Error: ${errorMsg}`
    : bookmarked && vaultPath
      ? `Bookmarked → vault/${vaultPath} (click to remove)`
      : "Bookmark to vault";

  return (
    <Button
      type="button"
      onClick={toggle}
      disabled={status === "loading"}
      variant="ghost"
      size="icon"
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark article"}
      title={title}
      className={cn(
        "h-7 w-7 text-muted-foreground hover:text-primary",
        bookmarked && "text-primary",
        status === "error" && "text-destructive",
      )}
    >
      <Bookmark className="size-4" fill={bookmarked ? "currentColor" : "none"} />
    </Button>
  );
}
