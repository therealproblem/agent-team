---
description: PM inner skill. Define observable, testable success metrics for a product change BEFORE building. Invoke after a PRD's problem statement is clear, before scope is locked, or any time the user asks "how will we know this worked?" / "what does success look like?" / "what should we measure?". Produces 3-5 named metrics with baselines, targets, and measurement sources.
---

# Success metrics

Define what "this worked" means in measurable terms, tied to the original problem.

## When to invoke

- A PRD's problem is articulated but success isn't yet defined
- User asks "how will we know this worked", "what should I measure", "what's the success criteria"
- Before scope lock — so the team builds toward the metric, not the feature
- During launch planning — to wire instrumentation in before code ships

## Inputs

- Problem statement (from PRD or stated verbally)
- Constraints: what data is *actually* available (analytics, db, surveys, support tickets)
- Optional: existing baseline data if any

## Output — 3 to 5 metrics

For each metric, surface this block:

```
NAME: <short noun phrase>
DEFINITION: <one sentence, operational — no jargon>
TIES TO PROBLEM: <quote the problem fragment this proves/disproves>
TYPE: leading | lagging | guardrail
BASELINE: <current value or "unknown — measure before launch">
TARGET: <after how long, what value, why that bar>
SOURCE: <where the number comes from — table, event, survey, ticket query>
REVIEW CADENCE: daily | weekly | monthly | post-launch only
```

End with one **guardrail metric**: a counter-metric that catches the change harming something else (e.g. "new signups up — but support ticket volume on auth flow not up by >10%").

## Steps

1. Restate the problem in one sentence. If you can't, stop — the problem isn't ready.
2. Brainstorm 7–10 candidate metrics. Include vanity ones so you can explicitly reject them.
3. Cut the ones that aren't instrumentable, aren't tied to the problem, or are vanity.
4. Pick 3–5 (mix of leading + lagging + 1 guardrail).
5. State each with the block above.

## Don't

- **No vanity metrics.** Pageviews / impressions / clicks without conversion = noise.
- **No metrics you can't instrument.** "Customer satisfaction" without a measurement plan is a wish.
- **No moving the goalposts.** If you set the target, write it down before launch and don't revise after seeing data.
- **No more than 5.** Five is already a lot. Three is usually right.

## Save

Long-form metrics docs go to `vault/docs/` via `document` skill (HTML). The metrics block itself can be inline in the PRD; the doc adds the rationale for each choice.
