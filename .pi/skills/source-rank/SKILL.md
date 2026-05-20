---
description: Layer 3 shared service — scores candidate URLs on five axes (relevance × authority × independence × recency_fit × access_risk) given a framed question and survey output. Returns a ranked subset to actually deep-read. Forces deliberate selection over "first three hits." Called as Step 3 of the `research` orchestrator between `research-survey` and the deep-read fetches.
---

# Source-rank

Picks the deep-reads. Given the survey's candidate URLs + the framed question, scores each candidate and returns a ranked subset. The deliberate alternative to "fetch the first three from `recommended_deep_reads`."

## When to call

- Step 3 of `research` orchestrator, after `research-survey` returned candidates.
- Any time you have more candidate URLs than your depth budget can fetch — forces you to pick on purpose.

## Inputs

```json
{
  "candidates": [{ "url": "...", "title": "...", "snippet": "..." }],
  "question": "<from research-frame>",
  "deliverable_shape": "<from research-frame>",
  "depth_budget": "<from research-frame>",
  "survey_schools": [<from research-survey, optional — used for diversification>]
}
```

## Output

```json
{
  "ranked": [
    {
      "url": "...",
      "scores": { "relevance": 1-5, "authority": 1-5, "independence": 1-5, "recency_fit": 1-5, "access_risk": 1-5 },
      "total": <weighted sum>,
      "rationale": "<one-line>"
    }
  ],
  "picked": ["<url>", "..."],
  "dropped": [{ "url": "...", "reason": "<one-line>" }]
}
```

## The five axes (1–5 each)

| Axis | What 5 looks like | What 1 looks like |
|---|---|---|
| **Relevance** | Title + snippet directly answer the framed question | Tangentially related |
| **Authority** | Official docs, primary source, named expert with track record | Anonymous blog, content-marketed listicle |
| **Independence** | Author has no commercial stake in the answer | Vendor self-comparison page; sponsored content |
| **Recency_fit** | Matches the deliverable's temporal need (recent for state-of-the-art, evergreen for fundamentals) | 5 years stale for an active topic; brand-new for a settled-fundamentals question |
| **Access_risk** | Public, no paywall, no auth required, host plays nicely with stealth fetch | Hard paywall, login-required, known anti-bot host with no good mirror |

## Weighting by deliverable shape

Different shapes weight axes differently. Apply the weights below before computing `total`:

| Shape | Relevance | Authority | Independence | Recency_fit | Access_risk |
|---|---|---|---|---|---|
| `summary` | 1.0 | 1.0 | 0.5 | 0.5 | 1.0 |
| `comparison` | 1.0 | 0.8 | **1.5** | 0.7 | 1.0 |
| `how-to` | 1.0 | **1.3** | 0.6 | 1.0 | 1.0 |
| `timeline` | 1.0 | 1.0 | 0.8 | 0.5 | 1.0 |
| `decision` | 1.0 | 1.0 | **1.3** | 1.0 | 1.0 |
| `fact-check` | 1.0 | **1.5** | **1.5** | 0.8 | 1.0 |
| `landscape-map` | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |

Independence is doubly-weighted for `comparison` and `fact-check` because those shapes are most vulnerable to motivated reasoning. Authority is heavily weighted for `how-to` and `fact-check` because misinformation costs the most there.

## Steps

1. **Score every candidate** on all five axes. Be honest about authority — a famous person blogging outside their field is a 2, not a 5.
2. **Apply shape weights**, compute `total` per candidate.
3. **Sort descending by `total`.**
4. **Pick top-N** where N = `depth_budget`'s "max sources read deeply" cap (fast: 2, standard: 5, deep: 10).
5. **Diversify the pick.** If the top-N are all from the same school of thought (per `survey_schools`), drop the lowest and replace with the highest-ranked candidate from a different school. Single-school deep reads produce single-school answers.
6. **Drop anything with `access_risk: 1`** unless a mirror exists (check the `research` orchestrator's fetch-reliability ladder before dropping). Note the drop in `dropped[]` with reason.
7. **Return JSON.** Caller fetches the `picked` list.

## Quick disqualifiers (auto-drop, score 0)

- Vendor's "X vs [competitor]" page when the question is "X vs [competitor]"
- Listicles / "best X of [year]" content farms
- Posts older than 18 months when `deliverable_shape` is `landscape-map` or the topic's `timeline_signal` is `active` or `moving-target`
- AI-generated SEO content (giveaways: 2024+ publish date, no named author, hits every keyword, no specifics, hedges every claim)
- Sources that don't match the language the question was asked in (unless they're the canonical primary)

## Don't

- **Don't pick all from the same source type.** Three official docs is worse than two official docs + one independent practitioner write-up — you'd miss the gap between "how it should work" and "how it actually behaves."
- **Don't pick for entertainment value.** A funny rant ranks low on every axis except sometimes Independence.
- **Don't keep a source you can't access.** Note it in `dropped[]` and move on. Either the orchestrator's ladder will recover it, or it's genuinely lost.
- **Don't pad the pick.** If only 2 candidates clear a respectable score, return 2. A `fast` budget with 2 strong picks beats a `standard` budget padded with weak sources.
- **Don't score on vibes.** Each axis needs a one-line rationale tied to evidence from the snippet or URL pattern. "Feels authoritative" isn't a score.
