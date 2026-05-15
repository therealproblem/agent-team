/**
 * news-ingest — fetches RSS/Atom feeds and persists items to a daily-rolling
 * SQLite store for the `news` skill.
 *
 * Source registry: `.pi/state/news-sources.json` — user-curated map of
 * `topic → [feed URL, ...]`. Topics not in the registry return
 * `fallback_hint: "no_rss_source"` so the `news` skill can delegate to the
 * `research` skill (DuckDuckGo + Camoufox) for ad-hoc topics.
 *
 * Storage: SQLite at `.pi/state/news.db`. Single table `news_items` with
 * `UNIQUE(topic, url)` so re-fetches dedup at the storage layer. The table
 * is **cleared daily, lazily** — every write first deletes rows whose
 * `fetched_at` is older than today (local time). The DB is the day's
 * working set; bookmarking is opt-in (the `news` skill calls `note-taker`
 * to copy an item into the vault on user request).
 *
 * Transport is plain Node `fetch()` — publisher RSS feeds don't need stealth.
 * If a feed turns out blocked, drop it from the registry and let the
 * `research` fallback in the skill cover that topic instead.
 *
 * Parser is hand-rolled (no `rss-parser` dep) — handles RSS 2.0 + Atom 1.0,
 * CDATA, common HTML entities, namespaced date elements.
 */

import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { Type } from "@earendil-works/pi-ai";
import {
	defineTool,
	type ExtensionAPI,
	type MessageRenderer,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, Spacer, Text } from "@earendil-works/pi-tui";

type DB = Database.Database;

interface NewsItem {
	id?: number;
	topic: string;
	title: string;
	source: string;
	url: string;
	published_at: string;
	summary: string;
	fetched_at?: string;
}

const SOURCES_PATH = join(process.cwd(), ".pi/state/news-sources.json");
const DB_PATH = join(process.cwd(), ".pi/state/news.db");

const FRESH_WINDOW_MS = 60 * 60 * 1000; // re-use DB rows fetched within the last hour

const WINDOW_MS: Record<"today" | "week" | "month", number> = {
	today: 24 * 60 * 60 * 1000,
	week: 7 * 24 * 60 * 60 * 1000,
	month: 30 * 24 * 60 * 60 * 1000,
};

// ---------- DB ----------

let _db: DB | null = null;

function db(): DB {
	if (_db) return _db;
	mkdirSync(dirname(DB_PATH), { recursive: true });
	_db = new Database(DB_PATH);
	_db.exec(`
		CREATE TABLE IF NOT EXISTS news_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			topic TEXT NOT NULL,
			title TEXT NOT NULL,
			source TEXT,
			url TEXT,
			published_at TEXT,
			summary TEXT,
			fetched_at TEXT NOT NULL,
			UNIQUE(topic, url)
		);
		CREATE INDEX IF NOT EXISTS idx_news_topic ON news_items(topic);
		CREATE INDEX IF NOT EXISTS idx_news_fetched ON news_items(fetched_at);
	`);
	return _db;
}

function purgeOld(): void {
	// Drop rows from any prior local-calendar day.
	db()
		.prepare(
			"DELETE FROM news_items WHERE date(fetched_at, 'localtime') < date('now', 'localtime')",
		)
		.run();
}

function insertItems(items: NewsItem[]): void {
	if (items.length === 0) return;
	purgeOld();
	const stmt = db().prepare(
		"INSERT OR IGNORE INTO news_items (topic, title, source, url, published_at, summary, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
	);
	const now = new Date().toISOString();
	for (const it of items) {
		stmt.run(it.topic, it.title, it.source, it.url, it.published_at, it.summary, now);
	}
}

function readRecent(topic: string, count: number): NewsItem[] {
	purgeOld();
	const cutoff = new Date(Date.now() - FRESH_WINDOW_MS).toISOString();
	return db()
		.prepare(
			"SELECT id, topic, title, source, url, published_at, summary, fetched_at FROM news_items WHERE topic = ? AND fetched_at >= ? ORDER BY published_at DESC LIMIT ?",
		)
		.all(topic, cutoff, count) as unknown as NewsItem[];
}

function readToday(topic: string | null, count: number): NewsItem[] {
	purgeOld();
	if (topic) {
		return db()
			.prepare(
				"SELECT id, topic, title, source, url, published_at, summary, fetched_at FROM news_items WHERE topic = ? ORDER BY published_at DESC LIMIT ?",
			)
			.all(topic, count) as unknown as NewsItem[];
	}
	return db()
		.prepare(
			"SELECT id, topic, title, source, url, published_at, summary, fetched_at FROM news_items ORDER BY topic, published_at DESC LIMIT ?",
		)
		.all(count) as unknown as NewsItem[];
}

function readById(id: number): NewsItem | null {
	purgeOld();
	const row = db()
		.prepare(
			"SELECT id, topic, title, source, url, published_at, summary, fetched_at FROM news_items WHERE id = ?",
		)
		.get(id) as unknown as NewsItem | undefined;
	return row ?? null;
}

function lastFetchedAt(): Date | null {
	// Don't purge before reading — if today's run hasn't happened yet we still
	// want to report yesterday's last scrape (and flag it stale).
	const row = db()
		.prepare("SELECT MAX(fetched_at) AS last FROM news_items")
		.get() as { last: string | null } | undefined;
	if (!row || !row.last) return null;
	const d = new Date(row.last);
	return Number.isNaN(d.getTime()) ? null : d;
}

function topicsCount(): number {
	const row = db()
		.prepare("SELECT COUNT(*) AS n FROM news_items")
		.get() as { n: number } | undefined;
	return row?.n ?? 0;
}

// ---------- Time formatting ----------

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function formatLocal(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatRelative(d: Date, now: Date = new Date()): string {
	const diffMs = now.getTime() - d.getTime();
	if (diffMs < 0) return "just now";
	const sec = Math.floor(diffMs / 1000);
	if (sec < 60) return "just now";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	if (day < 7) return `${day}d ago`;
	return `${day}d ago`;
}

function isStale(last: Date, now: Date = new Date()): boolean {
	// Stale = the last fetch was on a prior local-calendar day.
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	return last < startOfToday;
}

// ---------- Sources ----------

function loadSources(): Record<string, string[]> {
	try {
		const raw = readFileSync(SOURCES_PATH, "utf8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") return parsed;
		return {};
	} catch {
		return {};
	}
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

interface ParsedItem {
	title: string;
	link: string;
	pubDate: string;
	summary: string;
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
		if (title || link) out.push({ title, link, pubDate, summary });
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

// ---------- Live fetch ----------

async function fetchFeed(feedUrl: string): Promise<ParsedItem[]> {
	const res = await fetch(feedUrl, {
		headers: {
			"User-Agent": "agents-team-news/0.1 (+local)",
			Accept:
				"application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
		},
		signal: AbortSignal.timeout(15000),
		redirect: "follow",
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return parseFeed(await res.text());
}

interface FetchResult {
	items: NewsItem[];
	from_cache: boolean;
	fallback_hint?: "no_rss_source";
	errors?: string[];
}

async function liveFetch(
	topic: string,
	window: "today" | "week" | "month",
	count: number,
): Promise<FetchResult> {
	const sources = loadSources();
	const feeds = sources[topic];
	if (!feeds || feeds.length === 0) {
		return { items: [], from_cache: false, fallback_hint: "no_rss_source" };
	}

	const threshold = Date.now() - WINDOW_MS[window];
	const all: NewsItem[] = [];
	const errors: string[] = [];

	await Promise.all(
		feeds.map(async (feedUrl) => {
			try {
				const parsed = await fetchFeed(feedUrl);
				const source = domainOf(feedUrl);
				for (const p of parsed) {
					const ts = p.pubDate ? Date.parse(p.pubDate) : NaN;
					if (!Number.isNaN(ts) && ts < threshold) continue;
					all.push({
						topic,
						title: p.title,
						source,
						url: p.link,
						published_at: Number.isNaN(ts) ? "" : new Date(ts).toISOString(),
						summary: stripHtml(p.summary).slice(0, 500),
					});
				}
			} catch (e) {
				errors.push(`${feedUrl}: ${(e as Error).message}`);
			}
		}),
	);

	insertItems(all);
	const persisted = readToday(topic, count);
	const result: FetchResult = { items: persisted, from_cache: false };
	if (errors.length > 0) result.errors = errors;
	return result;
}

async function fetchTopicWithCache(
	topic: string,
	window: "today" | "week" | "month",
	count: number,
): Promise<FetchResult> {
	const cached = readRecent(topic, count);
	if (cached.length > 0) {
		return { items: cached, from_cache: true };
	}
	return liveFetch(topic, window, count);
}

// ---------- Tools ----------

const FetchTopicParams = Type.Object({
	topic: Type.String({ description: "Topic to fetch news for." }),
	window: Type.Optional(
		Type.Union(
			[
				Type.Literal("today"),
				Type.Literal("week"),
				Type.Literal("month"),
			],
			{ description: "Time window. Default: today." },
		),
	),
	count: Type.Optional(
		Type.Number({ description: "Max items to return. Default: 5." }),
	),
});

const fetchTopic = defineTool({
	name: "fetch_topic",
	label: "Fetch News Topic",
	description:
		"Fetch recent news items for a topic from configured RSS feeds, persist into the daily SQLite store, and return them. Reads from cache if rows for the topic were fetched within the last hour. Returns `fallback_hint: 'no_rss_source'` when the topic has no entry in `.pi/state/news-sources.json` — the `news` skill should fall back to `research` in that case.",
	parameters: FetchTopicParams,

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const window = params.window ?? "today";
		const count = params.count ?? 5;
		try {
			const result = await fetchTopicWithCache(params.topic, window, count);
			const summary =
				result.fallback_hint === "no_rss_source"
					? `No RSS source configured for "${params.topic}". Caller should fall back to research.`
					: `${result.from_cache ? "Cached" : "Fetched"} ${result.items.length} items for "${params.topic}"${
							result.errors
								? ` (${result.errors.length} feed error${result.errors.length === 1 ? "" : "s"})`
								: ""
						}.`;
			return {
				content: [{ type: "text", text: summary }],
				details: {
					items: result.items,
					from_cache: result.from_cache,
					...(result.fallback_hint ? { fallback_hint: result.fallback_hint } : {}),
					...(result.errors ? { errors: result.errors } : {}),
				},
			};
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [{ type: "text", text: `Fetch failed: ${message}` }],
				details: { items: [], error: message },
				isError: true,
			};
		}
	},
});

const QueryTodayParams = Type.Object({
	topic: Type.Optional(
		Type.String({
			description:
				"Filter to a single topic. Omit to read across all topics in today's store.",
		}),
	),
	count: Type.Optional(
		Type.Number({ description: "Max items. Default: 20." }),
	),
});

const queryToday = defineTool({
	name: "query_today",
	label: "Query Today's News",
	description:
		"Read items from today's SQLite store. Does NOT hit the network — fast, returns whatever was previously fetched (by interactive calls or by the cron refresh). Use this for 'show me today's headlines' / 'what's already in the store'. Use `fetch_topic` instead if you want to refresh from the live RSS feeds.",
	parameters: QueryTodayParams,

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const count = params.count ?? 20;
		const items = readToday(params.topic ?? null, count);
		return {
			content: [
				{
					type: "text",
					text: `${items.length} items in today's store${params.topic ? ` for "${params.topic}"` : ""}.`,
				},
			],
			details: { items },
		};
	},
});

const GetItemParams = Type.Object({
	id: Type.Number({ description: "Row id from a prior fetch_topic / query_today result." }),
});

const getItem = defineTool({
	name: "get_item",
	label: "Get News Item by ID",
	description:
		"Look up a single news item by its row id. Used by the `news` skill when the user asks to bookmark an item — the skill reads the full record here, then hands a markdown payload to `note-taker` for vault persistence.",
	parameters: GetItemParams,

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const item = readById(params.id);
		if (!item) {
			return {
				content: [{ type: "text", text: `No item with id ${params.id}.` }],
				details: { item: null },
				isError: true,
			};
		}
		return {
			content: [{ type: "text", text: `Item ${params.id}: ${item.title}` }],
			details: { item },
		};
	},
});

const RefreshAllParams = Type.Object({
	window: Type.Optional(
		Type.Union(
			[Type.Literal("today"), Type.Literal("week"), Type.Literal("month")],
			{ description: "Time window per topic. Default: today." },
		),
	),
	count_per_topic: Type.Optional(
		Type.Number({ description: "Max items per topic. Default: 20." }),
	),
});

const refreshAllTopics = defineTool({
	name: "refresh_all_topics",
	label: "Refresh All News Topics",
	description:
		"Fetch every topic in `.pi/state/news-sources.json` and write into the daily SQLite store. Designed for the morning cron — single tool call to populate the day's news. Bypasses the in-process freshness cache (the cron is the source of truth for daily refresh).",
	parameters: RefreshAllParams,

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const window = params.window ?? "today";
		const count = params.count_per_topic ?? 20;
		const sources = loadSources();
		const topics = Object.keys(sources);
		if (topics.length === 0) {
			return {
				content: [{ type: "text", text: "No topics configured in news-sources.json." }],
				details: { refreshed: [], errors: [] },
			};
		}

		const refreshed: { topic: string; count: number }[] = [];
		const errors: string[] = [];

		for (const topic of topics) {
			try {
				const result = await liveFetch(topic, window, count);
				refreshed.push({ topic, count: result.items.length });
				if (result.errors) {
					for (const e of result.errors) errors.push(`[${topic}] ${e}`);
				}
			} catch (e) {
				errors.push(`[${topic}] ${(e as Error).message}`);
			}
		}

		const total = refreshed.reduce((a, r) => a + r.count, 0);
		return {
			content: [
				{
					type: "text",
					text: `Refreshed ${topics.length} topic${topics.length === 1 ? "" : "s"} → ${total} items in store${
						errors.length > 0 ? ` (${errors.length} feed error${errors.length === 1 ? "" : "s"})` : ""
					}.`,
				},
			],
			details: { refreshed, ...(errors.length > 0 ? { errors } : {}) },
		};
	},
});

// ---------- TUI surface (status line + /news-refresh) ----------

const newsRenderer: MessageRenderer = (message, _options, theme) => {
	const container = new Container();
	container.addChild(new Spacer(1));
	const box = new Box(1, 1, (t: string) => theme.bg("customMessageBg", t));
	const text =
		typeof message.content === "string"
			? message.content
			: message.content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text)
					.join("\n");
	box.addChild(new Text(theme.fg("customMessageText", text), 0, 0));
	container.addChild(box);
	return container;
};

function surface(pi: ExtensionAPI, text: string, details?: object): void {
	pi.sendMessage(
		{
			customType: "news",
			content: text,
			display: true,
			details,
		},
		{ triggerTurn: false },
	);
}

function buildStatusLine(): { text: string; details: object } {
	const last = lastFetchedAt();
	if (!last) {
		return {
			text: "news: store is empty — run /news-refresh to populate (or wait for the cron).",
			details: { last: null, stale: true, total_items: 0 },
		};
	}
	const stale = isStale(last);
	const total = topicsCount();
	const absolute = formatLocal(last);
	const relative = formatRelative(last);
	const tail = stale
		? " — stale (cron skipped?). Run /news-refresh to refresh now."
		: "";
	return {
		text: `news: last refresh ${absolute} (${relative}), ${total} item${total === 1 ? "" : "s"} in store.${tail}`,
		details: { last: last.toISOString(), stale, total_items: total },
	};
}

export default function (pi: ExtensionAPI): void {
	pi.registerTool(fetchTopic);
	pi.registerTool(queryToday);
	pi.registerTool(getItem);
	pi.registerTool(refreshAllTopics);
	pi.registerMessageRenderer("news", newsRenderer);

	/**
	 * `/news-refresh` — manually trigger a full refresh of every topic in
	 * `.pi/state/news-sources.json`. Same code path as the cron's
	 * `refresh_all_topics` tool. Runs entirely inside the extension; no agent
	 * turn, no LLM cost.
	 *
	 * Async: surfaces a "started" line immediately, then a "done" line when
	 * the HTTP sweep completes (typically 5-30s depending on feed count and
	 * latency). Lock prevents concurrent invocations from doubling the work.
	 */
	let refreshInFlight = false;
	pi.registerCommand("news-refresh", {
		description: "Manually refresh the news store (replaces a skipped cron run)",

		async handler(_args, _ctx) {
			if (refreshInFlight) {
				surface(pi, "news: refresh already in progress — ignoring duplicate.");
				return;
			}
			refreshInFlight = true;
			surface(pi, "news: refresh started — fetching all topics in the registry…");
			try {
				const sources = loadSources();
				const topics = Object.keys(sources);
				if (topics.length === 0) {
					surface(pi, "news: no topics configured in .pi/state/news-sources.json.");
					return;
				}
				const refreshed: { topic: string; count: number }[] = [];
				const errors: string[] = [];
				for (const topic of topics) {
					try {
						const result = await liveFetch(topic, "today", 20);
						refreshed.push({ topic, count: result.items.length });
						if (result.errors) {
							for (const e of result.errors) errors.push(`[${topic}] ${e}`);
						}
					} catch (e) {
						errors.push(`[${topic}] ${(e as Error).message}`);
					}
				}
				const total = refreshed.reduce((a, r) => a + r.count, 0);
				const errTail =
					errors.length > 0
						? ` (${errors.length} feed error${errors.length === 1 ? "" : "s"} — see details)`
						: "";
				surface(
					pi,
					`news: refresh done — ${topics.length} topic${topics.length === 1 ? "" : "s"} → ${total} items in store${errTail}.`,
					{ refreshed, ...(errors.length > 0 ? { errors } : {}) },
				);
			} catch (e) {
				surface(pi, `news: refresh failed — ${(e as Error).message}`);
			} finally {
				refreshInFlight = false;
			}
		},
	});

	pi.on("session_start", async (event, _ctx) => {
		if (event.reason !== "startup" && event.reason !== "resume") return;
		try {
			const { text, details } = buildStatusLine();
			surface(pi, text, details);
		} catch {
			// Status surface must never break startup.
		}
	});
}
