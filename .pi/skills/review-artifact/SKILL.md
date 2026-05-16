---
description: Cross-persona inner skill (pm, engineer, trader). Non-blind constructive review of ONE artifact — code, PR, PRD, design doc, trade decision, lesson plan. The caller can see full context (unlike the blind reviewer sub-agents `prd-critic`, `uat-tester`, `red-team`, `assessment-grader`). Invoke for "review this code", "look over this PRD", "is this ready", "what would you change". Produces severity-tagged findings.
disable-model-invocation: true
---

# Review (artifact)

Constructive review of one thing you're allowed to see in full context. Surface concrete findings with severity, not vibes.

## When to invoke

- User asks "review this", "look over this", "what would you change", "is this ready"
- Engineer reviewing their own PR or a teammate's
- PM reviewing engineer contribution against a PRD's intent
- Trader reviewing their own decision before / after a trade
- Any pre-merge / pre-ship final-pass review where context is visible

**Distinct from blind reviewer sub-agents** (`prd-critic`, `uat-tester`, `red-team`, `assessment-grader`, `jlpt-examiner`):
- Those are sub-agents — spawned blind, with curated input only, to surface what context-aware review would miss.
- This skill is *with full context*. Use both when both matter: spawn the blind reviewer for adversarial / spec-vs-implementation gaps; use `review-artifact` for code quality, clarity, taste, scope.

## Inputs

- **Artifact**: code diff, PR link / body, doc, decision
- **Standard to review against**: spec, style guide, PRD's stated success, "is this clear"
- **Optional rubric** from the `rubric` skill — defining the bar before measuring

## Output — findings by severity

```
ARTIFACT: <pointer / path / quote of what's reviewed>
STANDARD: <what the review is checking against>

FINDINGS:
  [block]   <severity-block: this must change before approving>
            Location: <file:line | section name>
            Issue:    <one-sentence statement of what's wrong>
            Why:      <one sentence — what it costs / what risk it creates>
            Fix:      <one-line suggestion or "needs separate design pass">
  [concern] <severity-concern: worth addressing, won't block>
            ...
  [nit]     <severity-nit: opinion-grade, leave-or-take>
            ...

OVERALL: <ship | revise | reject — with one-sentence justification>
```

Severities are strict:

- **`[block]`** — this must change before approval. Correctness, safety, scope-violation, breaks-the-build.
- **`[concern]`** — worth addressing; the artifact is better if fixed but ships without it. Clarity, design taste, minor robustness gaps.
- **`[nit]`** — opinion-grade. Style preferences, naming alternatives, formatting. **Tag explicitly so the author can ignore without guilt.**

If you can't articulate which severity, the finding isn't ready — drop it or sharpen it.

## Steps

1. **Read the standard first.** What is this artifact supposed to achieve / conform to?
2. **Read the artifact fully.** No skim-review.
3. **List candidate findings.** Don't filter yet.
4. **Assign severity to each.** This is the work — if it's not clear, refine the finding.
5. **Cut nits below a threshold.** Five nits is noise; one or two is fine.
6. **State an overall verdict** with one-sentence justification.

## Don't

- **Don't hide behind "looks good".** That's not a review.
- **Don't bury blockers in a list of nits.** Blockers first.
- **Don't review style and correctness in the same pass without separating them.** Severity tags do this work — use them.
- **Don't review without a standard.** "I don't like this" isn't actionable. "This contradicts the PRD's stated metric in section 3" is.
- **Don't substitute for the blind reviewer sub-agents** when the artifact is in their scope (PRD → also spawn `prd-critic`; user-facing feature → also spawn `uat-tester`; security-touching → also spawn `red-team`).

## Caller notes

- **Engineer**: code review on diffs; pre-merge self-review; PR feedback
- **PM**: review of engineering's implementation against the PRD's intent; review of a teammate's PRD before sharing
- **Trader**: review of own decision pre-execution ("would I take this trade if I saw it from outside?") or post-execution ("what's the lesson") — keep Socratic framing where applicable
