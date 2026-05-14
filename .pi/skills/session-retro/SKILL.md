---
description: Cross-persona inner skill (trader, educator). Periodic retrospective over N units of activity (trades, lessons, study sessions) — surfaces patterns, asks questions, proposes profile updates. Invoke for "weekly review", "monthly retro", "let's look back at the last X", or whenever the user wants to step back from doing and reflect on a window of past work.
---

# Session retro

Step back from a window of recent activity. Find what repeated, what surprised, what to change — and surface findings as questions, not pronouncements.

## When to invoke

- User says "weekly review", "monthly retro", "let's look back at this week / month / quarter"
- Natural cadence boundary (end of week, end of month, end of a study module)
- Significant volume of activity has accumulated without a step-back

**Distinct from `review-artifact`**: that's reviewing *one thing*. This is reviewing *N things over a window*.

## Inputs

- Time window or count ("last 30 trades", "this month", "since last retro")
- Optional: focus areas ("just risk patterns", "just N3 grammar work")

## Steps

1. **Fetch the activity for the window** — `list_trades` for trader, vault scan / SRS records for educator.
2. **Aggregate cleanly**: counts, basic stats (wins/losses for trader, retention/completion for educator). No interpretation yet.
3. **Surface the data first** — give the user the picture before asking questions.
4. **Identify 2–4 patterns** that recurred meaningfully across the window (≥3 instances; spike or shift vs. previous window).
5. **For each pattern**, frame a Socratic question — what does the user think drove it?
6. **Listen.** The user's answer is the lesson, not yours.
7. **Capture** anything durable as `PROFILE_UPDATE` proposals (trading.md or learning.md).

## Output structure

```
WINDOW: <dates / count>
VOLUME: <N trades | N study sessions | N lessons>
SUMMARY STATS:
  <key numbers, no interpretation — just the data>

PATTERNS:
  1. <observable pattern, frequency, examples>
  2. <observable pattern, frequency, examples>
  ...

QUESTIONS (one at a time, in order):
  → <first Socratic question>
```

Then **wait for the answer** before posing the second question. A retro that lectures isn't a retro — it's a report.

## Save

For trader/educator/PM retros that summarise multiple weeks of work — go through `document` skill to produce an HTML retro doc under `vault/docs/`. Returns a `file://` URL the user can refer back to.

## Don't

- **Don't surface patterns from <3 instances.** Coincidence rate is too high.
- **Don't deliver pre-baked conclusions.** "You've been overtrading on Wednesdays" is a finding to surface as "I noticed N Wednesday trades vs M Tuesdays — what's different about Wednesdays?"
- **Don't fire all questions at once.** One, then listen, then the next.
- **Don't propose profile updates without explicit user confirmation.** This is the same `PROFILE_UPDATE` flow used elsewhere.

## Caller notes

- **Trader**: weekly / monthly trading retros. Compounds with `setup-catalog` and `pattern-watch` — those run continuously; this is the periodic step-back.
- **Educator**: end-of-module retros for a subject. Looks at retention, what stuck, what didn't, where to adjust the curriculum or schedule.
