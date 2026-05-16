/**
 * news-ingest — fetches RSS/Atom feeds and persists items to a daily-rolling
 * JSON store for the `news` skill.
 *
 * Source registry: `.pi/state/news-sources.json` — user-curated map of
 * `topic → [feed URL, ...]`. Topics not in the registry return
 * `fallback_hint: "no_rss_source"` so the `news` skill can delegate to the
 * `research` skill (DuckDuckGo + Camoufox) for ad-hoc topics.
 *
 * Storage: JSON file at `.pi/state/news.json`. Items dedup on `(topic, url)`
 * so re-fetches collapse at the storage layer. The store is **cleared daily,
 * lazily** — every write first drops items whose `fetched_at` is older than
 * today (local time). The file is the day's working set; bookmarking is
 * opt-in (the `news` skill calls `note-taker` to copy an item into the vault
 * on user request).
 *
 * Transport is plain Node `fetch()` — publisher RSS feeds don't need stealth.
 * If a feed turns out blocked, drop it from the registry and let the
 * `research` fallback in the skill cover that topic instead.
 *
 * Parser is hand-rolled (no `rss-parser` dep) — handles RSS 2.0 + Atom 1.0,
 * CDATA, common HTML entities, namespaced date elements.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import {
	defineTool,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createBoxRenderer, surface as surfaceShared } from "../../lib/tui";

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
const STORE_PATH = join(process.cwd(), ".pi/state/news.json");

const FRESH_WINDOW_MS = 60 * 60 * 1000; // re-use rows fetched within the last hour

const WINDOW_MS: Record<"today" | "week" | "month", number> = {
	today: 24 * 60 * 60 * 1000,
	week: 7 * 24 * 60 * 60 * 1000,
	month: 30 * 24 * 60 * 60 * 1000,
};

// ---------- Store ----------

interface Store {
	next_id: number;
	items: NewsItem[];
}

let _store: Store | null = null;

function load(): Store {
	if (_store) return _store;
	mkdirSync(dirname(STORE_PATH), { recursive: true });
	if (existsSync(STORE_PATH)) {
		try {
			const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8"));
			if (parsed && Array.isArray(parsed.items) && typeof parsed.next_id === "number") {
				_store = parsed as Store;
				return _store;
			}
		} catch {
			// Fall through to fresh store on parse error.
		}
	}
	_store = { next_id: 1, items: [] };
	return _store;
}

function save(): void {
	if (!_store) return;
	writeFileSync(STORE_PATH, JSON.stringify(_store));
}

function startOfToday(now: Date = new Date()): number {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function purgeOld(): void {
	const store = load();
	const cutoff = startOfToday();
	const before = store.items.length;
	store.items = store.items.filter((it) => {
		const t = Date.parse(it.fetched_at);
		return !Number.isNaN(t) && t >= cutoff;
	});
	if (store.items.length !== before) save();
}

function compareDescByPublished(a: NewsItem, b: NewsItem): number {
	const ta = Date.parse(a.published_at);
	const tb = Date.parse(b.published_at);
	const va = Number.isNaN(ta) ? 0 : ta;
	const vb = Number.isNaN(tb) ? 0 : tb;
	return vb - va;
}

function insertItems(items: NewsItem[]): NewsItem[] {
	if (items.length === 0) return [];
	purgeOld();
	const store = load();
	const seen = new Set(store.items.map((it) => `${it.topic} ${it.url}`));
	const now = new Date().toISOString();
	const inserted: NewsItem[] = [];
	for (const it of items) {
		const key = `${it.topic} ${it.url}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const row: NewsItem = {
			id: store.next_id++,
			topic: it.topic,
			title: it.title,
			source: it.source,
			url: it.url,
			published_at: it.published_at,
			summary: it.summary,
			fetched_at: now,
		};
		store.items.push(row);
		inserted.push(row);
	}
	if (inserted.length > 0) save();
	return inserted;
}

function readRecent(topic: string, count: number): NewsItem[] {
	purgeOld();
	const cutoff = Date.now() - FRESH_WINDOW_MS;
	return load()
		.items.filter((it) => {
			if (it.topic !== topic) return false;
			const t = Date.parse(it.fetched_at);
			return !Number.isNaN(t) && t >= cutoff;
		})
		.sort(compareDescByPublished)
		.slice(0, count);
}

function readToday(topic: string | null, count: number): NewsItem[] {
	purgeOld();
	const items = load().items.filter((it) => (topic ? it.topic === topic : true));
	if (topic) {
		return items.sort(compareDescByPublished).slice(0, count);
	}
	return items
		.sort((a, b) => {
			if (a.topic !== b.topic) return a.topic < b.topic ? -1 : 1;
			return compareDescByPublished(a, b);
		})
		.slice(0, count);
}

function readById(id: number): NewsItem | null {
	purgeOld();
	return load().items.find((it) => it.id === id) ?? null;
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
	source?: string;
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
		// Google News RSS attaches the publisher name in <source>.
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

// Detect Google News /rss/search descriptions that just restate the title
// and publisher (the search-RSS shape: "<a>Title</a> Publisher"). Returns
// true when the summary adds nothing past what title+source already say,
// so the caller can blank it out and avoid three near-identical lines per
// item. Cluster-shaped descriptions from /rss (top stories) survive.
function isRedundantGoogleSummary(
	summary: string,
	title: string,
	source: string,
): boolean {
	const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
	const sum = norm(summary);
	if (!sum) return true;
	const t = norm(title);
	const s = norm(source);
	if (sum === t) return true;
	if (sum === `${t} ${s}`) return true;
	// Allow a few extra characters of slop (punctuation, stray chars).
	if (sum.startsWith(t) && sum.endsWith(s) && sum.length <= t.length + s.length + 4) {
		return true;
	}
	return false;
}

// Google News exposes a free RSS endpoint per search query. Used as a
// supplemental source for every topic so we get cross-publisher coverage
// without each topic needing every relevant feed enumerated by hand.
//
// hl/gl/ceid pin the locale so results are stable across runs. Topic key
// is used directly as the query — if it's too generic ("tech") expect
// noise; tighten the topic name in news-sources.json if that bites.
function googleNewsFeedFor(topic: string): string {
	const q = encodeURIComponent(topic);
	return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

// ---------- SEO meta enrichment ----------
//
// RSS summaries are wildly inconsistent — some feeds give the full article
// body (huge, noisy), others give one line, GitHub trending gives nothing
// at all. Each newly-inserted item is followed up with a single GET against
// its URL so we can pull a clean one-paragraph summary from the page's
// `og:description` / `<meta name="description">` (twitter as last resort).
// Failures are silent — the RSS-provided `summary` stays as the fallback.

const ENRICH_CONCURRENCY = 6;
const ENRICH_TIMEOUT_MS = 8000;
const ENRICH_HEAD_BYTES = 64 * 1024;

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
	// Google News URLs lead to a JS-rendered interstitial that has no
	// og:description, so fetching them is pure waste. Skip them.
	const queue = items.filter(
		(it) => it.url && !/(^|\.)news\.google\.com$/i.test(domainOf(it.url)),
	);
	if (queue.length === 0) return;
	let next = 0;
	const workerCount = Math.min(ENRICH_CONCURRENCY, queue.length);
	const workers = Array.from({ length: workerCount }, async () => {
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
	const configured = sources[topic];
	if (!configured || configured.length === 0) {
		return { items: [], from_cache: false, fallback_hint: "no_rss_source" };
	}
	// Always supplement the registry with a Google News query for the topic.
	// Items are deduped on (topic, url), so overlap with publisher feeds is
	// safe (Google News redirect URLs differ from the publisher canonical,
	// so true duplicates can sneak through, but we accept that tradeoff).
	const feeds = [...configured, googleNewsFeedFor(topic)];

	const threshold = Date.now() - WINDOW_MS[window];
	const all: NewsItem[] = [];
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
					// Prefer per-item publisher (Google News exposes this in
					// <source>) over the feed's own host.
					const source = (p.source && p.source.trim()) || feedSource;
					const originalTitle = p.title;
					let title = p.title;
					let summary = stripHtml(p.summary).slice(0, 500);
					if (isGoogleNews) {
						// Google News titles are "Title - Publisher". The
						// publisher is already in `source`, so drop the suffix.
						if (source) {
							const suffix = ` - ${source}`;
							if (title.endsWith(suffix)) {
								title = title.slice(0, -suffix.length).trim();
							}
						}
						// /rss/search returns "<a>title</a> publisher" as the
						// description — pure restatement of fields we already
						// show. /rss (top stories) returns a real <ol> of
						// related articles in the cluster — useful. Suppress
						// only the former; keep the latter.
						if (isRedundantGoogleSummary(summary, originalTitle, source)) {
							summary = "";
						}
					}
					all.push({
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

	const inserted = insertItems(all);
	if (inserted.length > 0) {
		await enrichWithMeta(inserted);
		// `inserted` rows are the same object refs that live in the in-memory
		// store, so the mutated summaries are now in `_store.items` — just
		// flush to disk.
		save();
	}
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
		"Fetch recent news items for a topic from configured RSS feeds, persist into the daily JSON store, and return them. Reads from cache if rows for the topic were fetched within the last hour. Returns `fallback_hint: 'no_rss_source'` when the topic has no entry in `.pi/state/news-sources.json` — the `news` skill should fall back to `research` in that case.",
	parameters: FetchTopicParams,

	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
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
			updateStatus(ctx);
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
		"Read items from today's JSON store. Does NOT hit the network — fast, returns whatever was previously fetched (by interactive calls or by the cron refresh). Use this for 'show me today's headlines' / 'what's already in the store'. Use `fetch_topic` instead if you want to refresh from the live RSS feeds.",
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
		"Fetch every topic in `.pi/state/news-sources.json` and write into the daily JSON store. Designed for the morning cron — single tool call to populate the day's news. Bypasses the in-process freshness cache (the cron is the source of truth for daily refresh).",
	parameters: RefreshAllParams,

	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
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

		updateStatus(ctx);
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

function surface(pi: ExtensionAPI, text: string, details?: object): void {
	surfaceShared(pi, "news", text, details);
}

/**
 * Push current store count into the footer statusline. Failures are
 * swallowed — a status-line update must never crash the agent.
 */
function updateStatus(ctx: ExtensionContext): void {
	try {
		purgeOld();
		const count = load().items.length;
		ctx.ui.setStatus("1news", `NEWS ${count}`);
	} catch {
		// best-effort
	}
}


export default function (pi: ExtensionAPI): void {
	pi.registerTool(fetchTopic);
	pi.registerTool(queryToday);
	pi.registerTool(getItem);
	pi.registerTool(refreshAllTopics);
	pi.registerMessageRenderer("news", createBoxRenderer());

	pi.on("session_start", (_event, ctx) => {
		// Pi clears the extension-status map on every session_start, so the
		// NEWS cell must be re-published for every reason — otherwise it
		// disappears from the footer after /new or /reload. updateStatus is
		// a pure read (purge + count + setStatus), safe to re-run.
		updateStatus(ctx);
	});

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

		async handler(_args, ctx) {
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
				updateStatus(ctx);
			}
		},
	});

	/**
	 * `/show-news` — surface the local news page URL. The page is rendered
	 * by the Next.js server at `app/news/page.tsx`, reads `.pi/state/news.json`
	 * on each request, and offers a Highlights / All toggle. No agent turn,
	 * no network, no LLM cost — this command just hands the URL to the user.
	 */
	pi.registerCommand("show-news", {
		description: "Open the local news page (Highlights / All toggle)",

		async handler(_args, _ctx) {
			const base =
				process.env.AGENTS_TEAM_SERVER_PUBLIC_URL ?? "http://localhost:8080";
			surface(pi, `news: ${base}/news`);
		},
	});
}
