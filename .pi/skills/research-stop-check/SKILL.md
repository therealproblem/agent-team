---
description: "Layer 3 shared service — final gate before handoff to note-taker / render-html. Grades the synthesis against the weighted `success_rubric` set by research-frame and runs 6 structural sanity checks: (1) deliverable shape satisfied, (2) contested-section present, (3) disconfirming pass run, (4) no single-source load-bearing claims, (5) dated, (6) saturation reached AND no dangling branches. Returns a 0..1 score plus pass/loop/ship-with-gaps decision based on score + trajectory across iterations. Called as Step 6 of `research` orchestrator."
---

# Research-stop-check

The "are we actually done?" gate. Grades the synthesis on the rubric, runs structural sanity checks, surfaces gaps, loops back when score is climbing. Without it, the orchestrator declares done whenever the persona feels tired — same failure mode as humans without checklists. Scoring exists so the loop is *measurable*: a run that scrapes by today is no longer indistinguishable from one that nails it.

## When to call

- Step 6 of `research` orchestrator, after `synthesize` but before `note-taker` / `render-html`.
- After any synthesis pass that's about to be persisted as a deliverable.
- NOT for one-shot conversational answers — only for research deliverables.

## Inputs

```json
{
  "frame": { "question": "...", "deliverable_shape": "...", "success_criteria": [...], "success_rubric": [...] },
  "synthesis_markdown": "<output of synthesize>",
  "tree": <research-tree>,
  "steelman_run": true | false,
  "triangulate_runs": <count>,
  "previous_score": <float 0..1 | null>,
  "iteration": <int, 1-indexed; how many times this run has called stop-check>
}
```

## Output

```json
{
  "passed": true | false,
  "score": <float 0..1>,
  "score_delta": <float | null>,
  "per_criterion": [
    { "name": "...", "weight": 0.0, "grade": 0 | 0.5 | 1, "weighted": 0.0, "evidence": "<one-line>" }
  ],
  "checks": [
    { "name": "...", "result": "pass | fail | n/a", "evidence": "<one-line>", "remediation": "<which phase to re-enter>" }
  ],
  "loop_back_to": null | "frame" | "survey" | "source-rank" | "deep-read" | "triangulate" | "steelman" | "synthesize",
  "verdict": "ship | ship_with_gaps | loop"
}
```

`score` is the weighted sum of `per_criterion[i].grade * per_criterion[i].weight`. `score_delta` is `score - previous_score` (null on first iteration).

## Scoring the rubric (first; structural checks follow)

For each item in `frame.success_rubric`, grade the synthesis:

- **1.0** — criterion fully satisfied per its `definition`.
- **0.5** — partially satisfied (e.g. 2 of 3 expected items, an inline mention where a section was expected, half the named alternatives covered).
- **0.0** — absent, wrong, or contradicted by the synthesis.

Write a one-line `evidence` for each grade — pointing to the line/section that earned it (or the gap, for 0).

Compute `score = Σ (grade_i * weight_i)`. Store `per_criterion` with `weighted = grade * weight` per row.

### Verdict from score + trajectory

| Condition | `verdict` | `loop_back_to` |
|---|---|---|
| `score ≥ 0.85` AND all structural checks pass | `ship` | `null` |
| `score < 0.60` AND `iteration ≤ 2` | `loop` | weakest-criterion's remediation phase |
| `score < 0.60` AND `iteration > 2` | `ship_with_gaps` | `null` |
| `0.60 ≤ score < 0.85` AND `previous_score` is null AND `iteration ≤ 2` | `loop` | weakest-criterion's remediation phase |
| `0.60 ≤ score < 0.85` AND `score_delta ≥ 0.05` AND `iteration ≤ 2` | `loop` (still climbing) | weakest-criterion's remediation phase |
| `0.60 ≤ score < 0.85` AND `score_delta < 0.05` | `ship_with_gaps` (plateau) | `null` |
| Any iteration `> 3` | force `ship_with_gaps` regardless of score | `null` |
| Any structural check is a hard fail (see ## hard fails below) | `loop` overrides score | the failing check's remediation |

`passed: true` iff `verdict == "ship"`. Both `ship` and `ship_with_gaps` mean the orchestrator proceeds to capture; `ship_with_gaps` triggers the `## Known gaps` appendix containing the weak criteria, their evidence, and structural-check failures.

### Weakest-criterion remediation map

| Criterion family | `loop_back_to` |
|---|---|
| `shape_fit`, `executable_steps`, `gotchas_present`, `prereqs_named`, `chronology_complete`, `verdict_clear`, `vocabulary`, `schools_named`, `canonical_voices`, `dated_recent`, `dated_events`, `neutrality`, `worked_example` | `synthesize` |
| `coverage`, `coverage_per_axis` | `source-rank` (if survey has unranked candidates) else `survey` |
| `source_diversity` | `source-rank` |
| `failure_modes` | `synthesize` if material is in tree; else `source-rank` |
| `disconfirm_pass` | `steelman` |
| `triangulation`, `common_origin_check` | `triangulate` |
| `mechanism_clarity` | `interrogate` (re-run `research-interrogate` on still-unclear claims; if budget exhausted, accept the "mechanism unclear" tag and ship the gap honestly) |
| `feynman_clarity` | `synthesize` (the synthesis is the thing leaking jargon; re-write it more plainly before re-running the test) |

## The 6 structural checks (in order)

### 1. Deliverable shape satisfied

Does the synthesis match the `deliverable_shape` set by `research-frame`? Specifically:

- `summary` → 2–3 paragraph body, TL;DR present, no comparison tables
- `comparison` → side-by-side present, all alternatives covered, neutral framing
- `how-to` → numbered steps, prereqs at top, gotchas section
- `timeline` → chronological, dated sections
- `decision` → recommendation in TL;DR, failure modes section present
- `fact-check` → verdict in TL;DR, confidence + caveats sections present
- `landscape-map` → vocabulary, schools, voices all present

Also check each entry in `frame.success_criteria` against the synthesis — every criterion either satisfied or explicitly addressed in "What's contested."

Fail → loop back to `synthesize`.

### 2. "What's contested" section present and honest

The section exists, AND it either (a) names real contested points with sources, or (b) explicitly states "nothing contested as of <date>" with evidence the search was done. A missing section is a fail. A boilerplate section ("there may be some debate…") is a fail.

Fail → loop back to `synthesize` if synthesize forgot it; loop back to `steelman` if the section is missing because no disconfirming pass ran.

### 3. Disconfirming pass run

For `deliverable_shape ∈ {decision, fact-check, comparison}`, at least one of:

- `steelman_run: true`
- `triangulate_runs: ≥1` with a result that included contradicting sources

For other shapes, this check is `n/a` — but if survey or deep-read surfaced contradictions, those should still appear in "What's contested." Auditor's call.

Fail → loop back to `steelman` (or `triangulate` if the synthesis hinges on a factual claim).

### 4. No single-source load-bearing claims

Walk the synthesis. For every `[^n]` citation, check: is there ANY OTHER citation in the doc supporting the same load-bearing claim? Load-bearing = the claim, if false, would change the verdict / recommendation / TL;DR.

If a load-bearing claim has exactly one source, the check fails for that claim. Non-load-bearing single-source claims are fine.

Fail → loop back to `triangulate` (verify the lone claim) or `source-rank` (pick more sources).

### 5. Dated

The synthesis has a date footer with ISO date. Sources have dates in their footnotes. "Recent" / "lately" / "nowadays" without a date appears nowhere in the doc.

Fail → loop back to `synthesize` (cheap fix).

### 6. Saturation AND no dangling branches

Two sub-checks:

**6a. Saturation:** Did the last 1–2 deep-reads add new claims or just corroborate existing ones?
  - New claims → not yet saturated. Acceptable; ship if depth_budget exhausted.
  - Pure corroboration → saturated; this IS the stop signal.
  - **New claims contradicted the synthesis → hard fail.** Synthesis may be wrong.

**6b. No dangling branches:** Every node in `tree` is either `status: done` or `status: abandoned`. Any node with `status: active` or `status: paused` is a fail — caller must finish or explicitly abandon before the run can complete.

Fail (contradiction) → loop back to `synthesize` after re-reading the contradicting source.
Fail (dangling) → loop back to `deep-read` for the open branch, or have the orchestrator mark it `abandoned` with explicit reason.

## Procedure for grading `feynman_clarity`

This criterion is special: instead of inspecting the synthesis for a structural marker, the grader *produces* a plain-language re-write and checks it for jargon leakage. The re-write is the test.

Steps:

1. **Extract the load-bearing claim.** Usually the TL;DR or first-sentence verdict / recommendation. For `landscape-map` use the "What's the territory" summary.
2. **Re-write it in 3–5 plain sentences** that:
   - Use vocabulary a smart 12-year-old (or a sharp non-specialist) would know.
   - Borrow zero terms from the corpus's terms-of-art list. If a term is genuinely irreducible (a proper noun, a domain-defining concept like "gravity"), it's allowed *once* with a one-clause unpack on first use.
   - Contain no "essentially…", "basically…", "what's happening is…", or other hand-wave phrases. Each of those is a flag that the next sentence skipped a step.
3. **Grade:**
   - `1.0` — the re-write reads cleanly, no jargon leakage, no hand-waves, and the load-bearing claim survives intact (the plain version is *the same claim* — not a watered-down version).
   - `0.5` — the re-write needs one borrowed term to land (and unpacks it), OR contains one hedge that masks a real gap, OR slightly under-specifies the claim.
   - `0.0` — the re-write either retains corpus jargon, hand-waves at a load-bearing step, or has to weaken the claim to land in plain words.
4. **Record the re-write in `evidence`** as a one-line "Re-written: <first sentence of the plain version>" so the loop-back to `synthesize` has something concrete to anchor on. The synthesize phase reads this and re-drafts the synthesis using language at the same level.

This procedure is internal to the stop-check pass — no extra tool calls, no extra fetches. It's about ten lines of prose the grader generates and inspects.

## Hard fails (override score)

These structural failures override a high score — the loop must engage:

- Check 4 (single-source load-bearing) failing — never ship even at score ≥ 0.85.
- Check 6a contradiction (new claims contradict synthesis) — synthesis may be wrong.
- Check 6b dangling branches — open work still in flight.

For these, set `verdict: "loop"` and `loop_back_to` from the check, regardless of `score`. They become `## Known gaps` entries only if the user explicitly bypasses.

## Steps

1. **Grade the rubric.** Walk `frame.success_rubric`, assign each criterion `grade ∈ {0, 0.5, 1}` with `evidence`. Compute `score`.
2. **Compute `score_delta`** as `score - previous_score` (or `null`).
3. **Run all 6 structural checks** in order. Stop at the first hard fail, or run all and report comprehensively — caller's choice based on budget.
4. **Decide `verdict`** from the table above: hard fails first, then score+trajectory rules.
5. **Set `loop_back_to`** — from a hard fail's remediation if present; otherwise from the weakest criterion's remediation map; otherwise `null`.
6. **Set `passed`** — true iff `verdict == "ship"`.
7. **Return JSON.**

## When to override and ship anyway

The user can explicitly bypass — "just give me what you have" / "ship it" / "good enough." In that case the orchestrator forces `verdict: "ship_with_gaps"` regardless of score; the rubric scoring + structural checks STILL run and the failures appear in a `## Known gaps` section appended to the synthesis. The user sees what they're shipping with — including the score.

The bypass is a user signal, not an agent decision. Never auto-bypass to save effort.

`ship_with_gaps` is also reached automatically when iterations exceed 3 or when score plateaus — same appendix, no user bypass required. The orchestrator surfaces the final score either way.

## Don't

- **Don't loop more than 3 iterations.** The score-trajectory + iteration cap is the discipline; if score isn't climbing, more loops are noise, not signal. Force `ship_with_gaps` and surface the appendix.
- **Don't grade leniently to avoid a loop.** A 0.5 means partial; don't round up because you want to ship. The whole point of scoring is that "barely passing" no longer looks identical to "nailed it."
- **Don't skip checks because "the synthesis looks fine."** The whole point of a gate is it runs even when intuition says done.
- **Don't add new criteria here without putting them in `research-frame`'s rubric defaults.** Criteria must be set upfront so the synthesis has a chance to satisfy them.
- **Don't collapse score and structural-check verdicts.** A score-driven plateau ships with gaps; a structural hard fail loops. They are different signals.
- **Don't return prose.** JSON only. The orchestrator handles user-facing messaging on failure.
