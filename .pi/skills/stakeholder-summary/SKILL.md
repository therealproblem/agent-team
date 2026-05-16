---
description: PM collaborative skill. Use when writing status updates, exec briefs, or cross-team summaries. Outcome-led, not activity-led.
disable-model-invocation: true
---

# Stakeholder Summary

Use when writing status updates, exec briefs, or cross-team summaries.

## Structure

```
TL;DR: <one sentence — outcome, not activity>

What shipped:    <bullets of completed user-visible work>
What's next:     <bullets, ≤ 3 items>
What's blocked:  <bullets — what / why / what we need>
Decisions needed: <bullets — name the decision-maker and the deadline>
```

## Rules

- Outcomes, not activity. "Reduced onboarding drop-off 12%" beats "shipped onboarding redesign."
- ≤ 3 items per section. If everything is important, nothing is.
- "Blocked" with no ask is noise — every blocker names what would unblock it.
- "Decisions needed" is the action surface — make decisions easy to take.
- No team-internal jargon, code names, or org-chart references.

## Always

- Pass the result through `scribe` with the correct audience preset before sending. Stakeholder writing is the highest-value use of Scribe.
- Save to `pm/updates/<YYYY-MM-DD>-<audience>.md` via `note-taker`.