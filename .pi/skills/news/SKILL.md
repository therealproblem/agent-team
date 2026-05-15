---
description: Fetch and summarize recent news on user-specified topics. Used by domain agents (PM, Engineer, Trader) for context.
---

# News

Use this skill when the user (or another agent) wants curated, summarized news on one or more topics. Backed by the `news-ingest` extension which fetches RSS/Atom feeds and persists items into a daily-rolling JSON store at `.pi/state/news.json`.

## Storage model

- **Daily-rolling JSON file** is the truth for "what's in the news today". Items are deduped on `(topic, url)` and auto-purged at the next write once their day rolls over (local time).
- **The vault is opt-in, manual.** Items are NOT auto-saved to the vault. Bookmarking is user-driven: the user picks an item, the skill calls `note-taker` with a markdown payload that includes the original URL.
- A morning **cron job** (`scripts/news-cron.sh`, see AGENTS.md) calls `refresh_all_topics` to populate the store before you start your day. Throughout the day, `query_today` reads from the store without hitting the network; `fetch_topic` re-fetches a single topic if you want freshness on demand.
- **Session-start status line.** On Pi launch/resume, the extension surfaces a one-line status: `news: last refresh <YYYY-MM-DD HH:MM> (<relative>), <N> items in store.` If the last refresh is from a prior local-calendar day, the line appends `— stale (cron skipped?). Run /news-refresh to refresh now.` This is how you can tell, at a glance, whether the cron fired overnight while the laptop was asleep.
- **Manual refresh: `/news-refresh`.** Runs the same code path as `refresh_all_topics`, entirely inside the extension — no agent turn, no LLM cost. Use this when the startup line says "stale", or any time you want to force a re-pull. Surfaces a "started" line immediately and a "done" line when the HTTP sweep completes (typically 5–30s).
- **Browse the store: `/show-news`.** Surfaces the URL of a local HTML page (`/news` on the Next.js server) that reads `news.json` on each request. Tab control at the top toggles between **Highlights** (top 3 per topic) and **All** (everything in the store). Read-only, no network, no agent turn — use this when you want to skim what's in the store without going through a tool.

## When to call

- "What's happening in <topic> today / this week"
- A domain agent wants context on a subject (e.g. Engineer wants recent React 19 news, Trader wants gold-related macro headlines)
- Scheduled morning briefings

## Inputs

```
news.fetch({
  topics: ["<topic>", ...],          // required — e.g. ["AI", "tech", "XAUUSD"]
  window: "today" | "week" | "month" | { since: <ISO> },
  count: <number>,                   // max items per topic, default 5
  format: "headlines" | "summary" | "deepdive",
  audience: <free text>              // optional — passed to Scribe for output tuning
})
```

## Tools

The `news-ingest` extension exposes four tools:

| Tool | When |
|---|---|
| `query_today({ topic?, count? })` | **Default for "show me today's news".** Reads from the store. No network. Fastest. |
| `fetch_topic({ topic, window?, count? })` | When the user wants a freshness pull on a single topic. Live HTTP if the store has nothing fetched within the last hour for that topic; otherwise serves cached items. Always writes results back to the store. |
| `refresh_all_topics({ window?, count_per_topic? })` | Cron-driven. Iterates every topic in the registry, populates the store. Don't call from interactive use unless you really want a full re-fetch. |
| `get_item({ id })` | Look up a single item by id. Used by the bookmark flow. |

## Steps — "what's the news today"

1. Call `query_today({ count: 20 })` (or with `topic` if narrowed). Read items from `details.items`.
2. **If empty AND it's still early in the day**, the cron may not have run. Call `refresh_all_topics` once, then re-query.
3. **If empty for a specific topic** the user asked about, call `fetch_topic({ topic })`. If that returns `fallback_hint: "no_rss_source"`, the topic has no entry in `.pi/state/news-sources.json` — delegate to the `research` skill: `tff-search_web({ query: "<topic> news today", max_results: count*2 })`, optionally `tff-fetch_url` the top hits for bodies.
4. Cross-topic dedup (extension dedups *within* a topic only). Same story under "AI" and "tech" → one entry.
5. For `format: "summary"` / `"deepdive"` items whose `summary` is thin, optionally `research.tff-fetch_url(item.url, { format: "markdown" })` and trim to 2–5 sentences.
6. If `audience` is set, route the assembled output through `scribe` to tune tone.
7. Return structured items, **always including `id`** so the user can reference items for bookmarking.

## Steps — bookmark an item

When the user says "bookmark item 7" / "save the third one to the vault" / similar:

1. Resolve the user's reference to a row `id` (from the most recent listing you showed them).
2. Call `news-ingest.get_item({ id })`. If it returns `null`, the item was purged (e.g., user is referencing yesterday's listing) — say so.

3. Hand a markdown payload to `note-taker` with:
   - frontmatter: `title`, `date` (use `published_at` if present, else today), `source`, `url`, `tags: [bookmark, news, <topic>]`
   - body: 1–2 lines of context if the user gave any, then the `summary`, then a final `[Original: <source>](<url>)` link line
   - filename: `news/bookmarks/<YYYY-MM-DD>-<slugified-title>.md` (note-taker will resolve the exact path under its conventions)
4. Confirm with the user: vault path + URL.

The store entry is NOT deleted on bookmark — the user can bookmark the same item to multiple notes if they want, and the daily purge will sweep it eventually.

## Sources

The RSS source registry is `.pi/state/news-sources.json` — a map of `topic → [feed URL, ...]`. Topics in the registry are fetched directly; topics without an entry fall through to the `research` search-back path (step 2 above).

In addition, every topic in the registry is automatically supplemented with a Google News query (`https://news.google.com/rss/search?q=<topic>`) for cross-publisher coverage — no extra config required. Items from Google News use the per-item `<source>` tag as their publisher label (e.g. "The New York Times") and have their " - Publisher" suffix stripped from the title. Their `summary` is left empty: the Google News redirect URL is a JS interstitial, so meta-description scraping can't follow through to the article. Title + source carry the info.

- **Agents read it.** Only the user edits it.
- **Plain-fetch only.** Camoufox is not used at the extension layer. If a feed turns out to be blocked (CAPTCHA, 403, consent wall), remove it from `news-sources.json` and let the `research` fallback cover the topic instead.
- **Window filtering is per-item, by published date.** Feeds without proper `pubDate`/`published` elements bubble up undated and sort last.
- **`summary` is enriched from the article page.** After each new item is inserted, the extension does a one-shot GET against the item URL and pulls `og:description` / `<meta name="description">` / `twitter:description` (in that order) into `summary`. Falls back to the RSS-provided summary on any failure (timeout, non-HTML, missing meta). This is what gives feeds like `github-trending` real one-line repo descriptions instead of just titles.

### Persona conventions for topic keys

These are the topics the registry currently covers. Use the listed key — inventing a synonym ("ai-news", "trending-repos") will miss the registry and force a `research` fallback.

| Persona | Topic key | What it covers |
|---|---|---|
| (any) | `AI` | HN frontpage, Hugging Face blog, The Batch, Import AI, HN-AI keyword filter (≥50 points) |
| (any) | `science` | Quanta, Nature, Science Daily, Ars Technica Science |
| (any) | `tech` | Ars Technica, The Verge, TechCrunch — industry news |
| (any) | `psychology` | BPS Research Digest, Psyche (Aeon) |
| Engineer | `github-trending` | GitHub trending repos (daily, all languages, via mshibanami's hosted feed) |
| Engineer | `web-dev` | CSS-Tricks, Smashing Magazine, web.dev, Mozilla Hacks |
| Engineer | `mobile-dev` | Swift by Sundell (iOS), Android Developers Blog |
| Engineer | `dev-news` | Lobsters, Changelog — engineering-flavored industry news |
| PM | `product-hunt` | New launches from Product Hunt's main feed |
| Trader | `XAUUSD` | FXStreet news — gold / FX macro |

Snapshot — the registry is the source of truth. If a key isn't here or you're unsure, `read('.pi/state/news-sources.json')` to confirm before falling back to `research`.

## Don't

- Don't editorialize or take positions — News is a feed, not an analyst.
- Don't auto-save items to the vault. The vault is opt-in, manual: only on explicit bookmark.
- Don't call `refresh_all_topics` from interactive use — it's a full HTTP sweep across every feed in the registry. Use `fetch_topic` for single-topic freshness, `query_today` for everything else.
- Don't edit `news-sources.json` on the user's behalf without being asked — it's a user-curated file.