---
description: Layer 3 shared service — sharpens a research request BEFORE any fetch. Takes a raw "research X" ask and produces a one-line question + deliverable shape + depth budget + 1–3 success criteria. Cheap, logic-only, no tools. Called as Step 1 of the `research` orchestrator. Use it inline whenever the user's request is vague enough that two researchers would produce different deliverables.
---

# Research-frame

Sharpens a research request before any source is touched. Most bad research starts because the question was never specified — `research-frame` fixes that in one pass.

## When to call

- First step of every `research` orchestrator invocation.
- Any time a persona is about to start a multi-source research task and the user's request is short / ambiguous / mode-unclear.
- NOT for trivially-specific asks ("fetch the changelog at github.com/foo/bar/releases/v1.2") — those already have a frame.

## What it produces

```json
{
  "question": "<one sentence, restated in your own words>",
  "deliverable_shape": "summary | comparison | how-to | timeline | decision | fact-check | landscape-map",
  "depth_budget": "fast | standard | deep",
  "success_criteria": ["<bullet>", "..."],
  "success_rubric": [
    { "criterion": "<short name>", "weight": 0.0, "definition": "<what 'fully satisfied' looks like>" }
  ]
}
```

`success_criteria` is the human-readable list. `success_rubric` is the same list expressed as weighted gradeable items for `research-stop-check` to score against. Weights MUST sum to 1.0 (±0.01 rounding). Treat the rubric as the contract — `success_criteria` exists for readability and for `research-corpus-check`, which doesn't need weights.

### Deliverable shapes

| Shape | Triggered by | Output bias |
|---|---|---|
| `summary` | "summarise X", "TL;DR Y", "give me the gist" | Synthesis-heavy, short, no comparison tables |
| `comparison` | "X vs Y", "alternatives to X", "which Z should I use" | Side-by-side, axes named, neutral framing |
| `how-to` | "how do I X", "set up Y", "configure Z" | Step-by-step, prereqs surfaced, gotchas inline |
| `timeline` | "history of X", "evolution of Y", "what happened with Z" | Chronological, dated, watershed moments called out |
| `decision` | "should we adopt X", "is Y worth it", "go / no-go on Z" | Recommendation up top, conditions for reversal, what could change the answer |
| `fact-check` | "is it true that X", "verify that Y", "did Z really happen" | Verdict + triangulation; common-origin check mandatory |
| `landscape-map` | "what's the state of X", "who's doing Y", "ecosystem around Z" | Vocabulary, players, schools of thought, recency signal |

If genuinely unclear, infer the most likely shape and proceed — don't ask the user. The exception: when two shapes are equally plausible AND the difference materially changes effort (e.g. `summary` vs `decision`), ask **one** crisp question and proceed on the answer.

### Depth budgets

| Budget | Wall time target | Max sources read deeply | Use when |
|---|---|---|---|
| `fast` | < 5 min | 1–2 | Quick check, single fact, sanity test, "just look this up" |
| `standard` | 5–20 min | 3–5 | Default for most "research X" asks |
| `deep` | 20+ min | 5–10 + steelman pass | High-stakes decisions, contested topics, deliverable-grade output |

Infer from the request's stakes signal ("just curious" → fast, "we're deciding next sprint" → deep). When unstated, default to `standard`. Persona context matters too — PM `decision` shape defaults at least to `standard`; trader research defaults to `standard` minimum because misreads cost real money.

### Success criteria

1–3 bullets describing what the finished deliverable must contain for the user to consider it done. These become the gates `research-stop-check` runs at the end. Examples:

- For a `decision`: "names at least 2 failure modes" · "explicitly handles the cost question" · "includes one migration story from prod"
- For a `landscape-map`: "lists 3+ canonical voices" · "vocabulary section with terms-of-art" · "dated within the last 12 months for current state"
- For a `fact-check`: "verdict in first sentence" · "≥2 independent sources" · "common-origin check performed"

### Success rubric (default per shape)

Build the rubric from this shape default, then tune weights/definitions if the request emphasises an axis. Adding a request-specific criterion is fine; keep total ≤ 6 items, weights sum to 1.0.

| Shape | Default rubric (criterion → weight) |
|---|---|
| `summary` | `shape_fit` 0.20 · `coverage` 0.30 · `source_diversity` 0.20 · `dated_recent` 0.10 · `feynman_clarity` 0.20 |
| `comparison` | `shape_fit` 0.15 · `coverage_per_axis` 0.25 · `neutrality` 0.20 · `source_diversity` 0.20 · `feynman_clarity` 0.10 · `dated_recent` 0.10 |
| `how-to` | `shape_fit` 0.20 · `executable_steps` 0.25 · `gotchas_present` 0.15 · `prereqs_named` 0.10 · `worked_example` 0.20 · `dated_recent` 0.10 |
| `timeline` | `shape_fit` 0.25 · `chronology_complete` 0.30 · `dated_events` 0.25 · `source_diversity` 0.20 |
| `decision` | `shape_fit` 0.10 · `failure_modes` 0.20 · `disconfirm_pass` 0.20 · `triangulation` 0.20 · `mechanism_clarity` 0.15 · `source_diversity` 0.15 |
| `fact-check` | `verdict_clear` 0.20 · `triangulation` 0.25 · `common_origin_check` 0.20 · `mechanism_clarity` 0.15 · `source_diversity` 0.10 · `dated_evidence` 0.10 |
| `landscape-map` | `vocabulary` 0.15 · `schools_named` 0.20 · `canonical_voices` 0.15 · `coverage` 0.20 · `feynman_clarity` 0.15 · `dated_recent` 0.15 |

Each criterion's `definition` is one sentence the scorer can grade against. Defaults below; tune in-line for the specific question.

| Criterion | "Fully satisfied (1.0)" definition |
|---|---|
| `shape_fit` | The deliverable's structure matches the shape contract (sections, TL;DR placement, table presence). |
| `coverage` | Every item in `success_criteria` is addressed by name or explicitly listed as out of scope. |
| `coverage_per_axis` | Every named alternative has the same axes covered (no gaps where one side is silent). |
| `source_diversity` | ≥3 distinct domains AND ≥2 distinct authors/orgs supporting the load-bearing claims. |
| `dated_recent` | Synthesis has an ISO date footer; ≥1 cited source from last 12 months for non-`settled` topics. |
| `neutrality` | No advocacy verbs ("clearly", "obviously"); each side gets equal section length within ±30%. |
| `executable_steps` | Steps are numbered, each step is a single concrete action, no missing intermediates. |
| `gotchas_present` | At least one named gotcha / common mistake with the symptom and the fix. |
| `prereqs_named` | Prerequisites (versions, accounts, env) listed before step 1. |
| `chronology_complete` | Events ordered by date; no undated entries; gaps >2 years called out. |
| `dated_events` | ≥80% of timeline entries have an ISO year or month-year date. |
| `failure_modes` | ≥2 named failure modes with the condition that triggers each. |
| `disconfirm_pass` | `steelman` ran AND its result is reflected in "What's contested" or alters the recommendation. |
| `triangulation` | Every load-bearing factual claim has ≥2 independent sources (different domains AND different authors). |
| `verdict_clear` | First sentence states True / False / Mixed / Unverifiable + the confidence. |
| `common_origin_check` | The "are these all citing the same primary?" check ran and is reported. |
| `dated_evidence` | Evidence sources are dated; the verdict notes if any source is older than 24 months. |
| `vocabulary` | ≥5 terms-of-art listed with one-line definitions. |
| `schools_named` | ≥2 distinct schools of thought / approaches named with representative sources. |
| `canonical_voices` | ≥3 named people/orgs with a one-line "why authoritative" + a link. |
| `feynman_clarity` | The synthesis's load-bearing claim can be re-explained in 3–5 plain sentences using none of the corpus's jargon and no "essentially…" hand-waves. Stop-check performs the re-write and grades whether jargon leaked back in. Half credit if the re-write needs one borrowed term to land. |
| `mechanism_clarity` | Every load-bearing claim has its mechanism named — the *why* it's true — not just the claim asserted. Claims without a discoverable mechanism are explicitly tagged "mechanism unclear" rather than silently omitted. Filled by `research-interrogate`'s pass. |
| `worked_example` | Exactly one concrete instance is walked through end-to-end. Each step has annotated reasoning ("X because Y, otherwise Z"), not just the action. A how-to without a worked example is a how-to-fragment. |

Half credit (0.5) is allowed: criterion partially met (e.g. 2 of 3 expected items, or only inline mention without a section). Zero (0.0) is "absent or wrong."

## Steps

1. **Read the raw request.** The user's exact words. If it arrived via a persona, also note the persona — it biases the deliverable shape (PM → decision-leaning, educator → how-to-leaning, language → fact-check / landscape-leaning).
2. **Restate the question in one sentence.** If you can't, the request is too vague — ask once, then proceed.
3. **Pick the deliverable shape** from the table. Default to `summary` only if nothing else fits.
4. **Set the depth budget** from stakes signals + persona default.
5. **Write 1–3 success criteria** that name what "done" looks like for this specific request.
6. **Build the `success_rubric`** from the shape default. Tune weights (and add at most one request-specific criterion) if the user's wording emphasises an axis. Verify weights sum to 1.0 before returning.
7. **Return the JSON** to the caller. Do not start fetching.

## Output style

A single JSON block. No prose explanation — the caller (usually `research` orchestrator) reads the fields directly.

## Don't

- **Don't ask more than one clarifying question.** If you'd need two questions, infer the more important answer and ask only the other.
- **Don't fetch anything.** This skill is logic-only; tool calls happen downstream.
- **Don't expand scope.** If the user asked about X, frame X — not "X and the broader ecosystem." Scope expansion happens via `research-branch` when discoveries justify it.
- **Don't overwrite the user's wording in the question field.** Light normalisation only (strip "could you research…", "I want to know about…"). The question must still recognisably be theirs.
- **Don't infer `deep` from your own enthusiasm.** Depth budget tracks the user's stakes, not yours. When in doubt, `standard`.
