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
  "success_criteria": ["<bullet>", "..."]
}
```

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

## Steps

1. **Read the raw request.** The user's exact words. If it arrived via a persona, also note the persona — it biases the deliverable shape (PM → decision-leaning, educator → how-to-leaning, language → fact-check / landscape-leaning).
2. **Restate the question in one sentence.** If you can't, the request is too vague — ask once, then proceed.
3. **Pick the deliverable shape** from the table. Default to `summary` only if nothing else fits.
4. **Set the depth budget** from stakes signals + persona default.
5. **Write 1–3 success criteria** that name what "done" looks like for this specific request.
6. **Return the JSON** to the caller. Do not start fetching.

## Output style

A single JSON block. No prose explanation — the caller (usually `research` orchestrator) reads the fields directly.

## Don't

- **Don't ask more than one clarifying question.** If you'd need two questions, infer the more important answer and ask only the other.
- **Don't fetch anything.** This skill is logic-only; tool calls happen downstream.
- **Don't expand scope.** If the user asked about X, frame X — not "X and the broader ecosystem." Scope expansion happens via `research-branch` when discoveries justify it.
- **Don't overwrite the user's wording in the question field.** Light normalisation only (strip "could you research…", "I want to know about…"). The question must still recognisably be theirs.
- **Don't infer `deep` from your own enthusiasm.** Depth budget tracks the user's stakes, not yours. When in doubt, `standard`.
