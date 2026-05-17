/*
 * /news — view today's news store, restyled to the Delphi design language.
 *
 * Reads .pi/state/news.json and .pi/state/news-sources.json directly from
 * disk on each request (force-dynamic) so the page always reflects the
 * latest scrape — including writes from the cron, /news-refresh, and the
 * news-ingest extension's tools.
 *
 * Each topic shows HIGHLIGHTS_PER_TOPIC items by default with a per-topic
 * "Show all" toggle. Expanded topics are tracked via the `all=` query param
 * (comma-separated topic names) — link-based, no client JS, no global mode.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import BookmarkButton from "./BookmarkButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "News · agents-team" };

const STATE_ROOT = process.env.AGENTS_TEAM_STATE_PATH
  ? resolve(process.env.AGENTS_TEAM_STATE_PATH)
  : resolve(process.cwd(), "..", "state");
const STORE_PATH = join(STATE_ROOT, "news.json");
const SOURCES_PATH = join(STATE_ROOT, "news-sources.json");
const BOOKMARKS_PATH = join(STATE_ROOT, "news-bookmarks.json");

interface BookmarkRecord {
  vault_path: string;
  title: string;
  source: string;
  topic: string;
  bookmarked_at: string;
}

const HIGHLIGHTS_PER_TOPIC = 3;

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

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function comparePublishedDesc(a: NewsItem, b: NewsItem): number {
  const ta = Date.parse(a.published_at);
  const tb = Date.parse(b.published_at);
  return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  if (diffMs < 60_000) return "just now";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function lastFetchLine(items: NewsItem[]): string {
  let max = 0;
  for (const it of items) {
    const t = Date.parse(it.fetched_at);
    if (!Number.isNaN(t) && t > max) max = t;
  }
  if (max === 0) return "store is empty";
  return `last scrape ${formatRelative(new Date(max).toISOString())}`;
}

function parseAllParam(raw: string | string[] | undefined): Set<string> {
  if (!raw) return new Set();
  const value = Array.isArray(raw) ? raw[0] : raw;
  return new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Toggle a topic in/out of the `all=` set and return the next URL. */
function toggleTopicUrl(expanded: Set<string>, topic: string): string {
  const next = new Set(expanded);
  if (next.has(topic)) next.delete(topic);
  else next.add(topic);
  const list = [...next].join(",");
  return list ? `/news?all=${encodeURIComponent(list)}` : "/news";
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string | string[] }>;
}) {
  const params = await searchParams;
  const expanded = parseAllParam(params.all);

  const store = readJson<{ items: NewsItem[] }>(STORE_PATH, { items: [] });
  const sources = readJson<Record<string, string[]>>(SOURCES_PATH, {});
  const bookmarks = readJson<Record<string, BookmarkRecord>>(BOOKMARKS_PATH, {});
  const topics = Object.keys(sources);

  const itemsByTopic = new Map<string, NewsItem[]>();
  for (const it of store.items) {
    const arr = itemsByTopic.get(it.topic) ?? [];
    arr.push(it);
    itemsByTopic.set(it.topic, arr);
  }
  for (const arr of itemsByTopic.values()) arr.sort(comparePublishedDesc);

  const orderedTopics =
    topics.length > 0 ? topics : [...itemsByTopic.keys()].sort();

  const totalShown = orderedTopics.reduce((acc, topic) => {
    const all = itemsByTopic.get(topic) ?? [];
    return acc + (expanded.has(topic) ? all.length : Math.min(all.length, HIGHLIGHTS_PER_TOPIC));
  }, 0);

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-3xl px-6 md:px-10 py-12 md:py-16">
        {/* Header */}
        <header className="space-y-4 mb-12">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-3 min-w-0">
              <p className="font-sans text-[10px] leading-[1.2] tracking-[0.1em] uppercase font-medium text-pressed-cacao">
                Today &middot; The Briefing
              </p>
              <h1 className="font-serif font-light text-[56px] leading-[1.1] tracking-[-1.23px] text-deep-cognac">
                News
              </h1>
            </div>
            <form action="/news/refresh" method="POST" className="shrink-0 pt-1">
              <button
                type="submit"
                className="inline-flex items-center gap-2 h-11 px-4 rounded-[12px] bg-transparent border border-muted-stone text-deep-cognac hover:bg-cloud-fog hover:border-deep-cognac font-sans font-medium text-[15px] transition-colors"
              >
                <RefreshCw className="size-4" strokeWidth={1.75} />
                Refresh
              </button>
            </form>
          </div>
          <p className="font-sans text-[15px] leading-[1.4] tracking-[-0.01em] text-muted-stone">
            {lastFetchLine(store.items)} &middot; {totalShown} item
            {totalShown === 1 ? "" : "s"} shown. Each topic shows {HIGHLIGHTS_PER_TOPIC} highlights —
            expand below for the rest.
          </p>
        </header>

        {/* Topics */}
        {orderedTopics.length === 0 ? (
          <p className="font-sans text-[15px] text-muted-stone">No news.</p>
        ) : (
          <div className="space-y-10">
            {orderedTopics.map((topic) => {
              const all = itemsByTopic.get(topic) ?? [];
              const isExpanded = expanded.has(topic);
              const hasMore = all.length > HIGHLIGHTS_PER_TOPIC;
              const items = isExpanded ? all : all.slice(0, HIGHLIGHTS_PER_TOPIC);
              const toggleHref = toggleTopicUrl(expanded, topic);

              return (
                <section key={topic} className="rounded-[16px] bg-card border border-border p-5 md:p-6">
                  {/* Topic header */}
                  <header className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <h2 className="font-sans text-[10px] leading-[1.2] tracking-[0.1em] uppercase font-medium text-pressed-cacao">
                        {topic}
                      </h2>
                      {all.length > 0 ? (
                        <span className="font-mono text-[10px] tracking-[0.05em] uppercase text-muted-stone">
                          {isExpanded ? all.length : Math.min(all.length, HIGHLIGHTS_PER_TOPIC)} / {all.length}
                        </span>
                      ) : null}
                    </div>
                  </header>

                  {/* Items */}
                  {items.length === 0 ? (
                    <p className="font-sans text-[15px] text-muted-stone">No items.</p>
                  ) : (
                    <ol className="divide-y divide-border/60">
                      {items.map((item) => {
                        const bookmark = item.url ? bookmarks[item.url] : undefined;
                        return (
                          <li key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                            <BookmarkButton
                              id={item.id}
                              initialBookmarked={Boolean(bookmark)}
                              initialVaultPath={bookmark?.vault_path ?? null}
                            />
                            <div className="min-w-0 flex-1 space-y-1.5">
                              {item.url ? (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-serif font-normal text-[20px] leading-[1.2] tracking-[-0.48px] text-deep-cognac hover:text-burnt-umber underline-offset-4 hover:underline decoration-burnt-umber/40"
                                >
                                  {item.title || "(untitled)"}
                                </a>
                              ) : (
                                <span className="font-serif font-normal text-[20px] leading-[1.2] tracking-[-0.48px] text-deep-cognac">
                                  {item.title || "(untitled)"}
                                </span>
                              )}
                              {item.summary ? (
                                <p className="font-sans text-[15px] leading-[1.4] tracking-[-0.01em] text-pressed-cacao">
                                  {item.summary}
                                </p>
                              ) : null}
                              {item.source ? (
                                <div className="font-sans text-[10px] leading-[1.2] tracking-[0.1em] uppercase font-medium text-muted-stone pt-1">
                                  {item.source}
                                  {item.published_at
                                    ? ` · ${formatRelative(item.published_at)}`
                                    : ""}
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  {/* Per-topic toggle */}
                  {hasMore ? (
                    <div className="pt-5 mt-5 border-t border-border/60">
                      <Link
                        href={toggleHref}
                        scroll={false}
                        className="inline-flex items-center gap-1.5 font-sans text-[13px] font-medium text-burnt-umber hover:text-deep-cognac"
                        data-no-style
                      >
                        {isExpanded
                          ? `Show highlights only`
                          : `Show all ${all.length}`}
                        <span aria-hidden="true">{isExpanded ? "↑" : "↓"}</span>
                      </Link>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
