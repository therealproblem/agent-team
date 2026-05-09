---
description: Fetch and summarize recent news on user-specified topics. Used by domain agents (PM, Engineer, Trader) for context.
---

# News

Use this skill when the user (or another agent) wants curated, summarized news on one or more topics. Backed by the `news-ingest` extension which fetches and caches articles.

## When to call

- "What's happening in <topic> today / this week"
- A domain agent wants context on a subject (e.g. Engineer wants recent React 19 news, Trader wants gold-related macro headlines)
- Scheduled morning briefings

## Inputs

```
news.fetch({
  topics: ["<topic>", ...],          // required — e.g. ["AI", "JLPT", "XAUUSD"]
  window: "today" | "week" | "month" | { since: <ISO> },
  count: <number>,                   // max items per topic, default 5
  format: "headlines" | "summary" | "deepdive",
  audience: <free text>              // optional — passed to Scribe for output tuning
})
```

## Steps

1. Resolve topics to ingest queries via the `news-ingest` extension.
2. Fetch fresh items, falling back to cache if the source is unavailable.
3. Deduplicate across topics (same story tagged multiple ways → one entry).
4. If `audience` is set, route the assembled output through the `scribe` skill to tune tone.
5. Return structured items: `{ topic, title, source, url, published_at, summary }`.

## Don't

- Don't editorialize or take positions — News is a feed, not an analyst.
- Don't auto-save to the vault. The caller decides whether the news is worth a Note-taker entry.
- Don't bypass the cache for repeat queries within the same hour.