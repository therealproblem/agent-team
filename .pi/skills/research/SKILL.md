---
description: Layer 3 shared service — online research via stealth browser. Fetches URLs and searches the web through Camoufox (a fingerprint-resistant Firefox fork), bypassing common bot-blockers (Cloudflare, DataDome, PerimeterX). Backed by the `@the-forge-flow/camoufox-pi` extension. Invoke for "look up X online", "find sources on Y", web-side corpus assembly, library/framework research, market scans. NOT a writer — it returns raw HTML / markdown / search results that the calling persona reasons over.
---

# Research

Online-research service for any persona. Wraps two tools provided by the `@the-forge-flow/camoufox-pi` extension:

- **`tff-fetch_url`** — load a URL through a stealth Firefox instance and return its content (HTML / Markdown / screenshot).
- **`tff-search_web`** — DuckDuckGo web search, ranked results with snippets.

Research is a **read-side service**. It fetches and returns. It does NOT summarize, editorialize, or save to the vault — that's the caller's job.

## When to call

- "Look up X online" / "find current sources on Y"
- Persona is assembling a corpus and one of the source-types is web (RFCs, official docs, blog posts, GitHub READMEs, vendor pages)
- An advisor / status doc references something whose state changed since training cutoff (library version, regulatory change, market event)
- An on-site element is needed verbatim (changelog, release notes, pricing page) — fetch and quote
- A reviewer needs to verify a fact the active persona is asserting

**Do not invoke for:**
- General Q&A the model can answer without sources — don't reach for the web reflexively
- Anything inside the user's vault — that's `read`, not research
- News-style "what happened this week" — that's the `news` skill (which itself may eventually delegate here)

## Tool surface

```
tff-fetch_url({
  url: "<absolute URL>",                       // required
  format: "html" | "markdown",                 // markdown for read-friendly text, html for structured extraction
  wait_for_selector: "<css selector>",         // optional — block until present (JS-heavy pages)
  render_mode: "static" | "dynamic",           // dynamic = wait for JS; static = first paint
  timeout_ms: <number>,                        // default 30000
  max_bytes: <number>,                         // default ~2 MiB
  screenshot: <bool>                           // attach PNG screenshot
})

tff-search_web({
  query: "<search string>",
  max_results: <number>                        // default 10
})
```

Exact parameter names follow whatever `@the-forge-flow/camoufox-pi` exposes; consult `pi list` for the current tool schemas if anything below drifts.

## Steps

1. **Start with search, not fetch.** Unless the user gave you the URL, call `tff-search_web` first to surface candidate sources.
2. **Pick before fetching.** Look at the snippets. Don't fetch every result — pick the 1–3 most relevant URLs.
3. **Prefer markdown.** Use `format: "markdown"` for reading; only use `"html"` when you need structure (tables, specific elements, anchors).
4. **Cite as you reason.** Anything the caller surfaces to the user should be attributable to a fetched URL — keep the URL alongside any claim.
5. **Hand back, don't store.** Return the relevant excerpts plus URLs to the calling persona/skill. Saving to the vault (if warranted) is the caller's job via `note-taker` — and, if the caller wants an interactive presentation of the saved synthesis, a follow-up call to `render`.

## Caller patterns

| Caller | Use case |
|---|---|
| Educator (`corpus-learning`) | Web flow of corpus assembly — fetch landmark papers' abstracts, lecture pages, official docs |
| Educator (`feynman`, `content`) | Verify a definition or example against an authoritative source |
| Engineer | Library docs, GitHub README/CHANGELOG, RFCs, language reference pages, Stack Overflow / GitHub Issues |
| PM | Competitor pricing pages, public roadmaps, vendor changelogs, regulatory filings |
| Trader | Macro releases, exchange announcements, broker-spec pages — **never** for prescriptive market reads (still a student) |
| Language | Tatoeba / NHK Easy / dictionary pages for vocabulary mining |
| News (skill) | May delegate to `tff-fetch_url` for the actual ingest once `news-ingest` is fleshed out |

## Output style

- After a fetch, hand back: `{ url, title, content_excerpt }` — not the entire page body. Trim to what matters.
- After a search, hand back: ranked `{ title, url, snippet }` list. Let the caller pick.
- Synthesis built on top of fetched sources goes through `note-taker` (markdown, into the vault). If the caller wants the synthesis presented as an interactive HTML page, they call `render` after saving. Research itself never writes — it only returns excerpts + URLs.

## Don't

- **Don't browse without a goal.** Every call should answer a specific question the persona has.
- **Don't trust one source.** For anything contested (library best practice, framework comparison, market claim), pull 2–3 and cross-check.
- **Don't fetch what's already in the user's vault.** Read locally first.
- **Don't bypass robots.txt or paywalls.** The stealth profile defeats fingerprinting, not legal/ethical access rules.
- **Don't editorialize.** Research returns excerpts and URLs. The persona reasons; research fetches.

## Limits

- First invocation downloads the Camoufox binary (~500 MB). Expect a one-time delay.
- Dynamic pages may take 5–15s to render; use `wait_for_selector` to avoid grabbing pre-hydration content.
- Some sites still detect (any stealth tool is an arms race). If `tff-fetch_url` returns blocked content, surface that — don't fake a result.
