/*
 * /news — view today's news store as an HTML page.
 *
 * Reads .pi/state/news.json and .pi/state/news-sources.json directly from
 * disk on each request (force-dynamic) so the page always reflects the
 * latest scrape — including writes from the cron, /news-refresh, and the
 * news-ingest extension's tools.
 *
 * Toggle is link-based (?view=highlights|all) so no client JS needed:
 *   highlights → top 3 items per topic
 *   all        → every item per topic
 *
 * Topic order follows the source registry. Topics with zero items in the
 * store are still listed so absences are visible (helps spot a feed that
 * silently broke).
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const dynamic = "force-dynamic";

const STATE_ROOT = process.env.AGENTS_TEAM_STATE_PATH
  ? resolve(process.env.AGENTS_TEAM_STATE_PATH)
  : resolve(process.cwd(), "..", "state");
const STORE_PATH = join(STATE_ROOT, "news.json");
const SOURCES_PATH = join(STATE_ROOT, "news-sources.json");

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

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const mode: "highlights" | "all" = view === "all" ? "all" : "highlights";

  const store = readJson<{ items: NewsItem[] }>(STORE_PATH, { items: [] });
  const sources = readJson<Record<string, string[]>>(SOURCES_PATH, {});
  const topics = Object.keys(sources);

  const itemsByTopic = new Map<string, NewsItem[]>();
  for (const it of store.items) {
    const arr = itemsByTopic.get(it.topic) ?? [];
    arr.push(it);
    itemsByTopic.set(it.topic, arr);
  }
  for (const arr of itemsByTopic.values()) arr.sort(comparePublishedDesc);

  const orderedTopics =
    topics.length > 0
      ? topics
      : [...itemsByTopic.keys()].sort();

  const totalShown = orderedTopics.reduce((acc, topic) => {
    const all = itemsByTopic.get(topic) ?? [];
    return acc + (mode === "highlights" ? Math.min(all.length, HIGHLIGHTS_PER_TOPIC) : all.length);
  }, 0);

  return (
    <main style={{ padding: "2rem 1.5rem", maxWidth: "48rem", margin: "0 auto" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>News</h1>
        <p style={{ margin: "0.25rem 0 0", color: "var(--color-slate-gray)", fontSize: "0.875rem" }}>
          {lastFetchLine(store.items)} · {totalShown} item{totalShown === 1 ? "" : "s"} shown
        </p>
        {/*
         * Inline <style> for the segmented control. Two reasons we can't
         * just use inline styles on the <a>: (1) Nextra's global anchor
         * styling sets a blue link color with high specificity that beat
         * our inline `color`, which is why "Highlights" was rendering as
         * blue-on-black; (2) we want a real :hover state. Scoped class
         * names keep this from leaking elsewhere.
         */}
        <style>{`
          .news-tabs {
            display: inline-flex;
            margin-top: 1rem;
            padding: 2px;
            background: rgba(0, 0, 0, 0.04);
            border: 1px solid rgba(0, 0, 0, 0.12);
            border-radius: 999px;
            font-size: 0.875rem;
            font-weight: 500;
          }
          .news-tab {
            padding: 0.4rem 1rem;
            border-radius: 999px;
            text-decoration: none !important;
            color: #032F62 !important;
            background: transparent;
            transition: background-color 120ms ease, color 120ms ease;
          }
          .news-tab:hover {
            background: rgba(3, 47, 98, 0.08);
          }
          .news-tab[aria-selected="true"] {
            background: #032F62;
            color: #ffffff !important;
          }
          .news-tab[aria-selected="true"]:hover {
            background: #04407c;
          }
        `}</style>
        <nav className="news-tabs" role="tablist" aria-label="View">
          <a
            href="/news?view=highlights"
            role="tab"
            aria-selected={mode === "highlights"}
            className="news-tab"
          >
            Highlights
          </a>
          <a
            href="/news?view=all"
            role="tab"
            aria-selected={mode === "all"}
            className="news-tab"
          >
            All
          </a>
        </nav>
      </header>

      {orderedTopics.length === 0 ? (
        <p>No news.</p>
      ) : (
        orderedTopics.map((topic) => {
          const all = itemsByTopic.get(topic) ?? [];
          const items = mode === "highlights" ? all.slice(0, HIGHLIGHTS_PER_TOPIC) : all;
          return (
            <section key={topic} style={{ marginBottom: "2rem" }}>
              <h2
                style={{
                  fontSize: "1rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: "1px solid var(--color-slate-gray)",
                  paddingBottom: "0.25rem",
                  margin: "0 0 0.75rem",
                }}
              >
                {topic}
                {mode === "highlights" && all.length > HIGHLIGHTS_PER_TOPIC ? (
                  <span style={{ float: "right", fontWeight: "normal", fontSize: "0.75rem", color: "var(--color-slate-gray)" }}>
                    {items.length} of {all.length}
                  </span>
                ) : null}
              </h2>
              {items.length === 0 ? (
                <p style={{ color: "var(--color-slate-gray)", fontSize: "0.875rem", margin: 0 }}>
                  No items.
                </p>
              ) : (
                <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {items.map((item) => (
                    <li key={item.id} style={{ marginBottom: "1rem" }}>
                      <div>
                        <span style={{ color: "var(--color-slate-gray)", fontFamily: "monospace" }}>
                          [{item.id}]
                        </span>{" "}
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noopener noreferrer">
                            {item.title || "(untitled)"}
                          </a>
                        ) : (
                          <span>{item.title || "(untitled)"}</span>
                        )}
                      </div>
                      {item.summary ? (
                        <p
                          style={{
                            margin: "0.25rem 0 0",
                            fontSize: "0.875rem",
                            lineHeight: "1.4",
                            color: "var(--color-midnight-ink)",
                          }}
                        >
                          {item.summary}
                        </p>
                      ) : null}
                      {item.source ? (
                        <div style={{ marginTop: "0.25rem", fontSize: "0.75rem", color: "var(--color-slate-gray)" }}>
                          {item.source}
                          {item.published_at ? ` · ${formatRelative(item.published_at)}` : ""}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}
