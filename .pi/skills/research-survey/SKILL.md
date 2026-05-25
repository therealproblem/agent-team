---
description: "Layer 3 shared service — shallow breadth-first terrain mapping. Runs 2–3 named *strategies* (vocabulary-expansion / canonical-voice / counter-position / recency-first / cross-discipline) in parallel, each issuing its own 3–5 queries, then scores each strategy's snippet pool by coverage breadth and returns the winner's terrain map: vocabulary / schools of thought / canonical voices / recency signal / 3–7 recommended deep reads. Called as Step 2 of the `research` orchestrator after `research-frame`. Prevents the \"fetched the first plausible blog and called it research\" failure AND the \"committed to one framing before seeing the field\" failure."
---

# Research-survey

Shallow, breadth-first orientation pass. Goal: a *terrain map* of the field — not answers. Multiple strategies compete on coverage breadth; the winner's map feeds `source-rank` (which picks the deep reads) and refines `research-frame`'s success criteria now that the field is visible. The loser strategies aren't discarded — their coverage diagnostics go to the logbook so future runs can learn which strategies win on which shapes.

## When to call

- Step 2 of every `research` orchestrator run, after `research-frame`.
- Whenever a persona is starting on a topic where the vocabulary, players, or current state are not already loaded in context.
- NOT when the user already named the URLs to fetch — skip survey and go straight to deep read.

## Inputs

```json
{
  "question": "<from research-frame>",
  "deliverable_shape": "<from research-frame>",
  "depth_budget": "<from research-frame>",
  "strategy_set": ["vocabulary-expansion", "canonical-voice", "counter-position"]
}
```

`strategy_set` is picked by the orchestrator (see "Strategy selection by shape" below) and is 2–3 strategy names from the menu. If absent, default to `["vocabulary-expansion", "canonical-voice"]` for `fast` budget; `["vocabulary-expansion", "canonical-voice", "counter-position"]` for `standard`; and add one shape-specific strategy for `deep`.

## Output

```json
{
  "vocabulary": [
    { "term": "<terms-of-art>", "definition": "<one-line>", "first_seen_in": "<url>" }
  ],
  "schools": [
    { "name": "<position / approach>", "stance": "<one-line>", "representative_sources": ["<url>", "..."] }
  ],
  "canonical_voices": [
    { "name": "<person / org>", "why": "<one-line>", "url": "<homepage / profile / paper>" }
  ],
  "timeline_signal": "settled | active | moving-target",
  "recommended_deep_reads": ["<url>", "..."],
  "open_questions_surfaced": ["<question>", "..."],
  "corpus_diagnostics": {
    "unique_domains": <int>,
    "unique_voices": <int>,
    "date_spread": { "last_6mo": <int>, "1-2yr": <int>, "older": <int> },
    "stance_spread": { "with_position": <int>, "against_position": <int>, "neutral": <int> },
    "classics_found": true | false | null,
    "warning": null | "homogeneous_domain" | "homogeneous_voice" | "homogeneous_stance" | "no_recency_signal"
  },
  "strategy_competition": {
    "winner": "<strategy name>",
    "winner_score": <float 0..1>,
    "ran": [
      { "strategy": "<name>", "coverage_score": <float 0..1>, "unique_domains": <int>, "unique_voices": <int>, "stance_balance": <float 0..1>, "kept": true | false }
    ]
  }
}
```

Top-level `vocabulary`, `schools`, `canonical_voices`, `recommended_deep_reads`, `corpus_diagnostics` reflect the **winning** strategy's pool. `strategy_competition` records every strategy that ran (winner + losers) so the orchestrator can append the result to the logbook. Only the winner's snippets feed `source-rank`.

`corpus_diagnostics` is a signal for the orchestrator (and `research-corpus-check`) — survey does NOT loop back on its own warnings. `classics_found: null` means the classics round didn't run (not `deep` budget, or signal wasn't `settled`).

## The strategy menu

Each strategy is a *family of search queries* with a clear search angle. They overlap, but each pulls in coverage the others miss:

| Strategy | What it searches for | Best on |
|---|---|---|
| `vocabulary-expansion` | The topic's terms-of-art at multiple jargon levels: layperson → field-standard → niche/subspecialty. Sample queries: `"<topic>" explained`, `"<topic>" overview`, `"<topic>" advanced`, `"<topic>" <field-jargon>`. | `summary`, `landscape-map`, any topic where the user's wording is approximate. |
| `canonical-voice` | The people/orgs known to write about this topic. Sample queries: `"<topic>" <known-author>`, `"<topic>" site:<known-blog-domain>`, `<topic> "by <name>"`, `<topic> author OR maintainer OR creator`. | `decision`, `landscape-map`, any topic with a small canon. |
| `counter-position` | Critical, opposing, or skeptical framings. Sample queries: `"<topic>" criticism`, `"<topic>" limitations`, `"<topic>" failure modes`, `why "<topic>" wrong OR bad OR oversold`, `<topic> alternatives`. | `decision`, `comparison`, `fact-check`. Mandatory when `success_rubric` includes `disconfirm_pass` or `neutrality`. |
| `recency-first` | Date-bounded queries for breaking changes and current state. Sample queries: `"<topic>" 2026`, `"<topic>" latest`, `"<topic>" recent changes`, `"<topic>" news`, `<topic> "this year"`. | `moving-target` topics, anything where `dated_recent` is in the rubric. |
| `cross-discipline` | Adjacent fields where the topic shows up under a different name. Sample queries: `"<topic>" in <adjacent-field-1>`, `<topic-analog-from-other-field>`, `<topic> applied to <neighbour>`. Requires you to name 1–2 plausible adjacent fields first. | `decision`, `landscape-map`, novel/cross-cutting topics. |

A strategy is a *commitment to an angle*, not a single query — each runs 3 queries (5 on `deep` budget).

## Strategy selection by shape

| Shape | Pick from |
|---|---|
| `summary` | `vocabulary-expansion`, `canonical-voice` |
| `comparison` | `vocabulary-expansion`, `counter-position`, `canonical-voice` |
| `how-to` | `vocabulary-expansion`, `recency-first`, `canonical-voice` |
| `timeline` | `vocabulary-expansion`, `recency-first` |
| `decision` | `canonical-voice`, `counter-position`, `recency-first` (mandatory triple) |
| `fact-check` | `canonical-voice`, `counter-position` |
| `landscape-map` | `vocabulary-expansion`, `canonical-voice`, `counter-position`, `cross-discipline` (pick 3) |

The orchestrator picks; this skill executes whatever it's handed. If `strategy_set` arrives with fewer than 2 strategies or unknown names, fall back to the default for the shape (above).

## Steps

1. **For each strategy in `strategy_set`, generate 3 queries** (5 on `deep` budget) using its template above. Vary along these axes within the strategy:
   - Technical term vs layperson framing
   - Pro-position vs critical framing (within the strategy's angle)
   - Now vs then (`"state of X 2026"` vs `"history of X"`)
   - Inside the field vs from outside (`"X in production"` vs `"X explained"`)
2. **Run all strategies' queries in parallel** via `tff-search_web`. Cap at ~10 results per query. Tag each result with the originating strategy.
3. **Read snippets only.** Do NOT call `tff-fetch_url` in this phase. Snippets are enough to extract vocabulary, identify recurring names, and detect timeline signals. The whole point of survey is *cheap*.
3a. **Score each strategy's snippet pool.** For each strategy compute:
   - `unique_domains`, `unique_voices` over its snippets
   - `stance_balance` = `1 - |with_position - against_position| / total_classified` (1.0 = perfectly balanced; 0 = one-sided)
   - `recency_match` = `1` if the strategy's `date_spread.last_6mo > 0` when the question is `moving-target` or `active`; else `0.5`; else `1` if not applicable
   - `coverage_score` = `0.35 * normalise(unique_domains) + 0.25 * normalise(unique_voices) + 0.25 * stance_balance + 0.15 * recency_match`
     - Normalise by dividing by the max across competing strategies, capped at 1.0.
   The strategy with the highest `coverage_score` wins. Ties broken by `unique_domains`.
3b. **Use only the winner's snippets** for the rest of the steps. Record losers' diagnostics in `strategy_competition.ran` with `kept: false`.
4. **Extract patterns:**
   - **Vocabulary** — terms that appear in 3+ snippets across different queries. These are the field's terms-of-art.
   - **Schools** — distinct stances that recur. Don't force a binary; if there are 4 positions, name 4.
   - **Canonical voices** — names / orgs that show up across queries with different topics (signal of authority).
   - **Timeline signal** — most recent dated snippets vs oldest cited foundational work.
     - `settled` = consensus dates back 5+ years; recent results mostly cite older foundational work
     - `active` = current debate, lots of 2024–2026 results with different positions
     - `moving-target` = breaking changes within last 6 months; recent results contradict older ones
5. **Pick 3–7 recommended deep reads.** Prefer: official docs > primary sources (papers, RFCs, vendor announcements) > maintainer / canonical-voice blog posts > well-cited synthesis pieces. Avoid: vendor "vs the competition" pages, listicles, content-marketed tutorials.
6. **Classics round (deep + settled only).** Run ONLY if `depth_budget == "deep"` AND `timeline_signal == "settled"`. Otherwise skip and set `corpus_diagnostics.classics_found: null`.
   - One extra `tff-search_web` query: `"<topic>" foundational OR seminal OR canonical OR "original paper"`.
   - Scan the snippets already gathered: any URL referenced by 3+ different domain sources is a candidate classic.
   - Prepend 0–3 classics to `recommended_deep_reads` (source-rank's authority axis will rank them naturally).
   - Set `corpus_diagnostics.classics_found: true` if any were added, else `false`. Absence of canon is itself a finding — do NOT loop trying to find non-existent classics.
7. **Surface open questions.** Anything the snippets hint at but don't resolve — feeds `research-branch` later if any becomes a prereq.
8. **Compute corpus diagnostics.** From the snippets read across all queries:
   - `unique_domains` — count distinct eTLD+1 across all returned results.
   - `unique_voices` — count distinct named authors/orgs visible in snippets.
   - `date_spread` — bucket dated snippets into `{ last_6mo, 1-2yr, older }`. Snippets without dates don't count.
   - `stance_spread` — for each snippet, classify roughly as `with_position` / `against_position` / `neutral` relative to the framed question's implied claim.
   - Set `warning` (first trigger wins):
     - `"homogeneous_domain"` — any single domain holds >50% of results.
     - `"homogeneous_voice"` — `unique_voices < 5` AND `depth_budget != "fast"`.
     - `"homogeneous_stance"` — `stance_spread.against_position == 0` AND `deliverable_shape ∈ {comparison, decision, fact-check}`.
     - `"no_recency_signal"` — `date_spread.last_6mo == 0` AND `timeline_signal != "settled"`.
     - Else `null`.
9. **Return the JSON.** Caller hands it to `source-rank`. The orchestrator (or `research-corpus-check`) decides whether `warning` warrants a re-survey.

## Steering by deliverable shape

| Shape | Survey emphasis |
|---|---|
| `summary` | Vocabulary + canonical voices; light on schools |
| `comparison` | Schools (== the alternatives); equal weight per side |
| `how-to` | Recommended deep reads heavy on official docs + recent maintainer posts |
| `timeline` | Timeline signal + dated foundational sources |
| `decision` | Schools (the alternatives) + open_questions (the risks) |
| `fact-check` | Skip schools; emphasise primary sources for the claim's origin |
| `landscape-map` | Maximize all axes — this IS the deliverable |

## Steering by depth budget

| Budget | Strategies in `strategy_set` | Queries per strategy | Deep reads picked from winner |
|---|---|---|---|
| `fast` | 2 | 3 | 1–2 |
| `standard` | 3 | 3 | 3–5 |
| `deep` | 3 | 5 | 5–7 |

## Reading search results

`tff-search_web` returns results in `details.results` — an array of `{ title, url, snippet, source }`. Read from `details.results`, NOT from `content[0].text` (which is just a TUI summary). Same gotcha as the parent `research` skill's "details vs content" rule.

## Don't

- **Don't fetch.** Snippets-only is the discipline. If you find yourself wanting to fetch in survey, you're already in the deep-read phase — return and let the orchestrator advance.
- **Don't include SEO spam in vocabulary extraction.** Listicles / "best X of 2026" content farms pollute the vocabulary signal. Skip them before extracting terms.
- **Don't declare consensus from one search.** Three independent queries surfacing the same names is signal; one query is noise.
- **Don't pre-decide the answer.** Survey returns terrain, not a conclusion. The deep-read + synthesize phases form the answer.
- **Don't skip survey because "I already know this field."** The recency check alone is worth the call — your knowledge has a training-data cutoff; the field doesn't.
- **Don't gate on `corpus_diagnostics.warning`.** Survey always returns. The warning is a signal to the orchestrator and to `research-corpus-check` — the decision to re-survey or proceed is theirs.
- **Don't loop the classics round.** If `classics_found: false` after running it, accept that and move on. "No canonical work surfaced" is a useful finding for the user — manufacturing one is worse than reporting none.
- **Don't merge strategies' snippets into one pool before scoring.** The whole point of competing strategies is that each pool's *coverage shape* is the signal. Score per-strategy, pick a winner, then use only the winner's snippets downstream. (After winner is picked, you may pull 1–2 high-signal sources from a loser pool into `recommended_deep_reads` if they fill an obvious gap — but tag those in `strategy_competition` so the logbook captures it.)
- **Don't run more than 3 strategies even on `deep`.** Returns diminish fast and parallel search load isn't free. If a strategy seems mandatory and isn't in the shape's default, ask the orchestrator to substitute, don't add a 4th.
- **Don't skip strategy competition on `fast` budget.** Two strategies × three queries is still cheaper than picking the wrong angle.
