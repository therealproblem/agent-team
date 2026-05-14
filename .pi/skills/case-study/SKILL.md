---
description: Cross-persona inner skill (pm, educator, trader). Walk through ONE real example end-to-end with structure — context → decision → outcome → lesson. Distinct from `session-retro` (multiple items, periodic) and `news` / `research` (current/external). Invoke when the user wants to extract teachable structure from a single specific instance — a feature launch, a trade, a lesson that worked or failed.
---

# Case study

One real example, fully unpacked. The point is *what generalisable structure does this one instance reveal*.

## When to invoke

- User points at one specific thing and wants to dig in: "let's break down that launch", "walk me through that trade", "why did this lesson work"
- Capturing institutional memory — a decision worth remembering even after team / context changes
- Teaching by example — using a known instance to illustrate a pattern

## Output structure (verbatim)

```
TITLE: <short noun phrase>
DATE / PERIOD: <when this happened>
ARTIFACT TYPE: <feature launch | trade | lesson | architecture decision | …>

## Context
<what was true before — facts, constraints, prior beliefs. No retrospective re-framing.>

## Decision (or action)
<what the user actually did, in their voice if possible. Include alternatives considered + rejected.>

## Outcome
<what happened — observable, measurable where possible. Include surprises.>

## Why it played out that way
<the causal chain, as best you can reconstruct. Mark anything speculative.>

## Generalisable lesson
<one sentence — what would you / a similar person take into a future situation that's analogous?>

## Counter-examples
<situations where the lesson would NOT apply. Helps prevent over-generalisation.>
```

## Steps

1. **Anchor on the artifact.** Get the user to point at the one thing — a PRD ID, a trade date, a lesson title. Refuse fuzzy multi-instance prompts ("how launches usually go") — those want `session-retro`.
2. **Reconstruct context.** Pull from journals, notes, or user memory. Distinguish *what was known then* from *what we know now in retrospect*.
3. **State the decision in the user's voice.** Quote them if you have a journal entry. Don't paraphrase into your own framing.
4. **Lay out the outcome** with measurements where possible. Surprises matter — flag them explicitly.
5. **Trace causality carefully.** "X caused Y" requires evidence; "X may have contributed to Y" when you're guessing.
6. **Extract one generalisable lesson.** Just one. Multiple is a session-retro masquerading as a case study.
7. **List 1–2 counter-examples** — situations where the lesson breaks. Prevents the user (or their future self) from over-applying.

## Save

Case studies are long-form by definition — produce via `document` skill (HTML, lands at `vault/docs/`). The chat reply is the URL + one-line summary. The HTML file IS the artifact.

## Don't

- **Don't combine multiple instances.** That's `session-retro`, not case-study.
- **Don't re-frame context with hindsight.** "We knew X was risky" — were they actually saying that *at the time*? If not, surface that the awareness only came after.
- **Don't extract more than one lesson.** Overloading dilutes the takeaway.
- **Don't skip the counter-examples.** A lesson without limits gets misapplied.

## Caller notes

- **PM**: feature launches, product decisions worth remembering, vendor / build-vs-buy choices made
- **Educator**: teaching cases — illustrative real-world worked examples for a course
- **Trader**: one trade or one trading day fully unpacked. Don't confuse with `trade-replay` — that's blow-by-blow execution detail; case-study is structural lesson
