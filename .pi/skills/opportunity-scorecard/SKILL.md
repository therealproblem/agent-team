---
description: PM collaborative skill. Six-axis 1–5 stress-test scorecard for a sharpened product idea. Use AFTER `founder-discovery` produces a `pm/discovery/<slug>.md` one-pager and BEFORE spawning `opportunity-critic`. Output: a scorecard appended to the discovery doc. Distinct from `rubric` (generic anchor-defining) and from the Step 3 traffic-light scorecard in discovery (which ranks candidates) — this one pressure-tests the chosen idea.
disable-model-invocation: true
---

# Opportunity scorecard

Stress-test the **chosen** idea on six axes, 1–5 each, with one-line evidence-based justifications.

> Adapted from BuildGreatProducts/plaid (Validate capability, Step 7). The six axes and the "score from evidence, not vibes" stance come from there.

## When to invoke

- After `founder-discovery` produces a sharpened idea at `pm/discovery/<slug>.md`
- Before spawning `opportunity-critic` — the scorecard is one of the artifacts the critic reads
- Re-run when the idea has shifted enough that prior scores no longer apply (target user changed, problem reframed, MVP shape pivoted). Overwrite the old scorecard; don't append a second one.

Do NOT run this on the candidate list from Step 3 of discovery. That list uses a five-axis traffic-light scorecard for *ranking candidates*. This one *pressure-tests the survivor*.

## Inputs

- `pm/discovery/<slug>.md` — the sharpened one-pager
- Any user-research notes, customer-interview captures, or competitor scans the user has shared in conversation

If the discovery doc doesn't exist, stop and ask the user to run `founder-discovery` first. Don't try to score from chat context alone — the doc is the contract.

## The six axes

| Axis | What it tests |
|---|---|
| **Pain intensity** | How sharp the user's pain is — frequency × intensity × cost. A vitamin scores low; a painkiller they're already kludging together scores high. |
| **Buyer clarity** | How crisply you can name the buyer. "Solo dentists with their own billing" scores 5; "small business owners" scores 2. |
| **Urgency** | Whether the buyer would act this quarter, not someday. A regulatory deadline, a hire freeze, a competitor launch all push this up. |
| **Differentiation** | Whether there's a concrete reason a real user would switch from current behavior given switching costs. Not "better" or "cheaper" — specific. |
| **Speed to validate** | How fast a real behavioral test could run. A 2-week concierge test scores 5; a 6-month productized build scores 1. |
| **Founder advantage** | Whether *this* founder has unfair access, distribution, or domain depth others lack. "Worked in the segment 10 years" beats "interested in the space." |

## Scoring rules

- **1–5 integers only.** No half-scores. Force commitment.
- **Every score has a one-line justification** that references actual inputs — a quote from the discovery doc, a customer-interview snippet, a named competitor. If you'd need to invent evidence to score it, score it lower.
- **No averaging into a total.** The shape of the scorecard matters more than a sum. Two 5s and four 1s is a different idea than six 3s — don't flatten that.
- **Vibes cap at 2.** If the only justification is "feels right," cap the score at 2 until evidence shows up.

## Output

Append to `pm/discovery/<slug>.md` as a new section via `edit` — do not rewrite the whole file. If a prior `## Stress-test scorecard` section exists, overwrite it in place.

```markdown
## Stress-test scorecard

| Area | Score | Read |
|---|---:|---|
| Pain intensity     | n/5 | <one line — quote or evidence from the discovery doc> |
| Buyer clarity      | n/5 | <…> |
| Urgency            | n/5 | <…> |
| Differentiation    | n/5 | <…> |
| Speed to validate  | n/5 | <…> |
| Founder advantage  | n/5 | <…> |

**Shape:** <one sentence — where the scorecard is strong, where it's thin, and what that pattern suggests.>
```

The **Shape** line is the load-bearing part. Two 5s + four 2s says "founder has an edge but the market read is weak." Three 4s + three 3s says "broadly plausible but nothing exceptional." Name the shape; don't just list the numbers.

## After scoring

1. Surface the scorecard to the user with a two-sentence read.
2. If any axis scored 1, treat it as a candidate fatal flaw — flag it in your handoff so the user knows the critic will look hard at it.
3. Hand to `opportunity-critic` next — spawn it with the discovery doc path and the original problem statement. Don't paste the scorecard into the brief; the critic reads it from the doc.

## Don't

- Don't average into a total. The shape is the signal.
- Don't score on potential ("could be huge if X works"). Score on what's evidenced now.
- Don't soften a 1 to a 2 to avoid being negative. A 1 is information — it tells the critic where to dig.
- Don't re-rank candidates here. That's the discovery skill's job.
- Don't run this without a discovery doc on disk. Chat-context scoring is unverifiable.
