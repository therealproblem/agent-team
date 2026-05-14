---
description: Cross-persona inner skill (pm, educator, trader). Define explicit evaluation criteria for an artifact BEFORE evaluating it. Invoke before scoring a PRD, grading a lesson response, judging a trade setup, or any "is this good?" question. Forces the bar to be stated in writing — prevents post-hoc rationalisation.
---

# Rubric

State the bar before measuring against it. A rubric defined after seeing the artifact is a justification, not an evaluation.

## When to invoke

- About to evaluate something subjective: PRD quality, lesson clarity, trade-setup soundness
- The caller is tempted to say "this is good" or "this is bad" without saying *why*
- Multiple comparable items will be evaluated (consistency matters)
- The same artifact may be re-evaluated later (you want to compare apples to apples)

## Output — the rubric itself

```
ARTIFACT TYPE: <PRD | lesson plan | trade setup | architecture proposal | ...>
PURPOSE: <one sentence — what is this artifact supposed to achieve>

CRITERIA:
  1. <Criterion>      WEIGHT: <low | med | high>   SCALE: <0–3>
     ANCHOR 0: <what zero looks like, concretely>
     ANCHOR 1: <what one looks like>
     ANCHOR 2: <what two looks like>
     ANCHOR 3: <what three looks like — the bar>
  2. ...
  3. ...
```

3–7 criteria. Fewer = too coarse to discriminate. More = too granular to use consistently.

## Steps

1. **Name the artifact's purpose.** If you can't, the rubric won't help — the artifact itself is unfocused.
2. **List candidate criteria.** Brainstorm widely, prune ruthlessly.
3. **For each surviving criterion, write anchors** — concrete descriptions of what each scale point looks like. "Clarity" without anchors is unusable.
4. **Assign weights.** Not all criteria are equal. State weights now, not after scoring.
5. **Sanity-check**: would two reviewers using this rubric independently score similarly? If no, the anchors are too vague.

## When to apply

The rubric is the *output* of this skill. Applying it to an artifact is a separate step:

```
ARTIFACT: <pointer / quote>
SCORES:
  Criterion 1: <score>  — <one sentence justification quoting the anchor>
  Criterion 2: <score>  — <…>
  ...
WEIGHTED TOTAL: <sum>
VERDICT: <pass | revise | reject — with the bar>
```

## Don't

- **Don't define the rubric after seeing the artifact.** That's reverse-engineering a verdict.
- **Don't use unnamed criteria.** "Quality" isn't a criterion — clarity, completeness, accuracy, and brevity are criteria.
- **Don't weight everything equally.** It tells you you haven't thought about what matters.
- **Don't apply someone else's rubric without checking the anchors fit your artifact's purpose.** Same name, different bar.

## Caller notes

- **PM**: rubric for PRD quality, feature prioritisation, vendor evaluation
- **Educator**: rubric for student work, lesson quality, problem-set design
- **Trader**: rubric for setup quality — anchors describe what a "0 / 1 / 2 / 3 quality A+ entry" looks like in your trading. Updates `trading.md` profile when new criteria emerge from journaling
