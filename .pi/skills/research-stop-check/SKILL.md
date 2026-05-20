---
description: "Layer 3 shared service — final gate before handoff to note-taker / render-html. Runs a 6-point checklist against the synthesized output: (1) deliverable shape satisfied, (2) contested-section present, (3) disconfirming pass run, (4) no single-source load-bearing claims, (5) dated, (6) saturation reached AND no dangling branches. Loops back to the right phase if any check fails. Cheap to run, expensive to skip. Called as Step 6 of `research` orchestrator."
---

# Research-stop-check

The "are we actually done?" gate. Runs a fixed checklist, surfaces failures, loops back to the right phase. Without it, the orchestrator declares done whenever the persona feels tired — same failure mode as humans without checklists.

## When to call

- Step 6 of `research` orchestrator, after `synthesize` but before `note-taker` / `render-html`.
- After any synthesis pass that's about to be persisted as a deliverable.
- NOT for one-shot conversational answers — only for research deliverables.

## Inputs

```json
{
  "frame": { "question": "...", "deliverable_shape": "...", "success_criteria": [...] },
  "synthesis_markdown": "<output of synthesize>",
  "tree": <research-tree>,
  "steelman_run": true | false,
  "triangulate_runs": <count>
}
```

## Output

```json
{
  "passed": true | false,
  "checks": [
    { "name": "...", "result": "pass | fail | n/a", "evidence": "<one-line>", "remediation": "<which phase to re-enter>" }
  ],
  "loop_back_to": null | "frame" | "survey" | "source-rank" | "deep-read" | "triangulate" | "steelman" | "synthesize"
}
```

## The 6 checks (in order)

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

## Steps

1. **Run all 6 checks** in order. Stop at the first fail and set `loop_back_to`. Or run all and report comprehensively — caller's choice based on budget.
2. **Set `passed`** — true only if all checks pass (or are `n/a`).
3. **Return JSON.**

## When to override and ship anyway

The user can explicitly bypass — "just give me what you have" / "ship it" / "good enough." In that case the orchestrator skips the loop-back and proceeds, but `research-stop-check` STILL runs and its findings appear in a `## Known gaps` section appended to the synthesis. The user sees what they're shipping with.

The bypass is a user signal, not an agent decision. Never auto-bypass to save effort.

## Don't

- **Don't loop back more than twice.** If a check keeps failing after 2 loops, surface to the user with the failure detail. Don't grind — the loop exists to catch oversights, not to brute-force quality.
- **Don't skip checks because "the synthesis looks fine."** The whole point of a gate is it runs even when intuition says done.
- **Don't add new checks here without updating the deliverable_shape contract** in `research-frame`. The checks must be derivable from frame + tree, not introduced ad-hoc.
- **Don't return prose.** JSON only. The orchestrator handles user-facing messaging on failure.
