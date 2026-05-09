/**
 * news-ingest — fetches and caches news for the `news` skill.
 *
 * Provides one tool: `fetch_topic`. Stub implementation returns an empty
 * list; the contract and 1-hour cache are functional. To activate, fill
 * in `realFetch` with an RSS / search-API / GDELT-backed implementation.
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface NewsItem {
	topic: string;
	title: string;
	source: string;
	url: string;
	published_at: string;
	summary: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { fetched_at: number; items: NewsItem[] }>();

const FetchTopicParams = Type.Object({
	topic: Type.String({ description: "Topic to fetch news for." }),
	window: Type.Optional(
		Type.Union([
			Type.Literal("today"),
			Type.Literal("week"),
			Type.Literal("month"),
		], { description: "Time window. Default: today." }),
	),
	count: Type.Optional(
		Type.Number({ description: "Max items to return. Default: 5." }),
	),
});

function cacheKey(topic: string, window?: string, count?: number): string {
	return `${topic}|${window ?? "today"}|${count ?? 5}`;
}

async function realFetch(_topic: string, _window?: string, _count?: number): Promise<NewsItem[]> {
	// TODO: implement real ingestion. Options:
	//   - RSS feed list per topic (fastest to build, narrow coverage)
	//   - A search API (broader, costs $ per call)
	//   - GDELT for global event-level granularity (free, structured, complex)
	return [];
}

const fetchTopic = defineTool({
	name: "fetch_topic",
	label: "Fetch News Topic",
	description:
		"Fetch recent news items for a topic. Used by the `news` skill. Returns cached results when available within the last hour.",
	parameters: FetchTopicParams,

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const key = cacheKey(params.topic, params.window, params.count);
		const now = Date.now();
		const cached = cache.get(key);
		if (cached && now - cached.fetched_at < CACHE_TTL_MS) {
			return {
				content: [
					{
						type: "text",
						text: `Returned ${cached.items.length} cached items for "${params.topic}".`,
					},
				],
				details: { items: cached.items, from_cache: true },
			};
		}
		try {
			const items = await realFetch(params.topic, params.window, params.count);
			cache.set(key, { fetched_at: now, items });
			return {
				content: [
					{
						type: "text",
						text:
							items.length === 0
								? `News ingest is not yet wired (TODO). 0 items for "${params.topic}".`
								: `Fetched ${items.length} items for "${params.topic}".`,
					},
				],
				details: { items, from_cache: false },
			};
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [{ type: "text", text: `Fetch failed: ${message}` }],
				details: { items: cached?.items ?? [], from_cache: !!cached, error: message },
				isError: true,
			};
		}
	},
});

export default function (pi: ExtensionAPI): void {
	pi.registerTool(fetchTopic);
}
