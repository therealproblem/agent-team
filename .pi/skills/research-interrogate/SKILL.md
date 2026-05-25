---
description: "Layer 3 sub-skill — elaborative-interrogation pass over load-bearing claims. For each claim, asks 'why is this true?' and tries to find the mechanism in the source the claim came from, or via one capped follow-up search. Claims without a discoverable mechanism get explicitly tagged 'mechanism unclear' for the synthesis. Runs between `triangulate` (which checks IF a claim is true) and `synthesize` — different failure mode, different check. Cheap pass; ~3–7 extra fetches per run."
---

# Research-interrogate

The "why is this true?" pass. `triangulate` checks IF a claim is true; `interrogate` checks WHY. Two different failure modes — a claim can be well-cited and still mechanism-opaque, which makes the synthesis sound authoritative while skipping the part the reader actually needs to understand. The borrowed idea is elaborative interrogation from learning research: causal models stick because they're causal, not because they're memorised.

## When to call

- After `triangulate`, before `synthesize`.
- Only when the deliverable shape's rubric includes `mechanism_clarity` — currently `decision`, `fact-check`, and any shape where the orchestrator has added it (e.g. a request like "explain how X works" might add it to `summary`).
- NOT for non-load-bearing claims. Interrogation is targeted; trivia mechanisms eat budget for nothing.
- NOT when the run is `depth_budget: fast` and the corpus has no obvious mechanism gaps — interrogate is a quality-lift, not a baseline check.

## Inputs

```json
{
  "frame": { "question": "...", "deliverable_shape": "..." },
  "tree": <research-tree>,
  "load_bearing_claims": [
    { "claim_id": "...", "statement": "<one sentence>", "sources": ["url", "..."] }
  ]
}
```

The orchestrator marks load-bearing claims based on whether they feed the synthesis's verdict / recommendation / TL;DR. Typically 3–7 per run; cap at 10 to keep the pass cheap.

## Output

```json
{
  "interrogations": [
    {
      "claim_id": "...",
      "mechanism_status": "found_in_existing | found_via_followup | unclear",
      "mechanism_summary": "<one sentence why>",
      "source_for_mechanism": "<url | null>",
      "followup_queries_run": <int>
    }
  ],
  "unclear_count": <int>,
  "synthesis_note_required": true | false
}
```

`synthesis_note_required: true` when one or more load-bearing claims came back `unclear` — the synthesis must surface this in a "Mechanism unclear" line within "What's contested" (or its own section, at synthesize's discretion) rather than silently omitting it.

## Steps

1. **Walk `load_bearing_claims` in priority order** (most load-bearing first, so the budget runs out on the least important).
2. **Look for the mechanism in the same source first.** Re-read the source's body (`details.markdown` from the existing fetch in the tree) with the question "does this source explain *why*?" Often the why is right there but wasn't captured during deep-read — extraction was about *what*, this pass is about *why*. If found, set `mechanism_status: found_in_existing`, record `mechanism_summary` (one sentence) + the source URL.
3. **If absent, run ONE targeted follow-up.** Issue `tff-search_web` with a mechanism-shaped query: append `"why"`, `"because"`, `"mechanism"`, `"how does"`, or `"explained"` to the claim's key phrasing. Fetch the top hit only if its snippet plausibly contains the explanation; otherwise stop. Cap at one follow-up per claim — interrogation is a *check*, not a re-fetch loop. If found, set `mechanism_status: found_via_followup`.
4. **If still not found, mark `unclear`.** Set `mechanism_summary: null`, `source_for_mechanism: null`. The synthesis will tag the claim with "Mechanism unclear" — far better than fabricating one.
5. **Return JSON.** The orchestrator hands `interrogations` + `synthesis_note_required` to `synthesize`, which weaves mechanisms into the body and surfaces unclear ones in "What's contested" (or a dedicated section for shapes where mechanism is central, like `decision`).

## Cost

Cheap by design. Each claim costs at most one re-read (already-fetched bytes) + one search + one optional fetch. Worst case for 7 load-bearing claims: 7 re-reads, 7 searches, ~3–5 follow-up fetches (most claims either resolve in step 2 or stay unclear after step 3). Total: a few seconds and a handful of tool calls.

## Caller pattern

The orchestrator calls this after `triangulate` returns. Recommended flow:

```
triangulate → research-interrogate (parallel-OK if claims are independent) → synthesize
```

If `synthesis_note_required: true`, the orchestrator marks the synthesis pass with `must_include_mechanism_unclear_section: true` (or equivalent) so synthesize doesn't silently drop the gaps.

## Don't

- **Don't interrogate every claim.** Only load-bearing ones. Trivia mechanisms are not the point.
- **Don't loop on a missing mechanism.** One follow-up max per claim. If the corpus doesn't have it, "mechanism unclear" is the honest answer.
- **Don't fabricate mechanisms.** If you can't find a source, the answer is `unclear`, full stop. A hallucinated mechanism is worse than an honest gap.
- **Don't second-guess `triangulate`.** Interrogate trusts triangulate's verdict on truth; it only addresses the *why*. A claim marked `verification_status: contested` by triangulate is still interrogated — the mechanism (if found) helps synthesize say WHY it's contested.
- **Don't run on `depth_budget: fast` by default.** Add it back only when the user's request explicitly asks for mechanism ("explain how X works", "why does Y happen") — in which case mechanism is the whole point and the orchestrator should bump that part of the budget.
- **Don't return prose.** JSON only. The orchestrator handles user-facing messaging.
