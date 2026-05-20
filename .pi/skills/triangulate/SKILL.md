---
description: "Layer 3 shared service — fact verification across independent sources. Given a specific claim, searches for it across multiple sources, surfaces supporting / contradicting evidence, AND performs the common-origin check (5 sources that all cite the same paper are 1 data point, not 5). Returns a verdict: confirmed / contested / unverified / refuted. Called when the deliverable_shape is `fact-check` or any time a synthesized claim needs verification before being asserted."
---

# Triangulate

Fact verification. For when the goal is *is this true* / *what's the number*, not *what does Source X say*.

## When to call

- `deliverable_shape: "fact-check"` — this is the primary skill of the run.
- Mid-synthesis, when a specific factual claim is going to be asserted in the output. Verify before asserting.
- Whenever a `steelman` pass surfaced a contradiction and you need to decide which side is right.
- NOT for source-faithful goals ("what does the Kafka docs say about X?") — deep-read Kafka docs directly, no triangulation needed.

## Inputs

```json
{
  "claim": "<one sentence, falsifiable>",
  "context": "<one paragraph — why we care, what hangs on it>",
  "depth_budget": "fast | standard | deep"
}
```

## Output

```json
{
  "claim": "...",
  "verdict": "confirmed | contested | unverified | refuted",
  "supporting_sources": [
    { "url": "...", "exact_quote": "...", "date": "ISO", "author": "...", "type": "primary | secondary | tertiary" }
  ],
  "contradicting_sources": [
    { "url": "...", "exact_quote": "...", "date": "ISO", "author": "...", "type": "primary | secondary | tertiary" }
  ],
  "common_origin_check": {
    "result": "independent | partial_overlap | all_trace_to_one",
    "root_source_if_overlap": "<url or null>"
  },
  "confidence": "high | medium | low",
  "caveats": ["<one-line>", "..."]
}
```

## Source types

- **primary** — the original. The paper that ran the study; the law that was passed; the person who said the thing on the record; the API docs from the maintainers; the SEC filing.
- **secondary** — first-order re-report by someone who read the primary (a journalist citing the paper; an analyst summarizing the law; a blog post linking the docs).
- **tertiary** — re-report of a re-report (wiki articles, listicles, content that doesn't cite the primary directly).

A claim "confirmed" by five tertiaries that all cite the same primary is **one** confirmation. A claim confirmed by three independent primaries is three.

## Steps

1. **Restate the claim as falsifiable.** "X is widely used" is not falsifiable. "X has ≥100 GitHub contributors as of 2026-05" is. If the claim can't be made falsifiable, push back to caller before searching.
2. **Search for the claim.** Quote distinctive phrases. Run 3–5 search variants:
   - The claim verbatim
   - The claim's negation ("X is NOT widely used")
   - The most contested element ("X contributor count")
   - Counter-positions ("alternatives to X")
3. **Collect 5+ candidate sources** spanning support and contradiction. Use `tff-fetch_url` if snippets are insufficient. Read from `details.markdown` (or `details.html`) — the same `details`-not-`content` rule as the parent `research` skill.
4. **Classify each source** as primary / secondary / tertiary. Note the date and the author/org.
5. **Common-origin check.** For supporting sources: do they cite a common upstream source? Walk back the citation chain in each. If 4 of 5 trace to the same primary, you have 1 + 1 (the primary + one independent confirmation), not 5.
6. **Render verdict:**
   - `confirmed` — ≥2 independent primaries (or primary + 2 independent secondaries) all support; no credible contradiction.
   - `contested` — credible primaries on both sides, or primary supports but multiple independent secondaries dispute the interpretation.
   - `unverified` — only tertiary sources, OR primaries exist but you couldn't access them, OR signal is too weak to call.
   - `refuted` — credible primary directly contradicts the claim, no plausible support.
7. **Set confidence** based on source quality and independence depth. `high` requires `confirmed` + `independent` common-origin result. `low` is appropriate for any verdict that hangs on a single primary.
8. **Surface caveats.** Scope limits ("true for v2+, false for v1"), version-dependence, jurisdiction-dependence, definitional disputes. A `confirmed` claim with unstated caveats is worse than a `contested` claim with caveats spelled out.
9. **Return JSON.**

## Budgets

| Budget | Min sources checked | Common-origin walk | Verdict floor |
|---|---|---|---|
| `fast` | 3 | 1 hop | `confirmed` requires ≥1 primary |
| `standard` | 5 | 2 hops | `confirmed` requires ≥2 independent primaries |
| `deep` | 8+ | until root | `confirmed` requires ≥2 independent primaries + 1 disconfirming search showing no credible refutation |

## Don't

- **Don't count count.** Five tertiaries citing one paper is one data point. Always walk the chain.
- **Don't accept "I read it somewhere" as primary.** If the search returns the claim but not its origin, the verdict is at best `unverified`.
- **Don't omit contradicting sources just because the claim looked confirmed.** Surface them anyway — that's what makes the verdict credible.
- **Don't render `confirmed` for unfalsifiable claims.** Push back to caller: "this claim isn't falsifiable as stated; please rephrase."
- **Don't fabricate quotes.** Every `exact_quote` must come from `details.markdown` of a real fetch. If you can only paraphrase, mark the source as `unverified` for that claim.
- **Don't pad with weak caveats to sound careful.** Real caveats are version / scope / definition. "Of course, more research needed" is filler, not a caveat.
