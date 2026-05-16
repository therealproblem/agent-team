"use client";

/*
 * BookmarkButton — icon-only bookmark toggle for a single /news item.
 *
 * Replaces the [id] badge slot in the news list. Outlined ribbon when not
 * bookmarked, filled when bookmarked. POSTs / DELETEs against /news/bookmark.
 */

import { useState } from "react";

interface Props {
  id: number;
  initialBookmarked: boolean;
  initialVaultPath: string | null;
}

type Status = "idle" | "loading" | "error";

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

  const ariaLabel = bookmarked ? "Remove bookmark" : "Bookmark article";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={status === "loading"}
      aria-pressed={bookmarked}
      aria-label={ariaLabel}
      title={title}
      className={`news-bookmark-btn${bookmarked ? " is-on" : ""}${status === "error" ? " is-error" : ""}`}
    >
      <svg
        width="14"
        height="16"
        viewBox="0 0 14 16"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2.5 1.5h9a1 1 0 0 1 1 1V14.5L7 11.25 1.5 14.5V2.5a1 1 0 0 1 1-1Z" />
      </svg>
    </button>
  );
}
