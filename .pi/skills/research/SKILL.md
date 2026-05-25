---
description: Layer 3 orchestrator — coordinates the research pipeline (frame → survey → rank → fetch → triangulate → interrogate → steelman → synthesize → stop-check → capture) over the stealth-fetch tools `tff-fetch_url` and `tff-search_web` (via the `@the-forge-flow/camoufox-pi` extension). Survey runs 2–3 competing strategies; stop-check grades a weighted success_rubric and loops while score climbs. On completion, appends a row to the cross-run logbook (`research-log.jsonl`) so future runs pre-pick winning strategies. Also owns the fetch-reliability ladder (host mirrors, web archives, format pivots) for when a fetch returns garbage. Invoke for "look up X online", "find sources on Y", web-side corpus assembly, library/framework research, market scans. Handles "what did I research recently?" via `research-tree.find_overlap`, and "what's been working?" via `research-tree.log_summary`.
---

# Research

Layer 3 orchestrator. Online research for any persona, running a 9-skill pipeline. The orchestrator's job: run the phases in order, pass artifacts between them, handle escalations from `research-branch`, and loop back when `research-stop-check`'s score is still climbing. It does NOT do the per-phase work itself — that's the inner skills' job. The loop is *measurable*: each iteration's stop-score and the winning survey strategy get persisted, so the pipeline learns over time.

```
research-frame (emits success_rubric)
  → research-tree.find_overlap + research-tree.log_summary (cross-run priors)
  → research-tree.start_run
  → research-survey (runs 2–3 competing strategies; winner feeds downstream)
  → source-rank
  → tff-fetch_url × N  ↔  research-branch (mid-flight discoveries)
  → research-corpus-check (pre-synthesis gate; may loop back to source-rank or survey)
  → triangulate (on factual claims)
  → research-interrogate (on load-bearing claims, when mechanism_clarity is in the rubric)
  → steelman (on tentative conclusions)
  → synthesize
  → research-stop-check (grades rubric → score 0..1; loops while climbing, ships at score ≥ 0.85 or plateau)
  → note-taker → render-html / export
  → research-tree.complete_run (writes one row to research-log.jsonl with persona, shape, winning strategy, final score)
```

This skill also owns the **fetch-reliability ladder** (later in this doc) — the cross-cutting toolkit for when a single `tff-fetch_url` returns garbage. Inner skills (`research-survey`, `triangulate`, `steelman`) use the ladder via this skill's documentation.

## The inner skills

| # | Skill | Phase | Form |
|---|---|---|---|
| 1 | `research-frame` | 1. Frame | Layer 3 skill — sharpens question + deliverable shape + depth budget; emits weighted `success_rubric` |
| 2 | `research-tree` | state | Layer 3 skill — tree-shaped state file with per-claim provenance + cross-run logbook |
| 3 | `research-survey` | 2. Survey | Layer 3 skill — 2–3 competing strategies; winner's terrain map feeds downstream |
| 4 | `source-rank` | 3. Plan | Layer 3 skill — score candidates, pick deep reads |
| 5 | `research-corpus-check` | 3.5 Corpus gate | Layer 3 skill — pre-synthesis fitness check; loops back to source-rank if lopsided |
| 6 | `triangulate` | 4. Cross-check | Layer 3 skill — fact verification + common-origin check |
| 7 | `research-interrogate` | 4.25 Mechanism check | Layer 3 skill — "why is this true?" pass on load-bearing claims; ran when `mechanism_clarity` is in the rubric |
| 8 | `steelman` | 4.5 Disconfirm | Sub-agent (isolated context) — strongest-opposing-case pass |
| 9 | `research-branch` | cross-cutting | Layer 3 skill — discovery-driven branching loop |
| 10 | `synthesize` | 5. Synthesize | Layer 3 skill — structured deliverable from tree + sources |
| 11 | `research-stop-check` | 6. Capture gate | Layer 3 skill — rubric-scored gate with `feynman_clarity` plain-rewrite test before handoff |

## Tool surface — Camoufox extension

Two tools come from `@the-forge-flow/camoufox-pi`:

- **`tff-fetch_url`** — load a URL through a stealth Firefox instance and return its content (HTML / Markdown / screenshot).
- **`tff-search_web`** — DuckDuckGo web search, ranked results with snippets.

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

Exact parameter names follow whatever `@the-forge-flow/camoufox-pi` exposes; consult `pi list` if anything drifts.

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

If `details.markdown` is present but mostly login-wall / paywall / nav chrome (common on x.com, LinkedIn, Medium, Substack post-paywall), state that plainly to the caller — don't claim the tool failed. Then either retry with a viable mirror (see the fetch-reliability ladder below) or escalate to the user.

## The orchestrated pipeline

### 1. Frame the request

Call `research-frame`. Returns `{ question, deliverable_shape, depth_budget, success_criteria, success_rubric }`. The rubric (weighted gradeable criteria) is the contract `research-stop-check` will score against. The plain `success_criteria` list is the human-readable version used by `research-corpus-check` and the synthesis.

### 2. Check prior research and cross-run priors

Two queries, both cheap:

**2a. Near-duplicate check.** Call `research-tree.find_overlap({ user_request })`. If a prior run matches (similarity ≥ 0.6):

- Surface the prior artifact (vault path / render URL).
- Ask the user: open the existing, run fresh, or proceed both ways.
- If user wants the existing, return that URL — don't proceed to phase 3.
- If user wants fresh, proceed but tag the new run with `notes: "supersedes <prior_run_id>"`.

**2b. Strategy prior from the logbook.** Call `research-tree.log_summary({ persona, shape: frame.deliverable_shape })`. The result has `recommended_strategy_set` and `confidence`:

- `confidence: high` → trust the recommendation; pass it as `strategy_set` to `research-survey`.
- `confidence: medium` → use the recommendation as the seed, but ensure shape-mandatory strategies are included (e.g. `counter-position` for `decision`).
- `confidence: low | none` → fall back to the shape's default strategy menu (see `research-survey`'s "Strategy selection by shape").

In all cases, the orchestrator may override based on the request (if the user asks for "the contrarian view on X", force `counter-position` regardless of priors).

If no overlap, call `research-tree.start_run({ user_request, frame })` and proceed.

### 3. Survey the terrain

Call `research-survey` with `{ question, deliverable_shape, depth_budget, strategy_set }`. The survey runs each strategy in parallel, scores them by coverage breadth, and returns the winner's terrain map plus a `strategy_competition` record. Retain the `strategy_competition` object — it goes to `complete_run` later for the logbook. Snippet-only; no fetches.

### 4. Pick sources

Call `source-rank` with the survey output. Returns ranked + picked URLs. Drop high-access-risk sources only after checking the fetch-reliability ladder for viable mirrors.

### 5. Deep-read in parallel

Fetch each picked URL via `tff-fetch_url` (markdown by default). For each fetch:

- If garbage returned, walk the fetch-reliability ladder (below).
- If a discovery fires (prereq / parent / sibling / pivot / citation / disqualifier), call `research-branch` — it may spawn child nodes, escalate to user, or stop the run.
- On success, store the source via `research-tree.add_source(...)` and any extracted claims via `research-tree.add_claim(...)`.

### 6. Corpus-readiness check

Call `research-corpus-check` with `{ frame, tree, survey_diagnostics }`. Returns `{ passed, checks, loop_back_to, warnings }`. Catches lopsided corpora (single-domain, single-voice, missing recency, uncovered success criteria) before the expensive phases burn budget.

If `passed: false`:
- Loop back to the phase named in `loop_back_to` (typically `source-rank`; `survey` only if the queries themselves need rethinking).
- Max 1 loop per run on this check. If still failing, surface to user with the corpus issue. User can explicitly bypass ("ship it") — failures appear in a `## Known corpus gaps` section appended to the synthesis.

### 7. Verify factual claims

For any load-bearing factual claim the synthesis will assert, call `triangulate`. Required when `deliverable_shape: "fact-check"`. Optional but recommended for `decision` and `comparison` shapes where a single bad fact would change the verdict.

### 7.5. Interrogate mechanisms

If `frame.success_rubric` includes `mechanism_clarity` (default for `decision` and `fact-check`; opt-in for other shapes when the request asks "how does X work" or "why does Y happen"), call `research-interrogate` with the load-bearing claim list. The skill runs a "why is this true?" pass per claim — checks the existing source first, runs one capped follow-up search if absent, and tags each claim `found_in_existing | found_via_followup | unclear`.

The orchestrator passes the `interrogations` array into `synthesize` along with the tree. If `synthesis_note_required: true` (one or more claims `unclear`), instruct `synthesize` to surface those gaps honestly in "What's contested" (or a dedicated "Mechanism unclear" section for `decision`/`fact-check`) rather than papering over them. Mechanism-found claims get their explanation woven into the body.

Skip this step when `mechanism_clarity` is absent from the rubric — it's a quality-lift, not a baseline check.

### 8. Disconfirming pass

For `deliverable_shape ∈ {decision, fact-check, comparison}`, spawn the `steelman` subagent with the tentative conclusion. Required for `deep` depth_budget on any shape. The agent runs in an isolated child process — its result feeds into synthesize.

### 9. Synthesize

Call `synthesize` with `{ frame, tree, sources, triangulate_results, steelman_result }`. Returns a structured markdown body matching the deliverable_shape contract.

### 10. Stop-check

Call `research-stop-check` with `{ frame, synthesis_markdown, tree, steelman_run, triangulate_runs, previous_score, iteration }`. The check grades the synthesis against `frame.success_rubric` (per-criterion 0/0.5/1), computes a weighted `score` (0..1), runs the structural sanity checks, and returns a `verdict`:

| `verdict` | What the orchestrator does |
|---|---|
| `ship` | Proceed to capture. Hand `score` to `complete_run`. |
| `loop` | Re-enter the phase in `loop_back_to`. Increment `iteration`. Carry `score` forward as `previous_score` for the next stop-check call. Hard cap: 3 stop-check calls per run. |
| `ship_with_gaps` | Proceed to capture, but append a `## Known gaps` section listing the rubric's weak criteria + any structural-check failures. Hand `score` to `complete_run`. |

Tracking the score trajectory is the orchestrator's job — `research-stop-check` itself is stateless. Initialize `previous_score = null` and `iteration = 1`; on each loop, set `previous_score = score` and `iteration += 1` before re-calling stop-check.

If the user explicitly bypasses ("ship it" / "good enough"), force `ship_with_gaps` regardless of `verdict` — but still run stop-check so the `## Known gaps` section is honest.

### 11. Capture

Call `note-taker.save({ ... })` with the synthesized markdown (plus the `## Known gaps` appendix if applicable). By default, follow with `render-html` (see "Default downstream action" below). Get the artifact URL back.

### 12. Complete the run

Call `research-tree.complete_run({ run_id, deliverable_artifact: <url>, stop_score, survey_competition, persona, iterations })`. The run becomes immutable in the tree AND one row gets appended to `.pi/state/research-log.jsonl`:

```json
{
  "ts": "...",
  "run_id": "...",
  "persona": "<calling persona key>",
  "shape": "<deliverable_shape>",
  "depth_budget": "<budget>",
  "question": "<frame.question, ≤200 chars>",
  "survey_strategies": { "winner": "<name>", "winner_score": <float>, "ran": ["<name>", "..."] },
  "stop_score": <float>,
  "iterations": <int>,
  "verdict": "ship | ship_with_gaps",
  "artifact": "<url>"
}
```

The orchestrator does NOT append to the logbook itself — that's `research-tree`'s job and it happens inside `complete_run`. Just hand it the aggregates.

## Fetch-reliability ladder

A 200 status is not success. Pages that returned 16KB of "Sign in" CTAs, empty SPA shells, paywall teasers, or anti-bot puzzles all return 200. Apply these detection heuristics first; if any fire, the fetch *as far as your goal* failed and you must walk the ladder.

### Heuristics — "fetched but not useful"

- **Body < 5KB** and you expected an article, thread, or doc page — likely an SPA shell.
- **Body contains "Sign in", "Log in", "Verify you are human", "Continue with Google", "Are you a robot"** as more than ~5% of the text — auth wall or anti-bot.
- **The entity you were looking for** (tweet body, article paragraph, code snippet, table row, definition) is **not anywhere in `details.markdown`** — page rendered, but not what you needed.
- **`details.truncated: true`** AND the missing tail is where the answer would live — body cap hit before the relevant section.
- **Body is mostly nav/footer/recommendation/CTA boilerplate** with no prose density — skim before quoting.
- **Body is paginated** (next-page link, `« prev | next »`, `1 2 3 … N` pager, "Showing 1–25 of 200", "Page 1 of 8") and the answer plausibly lives past page 1 — forum thread, search-results list, comment tree, archive index, issue/PR comments.
- **Status 403, 451, 429, or 5xx** — outright block, geo-block, rate-limit, server fault. Don't retry the same URL immediately.

If any apply, walk the ladder. Don't fetch the same URL twice with the same parameters. Each rung is "different enough" from the last that a new attempt has real signal.

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

### Step 5 — Walk the pagination

When the fetch succeeded but the answer plausibly lives past page 1 (forum thread, search results, comment list, archive index, issue/PR comments), don't declare done at page 1.

**Primary — follow the next link from page 1's body.** Most paginated UIs render the "Next →" affordance in static HTML. Search `details.markdown` for `[Next](...)`, `[Next →](...)`, `[« Prev | Next »](...)`, numbered `[2](...) [3](...) [4](...)` pagers, or `Page 1 of N` / `Showing 1–25 of 200` totals. Extract the href, fetch it, repeat until the answer is found, the next link disappears, or you hit the **5-page cap** (bump explicitly if the question demands it). Don't guess from the URL shape when the body already tells you the right next URL.

**Fallback — guess the URL pattern.** When the body hides pagination behind JS, try the convention for the host:

| Pattern | Common on |
|---|---|
| `?page=N` | Discourse, generic |
| `/page/N/` | WordPress, Ghost, blogs |
| `?start=N` (offset, not page) | phpBB, vBulletin |
| `thread-<id>-<N>-1.html` | Discuz |
| `?after=<id>` / `?before=<id>` cursor | reddit JSON, Mastodon, modern APIs |
| `?max_id=<id>` | Twitter-style timelines |
| `&offset=N` / `&from=N` | Elastic-backed search, GitHub search |

For cursor pagination you **cannot guess** the next cursor — extract it from the response body's `next` / `pagination.next` / last-item id, or fall back to a JSON mirror that exposes it.

**Search-results pagination.** `tff-search_web` has no `page` param — bump `max_results` and re-query (refining with `-<noisy-top-term>` often surfaces what page 2 of a SERP would have shown).

**When not to paginate:**

- The fetched page already contains the entity you needed — stop.
- A Step-2 JSON mirror covers the whole thing in one shot (reddit `.json`, HN Algolia, SE API, GitHub API) — use that instead.
- The question is "what does this thread say overall" not "is X mentioned anywhere" — page 1 + "thread continues for N more pages" is an honest answer, don't burn budget reading 200 posts for the gist.
- 5-page cap reached — surface "looked through first 5 pages, didn't find <X>" rather than silently fetching 50.

### Step 6 — Search-back from a partial signal

If you got *any* unique phrase from a partial fetch (a title, a sentence, a distinctive claim), `tff-search_web` for it in quotes. Re-hosts, mirrors, news aggregators, and quote sites will surface where else the same content lives.

Examples:
- `tff-search_web '"<exact title of the article>"'` → re-publications
- `tff-search_web '"<unique sentence from the lede>"'` → quote-aggregators, Hacker News submissions
- `tff-search_web 'site:archive.org <url>'` → check Wayback indexing without hitting Wayback directly

### Step 7 — Author-direct

For an individual's content (tweet, blog post, talk, paper), the canonical home is usually findable in two hops:

1. Search `"<author full name>" blog` or `"<author name>" personal site`.
2. Their GitHub profile, Mastodon bio, "link-in-bio" page, or About-page on their employer site usually lists the real domain.

Once you have the canonical site, fetch directly — bypasses every mirror's quirks.

### Step 8 — Triangulate from secondary sources

When the goal is a **fact** (a statistic, a definition, a date, a quote attributed to someone), not a specific source's wording:

- Call the dedicated `triangulate` skill — it handles common-origin checks and verdict-rendering.
- For quick cases inside the ladder: search for the claim itself, pull 2–3 independent re-reports, cross-check.
- The original may be paywalled, deleted, or behind auth — but if the claim is reported anywhere, you can verify and cite the re-report.

### When to actually stop

Surface "I couldn't get this" only when ALL three are true:

1. You've walked at least Steps 1–3 of the ladder for the specific URL.
2. You can name **why** it failed (auth-walled / geo-blocked / deleted / rate-limited / JS-required-and-unrenderable / paywall / 5xx).
3. You can say what you **did** retrieve (even if useless) and what's still missing.

The output is **never** "the tool didn't return content." The output is, e.g.:

> Tweet body retrieved via `fxtwitter.com` (the original `x.com` URL returned only the login wall). The thread's reply chain is not included in fxtwitter's response — if you need replies, I'd need to switch to the X API (auth required) or an alternate scraper.

That's a useful answer. The caller can decide whether to escalate.

## Default downstream action

When the user asks for research and does **not** specify a format, the default downstream action is **render** (via `render-html`).

| User said | Downstream action |
|---|---|
| "research X" / "look up X" / "find sources on Y" — no format mentioned | **Render** (default). After `synthesize`, save via `note-taker`, then call `render-html`, return the `/v/…` URL. |
| "summarise X" / "give me a summary of Y" / "TL;DR Z" | **Summarise** in the reply. Frame as `deliverable_shape: "summary"`; return synthesize's output inline; skip save. |
| "export to PDF" / "make a PDF" / "printable" / "deliverable" | **Export** via the `export` skill. After `synthesize` and `note-taker`, call `export`, return the `/p/…` URL. |

Do not ask which format to use when none is specified — render is the default. Only summarise or export when the user explicitly indicates so.

## Recent-research queries

When the user asks "what did I research recently?", "have I researched X before?", "show me my last few research notes", read the research-tree state via `research-tree.find_overlap(...)` or by walking `runs[]` reverse-chronologically.

Return the matching runs — `user_request`, `started`, `deliverable_artifact`, and the root node's TL;DR claim. Offer to open any artifact. Do NOT start a new run for these queries.

When the user asks "what's been working in research?", "which survey strategies have been winning?", "show me research scores", "what's my research hit rate?", read the logbook via `research-tree.log_summary({})` (or scoped: `{ persona: "trader" }`, `{ shape: "decision" }`). The `.pi/state/research-log.md` view is also a fine read-only answer for these — newest 100 rows in a table. Do NOT start a new run for these queries either.

## Caller patterns

| Caller | Use case |
|---|---|
| Educator (`corpus-learning`) | Web flow of corpus assembly — fetch landmark papers' abstracts, lecture pages, official docs |
| Educator (`feynman`, `content`) | Verify a definition or example against an authoritative source (often via `triangulate` directly) |
| Engineer | Library docs, GitHub README/CHANGELOG, RFCs, language reference pages, Stack Overflow / GitHub Issues |
| PM | Competitor pricing pages, public roadmaps, vendor changelogs, regulatory filings — usually `decision` shape, expects `steelman` to run |
| Trader | Macro releases, exchange announcements, broker-spec pages — **never** for prescriptive market reads (still a student) |
| Language | Tatoeba / NHK Easy / dictionary pages for vocabulary mining |
| News (skill) | May delegate to `tff-fetch_url` for the actual ingest once `news-ingest` is fleshed out |

## Output style

- After a full pipeline run, return the artifact URL (`/v/…` or `/p/…`) plus a one-line summary.
- After a `summary`-shape run with no save, return the synthesis inline.
- After a single fetch (without going through the full pipeline), hand back `{ url, title, content_excerpt }` for fetches, ranked `{ title, url, snippet }` for searches.
- For escalations from `research-branch`, surface the message verbatim with the discovery evidence quote.

## Don't

- **Don't browse without a goal.** Every pipeline run starts with `research-frame`. Skipping framing is what produces bad research.
- **Don't trust one source for load-bearing claims.** `research-stop-check`'s "no single-source claim" gate exists because this failure is common. Don't bypass it without explicit user override.
- **Don't fetch what's already in the user's vault.** Read locally first.
- **Don't bypass robots.txt or paywalls.** The stealth profile defeats fingerprinting, not legal/ethical access rules.
- **Don't editorialize.** The synthesize phase has style rules that prevent advocacy creep. Don't bake opinions in earlier phases.
- **Don't override `log_summary`'s recommendation without a reason.** The logbook is cross-run evidence; if it says strategy X has won 7/10 times on this shape+persona, that's signal, not noise. Valid overrides: user instruction, shape-mandatory strategies, `confidence: low | none`.
- **Don't loop stop-check past 3 iterations.** Even if score is still climbing, the budget cap is the cap. Force `ship_with_gaps` at iteration 4 and surface the final score to the user.
- **Don't hand bogus aggregates to `complete_run`.** If the run was abandoned (user bailed mid-pipeline), don't fabricate `stop_score` and `survey_competition` to satisfy the logbook contract — leave them out so the row is skipped. Abandoned runs poison cross-run learning.
- **Don't claim the tool didn't return content** without first inspecting `details.markdown` (or `details.html`, or `details.results`). The `content` field is a TUI summary, not the payload.
- **Don't surrender after one fetch.** Walk the fallback ladder. Every hostile host has a cleaner door — spend 30 seconds looking for it.
- **Don't refetch the same URL with the same parameters.** If a fetch returned garbage, the next attempt must be *different* (different render mode, different selector, different host, different format).
- **Don't fabricate content** when the fetch is partial or blocked. Say what you got, name why it's incomplete, and propose the next ladder step.
- **Don't skip stop-check.** If you find yourself wanting to ship without running it, that's the smell — run it.
- **Don't auto-pursue mid-research discoveries.** `research-branch` has explicit per-type policies; follow them rather than your own intuition.

## Limits

- First invocation downloads the Camoufox binary (~500 MB). Expect a one-time delay.
- Dynamic pages may take 5–15s to render; use `wait_for_selector` to avoid grabbing pre-hydration content.
- Some sites still detect (any stealth tool is an arms race). If `tff-fetch_url` returns blocked content, surface that — don't fake a result.
- The pipeline's wall-time scales with `depth_budget` × number of branches. A `deep` budget with 2–3 branches can take 20+ minutes. Set expectations with the user early.
