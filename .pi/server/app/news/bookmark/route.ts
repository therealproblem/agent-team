/*
 * POST/DELETE /news/bookmark — one-click bookmark interaction for /news.
 *
 * POST   { id }   → write a markdown note into the Obsidian vault at
 *                   `news/bookmarks/<YYYY-MM-DD>-<slug>.md`. Matches the
 *                   filename / frontmatter conventions from the `news` skill
 *                   so manually-bookmarked items and skill-driven bookmarks
 *                   land in the same folder with the same shape.
 * DELETE { id }   → unbookmark: remove the index entry AND unlink the vault
 *                   file. The user opted into this destructive symmetry when
 *                   the toggle UX was picked over the safer one-way variant.
 *
 * Index lives at `.pi/state/news-bookmarks.json`, keyed by URL (stable across
 * the daily store purge — `id` is also stable, but URL survives if news.json
 * is ever rebuilt from scratch). Index shape:
 *   { [url]: { vault_path, title, source, topic, bookmarked_at } }
 *
 * The page handler at `app/news/page.tsx` reads this index to render the
 * initial button state per item.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STATE_ROOT = process.env.AGENTS_TEAM_STATE_PATH
  ? resolve(process.env.AGENTS_TEAM_STATE_PATH)
  : resolve(process.cwd(), "..", "state");
const VAULT_ROOT = process.env.AGENTS_TEAM_VAULT_PATH
  ? resolve(process.env.AGENTS_TEAM_VAULT_PATH)
  : resolve(process.cwd(), "..", "..", "vault");

const STORE_PATH = join(STATE_ROOT, "news.json");
const BOOKMARKS_PATH = join(STATE_ROOT, "news-bookmarks.json");

interface NewsItem {
  id: number;
  topic: string;
  title: string;
  source: string;
  url: string;
  published_at: string;
  summary: string;
  fetched_at: string;
}

interface BookmarkRecord {
  vault_path: string;
  title: string;
  source: string;
  topic: string;
  bookmarked_at: string;
}

type BookmarksIndex = Record<string, BookmarkRecord>;

function readStore(): { items: NewsItem[] } {
  if (!existsSync(STORE_PATH)) return { items: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { items: [] };
  }
}

function readBookmarks(): BookmarksIndex {
  if (!existsSync(BOOKMARKS_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(BOOKMARKS_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as BookmarksIndex) : {};
  } catch {
    return {};
  }
}

function writeBookmarks(idx: BookmarksIndex): void {
  mkdirSync(dirname(BOOKMARKS_PATH), { recursive: true });
  writeFileSync(BOOKMARKS_PATH, `${JSON.stringify(idx, null, 2)}\n`);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseId(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { id?: unknown }).id;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function findItem(id: number): NewsItem | null {
  for (const it of readStore().items) {
    if (it.id === id) return it;
  }
  return null;
}

function buildNoteMarkdown(item: NewsItem): string {
  const dateStr = (item.published_at && !Number.isNaN(Date.parse(item.published_at)))
    ? item.published_at.slice(0, 10)
    : todayIso();
  const titleEscaped = JSON.stringify(item.title || "(untitled)");
  const sourceEscaped = JSON.stringify(item.source || "");
  const urlEscaped = JSON.stringify(item.url || "");
  const tags = ["bookmark", "news", item.topic].filter(Boolean);
  const tagList = tags.map((t) => JSON.stringify(t)).join(", ");
  const fm = [
    "---",
    `title: ${titleEscaped}`,
    `date: ${dateStr}`,
    `source: ${sourceEscaped}`,
    `url: ${urlEscaped}`,
    `tags: [${tagList}]`,
    `bookmarked_at: ${new Date().toISOString()}`,
    "---",
    "",
  ].join("\n");
  const body: string[] = [];
  if (item.summary) body.push(item.summary, "");
  if (item.url) {
    const label = item.source || "Original";
    body.push(`[${label}](${item.url})`, "");
  }
  return fm + body.join("\n");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = parseId(body);
  if (id === null) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const item = findItem(id);
  if (!item) return NextResponse.json({ error: "item_not_found" }, { status: 404 });

  const index = readBookmarks();
  const existing = item.url ? index[item.url] : undefined;
  if (existing) {
    // Idempotent: already bookmarked. Return the existing record without
    // touching the file on disk so user edits in Obsidian survive a stray
    // re-POST (e.g. double-click).
    return NextResponse.json({
      ok: true,
      bookmarked: true,
      vault_path: existing.vault_path,
      already_bookmarked: true,
    });
  }

  const slug = slugify(item.title);
  const filename = `${todayIso()}-${slug}.md`;
  const vaultRelative = join("news", "bookmarks", filename);
  const absPath = join(VAULT_ROOT, vaultRelative);

  try {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, buildNoteMarkdown(item), { encoding: "utf8" });
  } catch (e) {
    return NextResponse.json(
      { error: "write_failed", message: (e as Error).message },
      { status: 500 },
    );
  }

  if (item.url) {
    index[item.url] = {
      vault_path: vaultRelative,
      title: item.title,
      source: item.source,
      topic: item.topic,
      bookmarked_at: new Date().toISOString(),
    };
    writeBookmarks(index);
  }

  return NextResponse.json({ ok: true, bookmarked: true, vault_path: vaultRelative });
}

export async function DELETE(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = parseId(body);
  if (id === null) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const item = findItem(id);
  if (!item || !item.url) {
    return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  }

  const index = readBookmarks();
  const record = index[item.url];
  if (!record) {
    return NextResponse.json({ ok: true, bookmarked: false, already_absent: true });
  }

  const absPath = join(VAULT_ROOT, record.vault_path);
  try {
    if (existsSync(absPath)) unlinkSync(absPath);
  } catch {
    // Swallow: index removal is the source of truth for the UI. A
    // leftover file on disk is recoverable; a stuck index entry is not.
  }
  delete index[item.url];
  writeBookmarks(index);

  return NextResponse.json({ ok: true, bookmarked: false });
}
