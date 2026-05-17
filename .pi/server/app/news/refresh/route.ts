/*
 * POST /news/refresh — manually trigger a refresh of every configured topic.
 *
 * Mirrors the refresh logic from the `news-ingest` pi extension so the
 * /news page can drive a fetch without depending on pi being attached.
 * The extension and this route both write into the same `.pi/state/news.json`
 * store and the same dedupe / purge / enrich pipeline, so they stay in sync.
 *
 * Submitting a `<form method="POST" action="/news/refresh">` reloads /news
 * on completion via a 303 redirect, no client JS required.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STATE_ROOT = process.env.AGENTS_TEAM_STATE_PATH
  ? resolve(process.env.AGENTS_TEAM_STATE_PATH)
  : resolve(process.cwd(), "..", "state");
const SOURCES_PATH = join(STATE_ROOT, "news-sources.json");
const STORE_PATH = join(STATE_ROOT, "news.json");

const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day
const ENRICH_CONCURRENCY = 6;
const ENRICH_TIMEOUT_MS = 8000;
const ENRICH_HEAD_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const COUNT_PER_TOPIC = 20;

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

interface Store {
  next_id: number;
  items: NewsItem[];
}

interface ParsedItem {
  title: string;
  link: string;
  pubDate: string;
  summary: string;
  source?: string;
}

// ---------- Store ----------

function loadStore(): Store {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  if (existsSync(STORE_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8"));
      if (parsed && Array.isArray(parsed.items) && typeof parsed.next_id === "number") {
        return parsed as Store;
      }
    } catch {
      /* fall through */
    }
  }
  return { next_id: 1, items: [] };
}

function saveStore(store: Store): void {
  writeFileSync(STORE_PATH, JSON.stringify(store));
}

function startOfToday(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function purgeOld(store: Store): void {
  const cutoff = startOfToday();
  store.items = store.items.filter((it) => {
    const t = Date.parse(it.fetched_at);
    return !Number.isNaN(t) && t >= cutoff;
  });
}

function insertItems(store: Store, items: Omit<NewsItem, "id" | "fetched_at">[]): NewsItem[] {
  if (items.length === 0) return [];
  purgeOld(store);
  const seen = new Set(store.items.map((it) => `${it.topic} ${it.url}`));
  const now = new Date().toISOString();
  const inserted: NewsItem[] = [];
  for (const it of items) {
    const key = `${it.topic} ${it.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row: NewsItem = { id: store.next_id++, ...it, fetched_at: now };
    store.items.push(row);
    inserted.push(row);
  }
  return inserted;
}

// ---------- Sources ----------

function loadSources(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(readFileSync(SOURCES_PATH, "utf8"));
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* fall through */
  }
  return {};
}

// ---------- RSS / Atom parser ----------

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function extractTag(block: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]).trim() : null;
}

function extractAtomLink(block: string): string | null {
  const alt = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"[^>]*\/?>/i);
  if (alt) return alt[1];
  const any = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  if (any) return any[1];
  return extractTag(block, "link");
}

function parseFeed(xml: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  const rssRe = /<item[\s>][\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = rssRe.exec(xml)) !== null) {
    const block = m[0];
    const title = extractTag(block, "title") ?? "";
    const link = extractTag(block, "link") ?? "";
    const pubDate =
      extractTag(block, "pubDate") ??
      extractTag(block, "dc:date") ??
      extractTag(block, "published") ??
      "";
    const summary =
      extractTag(block, "content:encoded") ??
      extractTag(block, "description") ??
      "";
    const source = extractTag(block, "source") ?? undefined;
    if (title || link) out.push({ title, link, pubDate, summary, source });
  }
  if (out.length > 0) return out;

  const atomRe = /<entry[\s>][\s\S]*?<\/entry>/gi;
  while ((m = atomRe.exec(xml)) !== null) {
    const block = m[0];
    const title = extractTag(block, "title") ?? "";
    const link = extractAtomLink(block) ?? "";
    const pubDate =
      extractTag(block, "published") ?? extractTag(block, "updated") ?? "";
    const summary =
      extractTag(block, "summary") ?? extractTag(block, "content") ?? "";
    if (title || link) out.push({ title, link, pubDate, summary });
  }
  return out;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isRedundantGoogleSummary(summary: string, title: string, source: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const sum = norm(summary);
  if (!sum) return true;
  const t = norm(title);
  const s = norm(source);
  if (sum === t) return true;
  if (sum === `${t} ${s}`) return true;
  if (sum.startsWith(t) && sum.endsWith(s) && sum.length <= t.length + s.length + 4) {
    return true;
  }
  return false;
}

function googleNewsFeedFor(topic: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
}

// ---------- SEO meta enrichment ----------

const META_PATTERNS = [
  /<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["'][^>]*>/i,
  /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i,
  /<meta\s+[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
];

function extractMetaDescription(html: string): string | null {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, ENRICH_HEAD_BYTES);
  for (const re of META_PATTERNS) {
    const m = head.match(re);
    if (m?.[1]) {
      const cleaned = decodeEntities(m[1]).trim();
      if (cleaned) return cleaned;
    }
  }
  return null;
}

async function fetchMetaDescription(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "agents-team-news/0.1 (+local)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct && !ct.includes("html")) return null;
    const text = await res.text();
    return extractMetaDescription(text);
  } catch {
    return null;
  }
}

async function enrichWithMeta(items: NewsItem[]): Promise<void> {
  const queue = items.filter(
    (it) => it.url && !/(^|\.)news\.google\.com$/i.test(domainOf(it.url)),
  );
  if (queue.length === 0) return;
  let next = 0;
  const workers = Array.from({ length: Math.min(ENRICH_CONCURRENCY, queue.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= queue.length) return;
      const item = queue[i];
      const desc = await fetchMetaDescription(item.url);
      if (desc) item.summary = desc.slice(0, 500);
    }
  });
  await Promise.all(workers);
}

// ---------- Live fetch ----------

async function fetchFeed(feedUrl: string): Promise<ParsedItem[]> {
  const res = await fetch(feedUrl, {
    headers: {
      "User-Agent": "agents-team-news/0.1 (+local)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

async function refreshOneTopic(
  store: Store,
  topic: string,
  configured: string[],
): Promise<{ inserted: number; errors: string[] }> {
  const feeds = [...configured, googleNewsFeedFor(topic)];
  const threshold = Date.now() - REFRESH_WINDOW_MS;
  const collected: Omit<NewsItem, "id" | "fetched_at">[] = [];
  const errors: string[] = [];

  await Promise.all(
    feeds.map(async (feedUrl) => {
      const isGoogleNews = /(^|\.)news\.google\.com$/i.test(domainOf(feedUrl));
      try {
        const parsed = await fetchFeed(feedUrl);
        const feedSource = domainOf(feedUrl);
        for (const p of parsed) {
          const ts = p.pubDate ? Date.parse(p.pubDate) : NaN;
          if (!Number.isNaN(ts) && ts < threshold) continue;
          const source = (p.source && p.source.trim()) || feedSource;
          const originalTitle = p.title;
          let title = p.title;
          let summary = stripHtml(p.summary).slice(0, 500);
          if (isGoogleNews) {
            if (source) {
              const suffix = ` - ${source}`;
              if (title.endsWith(suffix)) {
                title = title.slice(0, -suffix.length).trim();
              }
            }
            if (isRedundantGoogleSummary(summary, originalTitle, source)) {
              summary = "";
            }
          }
          collected.push({
            topic,
            title,
            source,
            url: p.link,
            published_at: Number.isNaN(ts) ? "" : new Date(ts).toISOString(),
            summary,
          });
        }
      } catch (e) {
        errors.push(`${feedUrl}: ${(e as Error).message}`);
      }
    }),
  );

  const inserted = insertItems(store, collected);
  if (inserted.length > 0) {
    await enrichWithMeta(inserted);
  }
  return { inserted: inserted.length, errors };
}

// ---------- Route handler ----------

export async function POST(req: Request) {
  const sources = loadSources();
  const topics = Object.keys(sources);
  const store = loadStore();
  let totalInserted = 0;
  const errors: string[] = [];

  for (const topic of topics) {
    try {
      const { inserted, errors: feedErrors } = await refreshOneTopic(
        store,
        topic,
        sources[topic] ?? [],
      );
      totalInserted += inserted;
      for (const e of feedErrors) errors.push(`[${topic}] ${e}`);
    } catch (e) {
      errors.push(`[${topic}] ${(e as Error).message}`);
    }
  }

  saveStore(store);

  // Accept header to differentiate form-driven (HTML) from API callers.
  const accept = (req.headers.get("accept") ?? "").toLowerCase();
  if (accept.includes("application/json")) {
    return NextResponse.json({
      ok: true,
      topics: topics.length,
      inserted: totalInserted,
      ...(errors.length ? { errors } : {}),
    });
  }

  // Form-driven default: 303-redirect back to /news so a browser reload
  // shows the new items without re-POSTing on refresh.
  return NextResponse.redirect(new URL("/news", req.url), { status: 303 });
}
