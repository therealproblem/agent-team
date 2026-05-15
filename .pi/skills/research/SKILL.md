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

## Reading the tool result — `details`, NOT `content`

Both Camoufox tools return two fields. **You must read from `details`, not from `content`.**

| Field | What's in it | When you'd read it |
|---|---|---|
| `content[0].text` | A one-line summary, e.g. `fetch_url https://… → 200 (15942 markdown bytes)` | Never for actual analysis. This is just the TUI's status display. |
| `details.markdown` | The full fetched page as markdown (when `format: "markdown"`) | **This is the page body.** Read it for content, quotes, facts. |
| `details.html` | The full fetched page as HTML (when `format` is omitted or `"html"`) | When you need DOM structure — tables, specific selectors. |
| `details.screenshot` | `{ encoding: "base64", mimeType, data, bytes }` | When the page renders something that doesn't survive markdown conversion. |
| `details.status`, `details.finalUrl`, `details.bytes`, `details.truncated` | Response metadata | Detect blocks (status 403/451), redirect targets, partial content. |
| `tff-search_web` `details.results` | Array of `{ title, url, snippet, source }` | The ranked hit list — the one-liner just says how many results came back. |

**A frequent failure mode:** the agent sees only the `content` summary (`200 (15942 markdown bytes)`), concludes the body wasn't returned, and reports a fake "tool limitation". The body IS returned — it's in `details.markdown`. Always read structured fields before claiming the tool didn't return what you needed.

If `details.markdown` is present but mostly login-wall / paywall / nav chrome (common on x.com, LinkedIn, Medium, Substack post-paywall), state that plainly to the caller — don't claim the tool failed. Then either retry with a viable mirror (see below) or escalate to the user.

## When a fetch returns garbage — the fallback ladder

A 200 status is not success. Pages that returned 16KB of "Sign in" CTAs, empty SPA shells, paywall teasers, or anti-bot puzzles all return 200. Apply these detection heuristics first; if any fire, the fetch *as far as your goal* failed and you must escalate.

### Heuristics — "fetched but not useful"

- **Body < 5KB** and you expected an article, thread, or doc page — likely an SPA shell.
- **Body contains "Sign in", "Log in", "Verify you are human", "Continue with Google", "Are you a robot"** as more than ~5% of the text — auth wall or anti-bot.
- **The entity you were looking for** (tweet body, article paragraph, code snippet, table row, definition) is **not anywhere in `details.markdown`** — page rendered, but not what you needed.
- **`details.truncated: true`** AND the missing tail is where the answer would live — body cap hit before the relevant section.
- **Body is mostly nav/footer/recommendation/CTA boilerplate** with no prose density — skim before quoting.
- **Status 403, 451, 429, or 5xx** — outright block, geo-block, rate-limit, server fault. Don't retry the same URL immediately.

If any apply, **walk the ladder before giving up.** Don't fetch the same URL twice with the same parameters. Each rung is "different enough" from the last that a new attempt has real signal.

### Step 1 — Pivot render mode and selector

If `render_mode: "static"` returned an SPA shell, retry with `render_mode: "dynamic"` and a `wait_for_selector` targeting the expected content (`article`, `[role=main]`, `.tweet-text`, `.markdown-body`, `[data-testid=tweetText]`). Bump `timeout_ms` to 60000 for JS-heavy pages.

### Step 2 — Canonical mirrors per host

| Host | Symptom | Mirror / workaround |
|---|---|---|
| `x.com` / `twitter.com` | "Sign in to X" CTAs, tweet body absent | `https://fxtwitter.com/<handle>/status/<id>` (renders the body) · `https://api.fxtwitter.com/<handle>/status/<id>` (JSON with text, media, author, reply chain) |
| `reddit.com` | JS-heavy chrome, paginated comments missing | `https://old.reddit.com/r/<sub>/comments/<id>/...` (lighter HTML) · append `.json` to ANY reddit URL for clean JSON (`/r/<sub>/comments/<id>.json`) |
| `medium.com` (post-paywall) | Truncated mid-paragraph | Find the author's `*.substack.com`, personal blog, or Hashnode mirror via `tff-search_web "<exact title>" site:substack.com OR site:dev.to OR site:hashnode.dev` |
| `linkedin.com` | Auth wall everywhere | Generally not retrievable. Try the person's personal site, Crunchbase, Wikipedia, or About-page on their employer's site. |
| `news.ycombinator.com` `item?id=<id>` | Works, but comments often missed by static render | `https://hn.algolia.com/api/v1/items/<id>` — full JSON thread, all comments, no rendering cost |
| `github.com/<owner>/<repo>/blob/<ref>/<path>` | HTML-wrapped file viewer | `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` — raw file |
| `github.com` issues / PRs / READMEs | Rate-limited or partial | `https://api.github.com/repos/<owner>/<repo>/issues/<n>`, `/pulls/<n>`, `/contents/README.md` (base64-encoded body) |
| `substack.com` post (paywall teaser) | Cut at the paywall fold | Search the title in quotes — paid posts are often quoted elsewhere; otherwise quote the teaser and flag |
| `nytimes.com`, `bloomberg.com`, `ft.com`, `wsj.com` | Hard paywall | Try archive.today (Step 3); otherwise surface the URL + paywall, don't fabricate the body |
| `quora.com` | Login required to read past the first answer | Skip — find the source quora pulled the answer from, or search for the question elsewhere |
| `instagram.com`, `tiktok.com`, `facebook.com` | Login required, JS-locked | Skip the page; use the platform's public-API mirror if one exists, or screenshot via `screenshot: true` if a teaser exists |
| `stackoverflow.com` | Works; verify `details.markdown` has the answers, not just the question | Re-fetch with `render_mode: "dynamic"` and `wait_for_selector: ".answer"` if answers are missing |

The list is illustrative, not exhaustive. **Principle:** every hostile host has a mirror, a JSON endpoint, or a less-defended sibling. Spend 30 seconds asking "is there a cleaner door?" before reporting failure.

### Step 3 — Web archives

When the live site is blocked, deleted, or geo-restricted:

- **Wayback Machine** — `https://web.archive.org/web/<url>` (without a timestamp picks the latest snapshot). Works for almost any URL that's been crawled in the last decade. Many paywalled sites are archived pre-paywall.
- **archive.today** — `https://archive.ph/<url>` or `https://archive.is/<url>` (rotating domains: `.ph`, `.is`, `.fo`, `.li`, `.md`, `.today`). Often archives sites Wayback can't (NYT, WSJ, FT post-paywall). If one TLD is down, try another.
- **Google Cache** — `https://webcache.googleusercontent.com/search?q=cache:<url>`. Deprecated for many sites in 2024 but still works for some; cheap to try.
- **Bing Cache** — search the URL in Bing; the cached link sometimes shows up next to the result.

### Step 4 — Format pivots on the same host

Many sites expose plain-text / JSON / RSS / print variants alongside the rendered page. Cheap to try, often dramatically cleaner:

- **Reddit:** append `.json` to any URL → full JSON of the post and comments.
- **HN:** `hn.algolia.com/api/v1/items/<id>` (covered above) or `hacker-news.firebaseio.com/v0/item/<id>.json`.
- **GitHub:** the REST API at `api.github.com` covers issues, PRs, READMEs, file contents, releases, commits.
- **YouTube** transcripts: `https://www.youtube.com/api/timedtext?lang=en&v=<id>` (when captions exist) or `youtubetranscript.com/?server_vid=<id>`.
- **RSS / Atom feeds:** try `<site>/feed`, `<site>/rss`, `<site>/atom.xml`, `<site>/index.xml`. Most blogs have one; many newsrooms expose one per section.
- **AMP variant:** prepend `https://www.google.com/amp/s/` to the host for sites that publish AMP — often a lighter, less anti-bot version.
- **Print variant:** try appending `?print=true`, `/print`, `print.html`, `?view=print` (older newsrooms).
- **`view-source:` equivalents:** if the page is an SPA, fetching the underlying JSON endpoint (visible in the network tab of the live page, but you can often guess: `/api/v1/<resource>/<id>`, `/_next/data/<build>/<path>.json` for Next.js sites, `/page-data/<route>/page-data.json` for Gatsby).

### Step 5 — Search-back from a partial signal

If you got *any* unique phrase from a partial fetch (a title, a sentence, a distinctive claim), `tff-search_web` for it in quotes. Re-hosts, mirrors, news aggregators, and quote sites will surface where else the same content lives.

Examples:
- `tff-search_web '"<exact title of the article>"'` → re-publications
- `tff-search_web '"<unique sentence from the lede>"'` → quote-aggregators, Hacker News submissions
- `tff-search_web 'site:archive.org <url>'` → check Wayback indexing without hitting Wayback directly

### Step 6 — Author-direct

For an individual's content (tweet, blog post, talk, paper), the canonical home is usually findable in two hops:

1. Search `"<author full name>" blog` or `"<author name>" personal site`.
2. Their GitHub profile, Mastodon bio, "link-in-bio" page, or About-page on their employer site usually lists the real domain.

Once you have the canonical site, fetch directly — bypasses every mirror's quirks.

### Step 7 — Triangulate from secondary sources

When the goal is a **fact** (a statistic, a definition, a date, a quote attributed to someone), not a specific source's wording:

- Search for the claim itself, not the original source.
- Pull 2–3 independent re-reports.
- The original may be paywalled, deleted, or behind auth — but if the claim is reported anywhere, you can verify and cite the re-report.

### When to actually stop

Surface "I couldn't get this" only when ALL three are true:

1. You've walked at least Steps 1–3 of the ladder for the specific URL.
2. You can name **why** it failed (auth-walled / geo-blocked / deleted / rate-limited / JS-required-and-unrenderable / paywall / 5xx).
3. You can say what you **did** retrieve (even if useless) and what's still missing.

The output is **never** "the tool didn't return content." The output is, e.g.:

> Tweet body retrieved via `fxtwitter.com` (the original `x.com` URL returned only the login wall). The thread's reply chain is not included in fxtwitter's response — if you need replies, I'd need to switch to the X API (auth required) or an alternate scraper.

That's a useful answer. The caller can decide whether to escalate.

## Steps

1. **Start with search, not fetch.** Unless the user gave you the URL, call `tff-search_web` first to surface candidate sources.
2. **Pick before fetching.** Look at the snippets. Don't fetch every result — pick the 1–3 most relevant URLs.
3. **Prefer markdown.** Use `format: "markdown"` for reading; only use `"html"` when you need structure (tables, specific elements, anchors).
4. **Cite as you reason.** Anything the caller surfaces to the user should be attributable to a fetched URL — keep the URL alongside any claim.
5. **Hand back, don't store.** Return the relevant excerpts plus URLs to the calling persona/skill. Saving to the vault (if warranted) is the caller's job via `note-taker` — and, if the caller wants an interactive presentation of the saved synthesis, a follow-up call to `present-interactive`.

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
- Synthesis built on top of fetched sources goes through `note-taker` (markdown, into the vault). If the caller wants the synthesis presented as an interactive HTML page, they call `present-interactive` after saving. Research itself never writes — it only returns excerpts + URLs.

## Don't

- **Don't browse without a goal.** Every call should answer a specific question the persona has.
- **Don't trust one source.** For anything contested (library best practice, framework comparison, market claim), pull 2–3 and cross-check.
- **Don't fetch what's already in the user's vault.** Read locally first.
- **Don't bypass robots.txt or paywalls.** The stealth profile defeats fingerprinting, not legal/ethical access rules.
- **Don't editorialize.** Research returns excerpts and URLs. The persona reasons; research fetches.
- **Don't claim the tool didn't return content** without first inspecting `details.markdown` (or `details.html`, or `details.results`). The `content` field is a TUI summary, not the payload. If you see only the summary line and conclude "the tool didn't return the body", you misread — read the structured `details` object first.
- **Don't surrender after one fetch.** A 200 status with login-wall content, an SPA shell, a paywall teaser, or a truncated body is not success. Walk the fallback ladder (render-mode pivot · canonical mirror · web archive · format pivot · search-back · author-direct · triangulate) before reporting failure. Every hostile host has a cleaner door — spend 30 seconds looking for it.
- **Don't refetch the same URL with the same parameters.** If a fetch returned garbage, the next attempt must be *different* (different render mode, different selector, different host, different format). Retrying identical parameters wastes a Camoufox session.
- **Don't fabricate content** when the fetch is partial or blocked. Say what you got, name why it's incomplete, and propose the next ladder step or escalate to the user. Fabricating from training data instead of admitting the gap is the worst failure mode of this skill.

## Limits

- First invocation downloads the Camoufox binary (~500 MB). Expect a one-time delay.
- Dynamic pages may take 5–15s to render; use `wait_for_selector` to avoid grabbing pre-hydration content.
- Some sites still detect (any stealth tool is an arms race). If `tff-fetch_url` returns blocked content, surface that — don't fake a result.
