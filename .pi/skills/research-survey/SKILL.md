---
description: "Layer 3 shared service — shallow breadth-first terrain mapping. Runs 3–5 deliberately-varied parallel searches on a framed question, reads snippets only (no deep fetches), and returns a terrain map: vocabulary / schools of thought / canonical voices / recency signal / 3–7 recommended deep reads. Called as Step 2 of the `research` orchestrator after `research-frame`. Prevents the \"fetched the first plausible blog and called it research\" failure."
---

# Research-survey

Shallow, breadth-first orientation pass. Goal: a *terrain map* of the field — not answers. Output feeds `source-rank` (which picks the deep reads) and refines `research-frame`'s success criteria now that the field is visible.

## When to call

- Step 2 of every `research` orchestrator run, after `research-frame`.
- Whenever a persona is starting on a topic where the vocabulary, players, or current state are not already loaded in context.
- NOT when the user already named the URLs to fetch — skip survey and go straight to deep read.

## Inputs

```json
{
  "question": "<from research-frame>",
  "deliverable_shape": "<from research-frame>",
  "depth_budget": "<from research-frame>"
}
```

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
  "open_questions_surfaced": ["<question>", "..."]
}
```

## Steps

1. **Generate 3–5 search queries**, deliberately varied along these axes:
   - Technical term vs layperson framing
   - Pro-position vs critical framing (`"X"` vs `"X criticism"` / `"X limitations"`)
   - Now vs then (`"state of X 2026"` vs `"history of X"`)
   - Inside the field vs from outside (`"X in production"` vs `"X explained"`)
2. **Run searches in parallel** via `tff-search_web`. Cap at ~10 results per query.
3. **Read snippets only.** Do NOT call `tff-fetch_url` in this phase. Snippets are enough to extract vocabulary, identify recurring names, and detect timeline signals. The whole point of survey is *cheap*.
4. **Extract patterns:**
   - **Vocabulary** — terms that appear in 3+ snippets across different queries. These are the field's terms-of-art.
   - **Schools** — distinct stances that recur. Don't force a binary; if there are 4 positions, name 4.
   - **Canonical voices** — names / orgs that show up across queries with different topics (signal of authority).
   - **Timeline signal** — most recent dated snippets vs oldest cited foundational work.
     - `settled` = consensus dates back 5+ years; recent results mostly cite older foundational work
     - `active` = current debate, lots of 2024–2026 results with different positions
     - `moving-target` = breaking changes within last 6 months; recent results contradict older ones
5. **Pick 3–7 recommended deep reads.** Prefer: official docs > primary sources (papers, RFCs, vendor announcements) > maintainer / canonical-voice blog posts > well-cited synthesis pieces. Avoid: vendor "vs the competition" pages, listicles, content-marketed tutorials.
6. **Surface open questions.** Anything the snippets hint at but don't resolve — feeds `research-branch` later if any becomes a prereq.
7. **Return the JSON.** Caller hands it to `source-rank`.

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

| Budget | Searches | Deep reads picked |
|---|---|---|
| `fast` | 3 | 1–2 |
| `standard` | 4 | 3–5 |
| `deep` | 5+ | 5–7 |

## Reading search results

`tff-search_web` returns results in `details.results` — an array of `{ title, url, snippet, source }`. Read from `details.results`, NOT from `content[0].text` (which is just a TUI summary). Same gotcha as the parent `research` skill's "details vs content" rule.

## Don't

- **Don't fetch.** Snippets-only is the discipline. If you find yourself wanting to fetch in survey, you're already in the deep-read phase — return and let the orchestrator advance.
- **Don't include SEO spam in vocabulary extraction.** Listicles / "best X of 2026" content farms pollute the vocabulary signal. Skip them before extracting terms.
- **Don't declare consensus from one search.** Three independent queries surfacing the same names is signal; one query is noise.
- **Don't pre-decide the answer.** Survey returns terrain, not a conclusion. The deep-read + synthesize phases form the answer.
- **Don't skip survey because "I already know this field."** The recency check alone is worth the call — your knowledge has a training-data cutoff; the field doesn't.
