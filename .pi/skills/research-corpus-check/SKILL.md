---
description: "Layer 3 shared service — pre-synthesis gate. Validates the fetched source set is fit-for-purpose BEFORE synthesize burns its budget. Cheap counting check: independent-voice coverage on load-bearing topics, no domain dominance, survey warnings resolved by the actual fetched corpus, success criteria covered. Loops back to source-rank (cheap) or survey (only if queries need rethinking) on failure. Called between deep-read and triangulate/steelman/synthesize."
---

# Research-corpus-check

The "are these sources actually enough?" gate, before the expensive phases. Runs after deep-read fetches complete; before triangulate, steelman, and synthesize. Without it, the orchestrator can spend its synthesis budget on a corpus that should have been rejected at source-rank.

Stop-check catches corpus problems at the *synthesis* layer (single-source load-bearing claim). This skill catches them at the *source* layer (the corpus itself is lopsided). Both exist because the failures happen at different layers — and catching them here is much cheaper.

## When to call

- After all deep-read fetches in the current pass have completed (success or fallback-recovered via the fetch-reliability ladder).
- Before triangulate, steelman, and synthesize.
- NOT for one-shot fetches outside the pipeline — the check assumes a tree exists.

## Inputs

```json
{
  "frame": { "question": "...", "deliverable_shape": "...", "success_criteria": [...] },
  "tree": <research-tree from research-tree.walk_tree>,
  "survey_diagnostics": <corpus_diagnostics from research-survey output, optional>
}
```

## Output

```json
{
  "passed": true | false,
  "checks": [
    { "name": "...", "result": "pass | fail | n/a", "evidence": "<one-line>", "remediation": "<what to fix>" }
  ],
  "loop_back_to": null | "source-rank" | "survey",
  "warnings": [<survey warnings surfaced + any new>]
}
```

## The 4 checks (in order)

### 1. Independent-voice coverage

For each load-bearing topic (proxy: the frame's question + each `success_criteria` item; also any tree node with ≥2 claims), check that ≥2 distinct authors/orgs are represented in the sources touching that topic.

A topic backed only by sources from one author/org/site fails. Single-author corpus on a load-bearing topic is the failure mode this skill exists to catch.

Fail → `loop_back_to: "source-rank"` with instruction to pick from a different school (use `survey_schools` if available).

### 2. Domain concentration

Across all fetched sources for this run, no single domain (eTLD+1) holds >50% of the source count.

**Exception:** if `deliverable_shape == "how-to"` and the dominant domain is the official docs for the subject (e.g. `python.org` for "how to use asyncio"), that concentration is expected — pass with an `evidence` note.

Fail → `loop_back_to: "source-rank"`.

### 3. Survey-warning resolution

If `survey_diagnostics.warning` was set, re-run the same logic on the *fetched* corpus (not snippets). The actual fetches may have pulled in diversity the snippets didn't show, or may have made things worse.

- If warning was `homogeneous_domain` or `homogeneous_voice` and the fetched corpus still triggers it → `loop_back_to: "source-rank"`.
- If warning was `homogeneous_stance` or `no_recency_signal` and still triggers → `loop_back_to: "survey"` (different queries needed).
- If the fetched corpus resolves it → pass, but include the resolution in `evidence`.

### 4. Success-criteria coverage

For each item in `frame.success_criteria`, check there's ≥1 fetched source plausibly able to address it (title / excerpt keyword match against the criterion). A criterion with no covering source is a fail — synthesize can't satisfy the frame's contract from this corpus.

Fail → `loop_back_to: "source-rank"` if a candidate exists in the unranked pool; `loop_back_to: "survey"` if the survey didn't surface any candidate for the criterion at all.

## Steps

1. **Walk the tree** via `research-tree.walk_tree({ run_id })`.
2. **Run the 4 checks** in order. Each produces a `{ name, result, evidence, remediation }` entry.
3. **Set `loop_back_to`** to the earliest phase any failing check needs (survey beats source-rank). If all pass, `null`.
4. **Cap loops at 1 per run.** If this check has already fired and looped once, on second failure return `passed: false` with `loop_back_to: null` and let the orchestrator surface to the user. The pipeline is bounded.
5. **Return JSON.** Orchestrator continues (passed) or executes the loop-back.

## Cost

Cheap. No fetches, no tool calls. Pure logic over tree state + frame. Runs in seconds.

## Bypass

The user can explicitly bypass — "ship it" / "just give me what you have." In that case the orchestrator skips the loop-back and proceeds to triangulate/synthesize, but this skill STILL runs and its failures appear in a `## Known corpus gaps` section appended to the synthesis. The user sees what they're shipping with.

Never auto-bypass to save effort.

## Don't

- **Don't run on partial runs.** Wait until all fetches in the current pass have either succeeded or been recovered. Half a corpus is not a corpus.
- **Don't loop more than once per run.** Quality is bounded by budget; if one loop didn't fix it, the user should know what they're shipping with.
- **Don't second-guess source-rank's per-source scoring.** This skill is about *corpus composition* (coverage, diversity), not about individual source quality.
- **Don't duplicate stop-check's logic.** Source-level checks here; synthesis-level checks there.
- **Don't fail on `how-to` shape for domain concentration when the dominant domain is the official docs.** That's expected, not a flag.
- **Don't return prose.** JSON only. The orchestrator handles user-facing messaging.
