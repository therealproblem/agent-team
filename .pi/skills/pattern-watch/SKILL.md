---
description: Trader internal skill. Scan the trade journal corpus for recurring user-side patterns. Produces hypotheses for question-generator; not user-facing.
---

# Pattern Watch

Use to scan the trade journal corpus for recurring patterns in the user's behavior. This skill is internal — it produces hypotheses, not output to the user. The `question-generator` skill turns hypotheses into surfaced questions.

## Pattern categories to watch

1. **Setup recurrence** — same setup taken N times. What's the win rate? Average R?
2. **Emotion ↔ outcome** — when emotion at entry was X, how often did the trade work?
3. **Adjustment pattern** — when did the user widen stops / move targets / resize? In what kinds of trades?
4. **Time-of-day / day-of-week** — does outcome correlate with session timing?
5. **Sequence effects** — after a loss, does the user trade differently? After a win?
6. **Skipped trades** — patterns the user *watched* but didn't take, and the outcomes when re-checked.
7. **Stated vs. enacted rules** — places where the user described a rule in one entry and broke it in another.

## Evidence threshold

A pattern is **a hypothesis worth surfacing** when it has:

- ≥ 5 instances in the corpus (lower for very recent / fast-evolving behavior, higher for older / less stable claims), OR
- ≥ 3 instances with very high effect size (e.g. all 3 losing trades involved the same adjustment), OR
- A user-stated rule with ≥ 1 clear violation.

Below the threshold, **stay silent and keep observing**. Surfacing weak patterns trains the user to ignore Trader.

## Output (internal)

Pattern hypotheses live in `.pi/state/profiles/trading.md` (the user's trading profile), not in the vault. Updates go through the `PROFILE_UPDATE` proposal flow defined in the Trader agent's SYSTEM.md — Trader proposes, user approves, then Trader writes.

Hypothesis entry format:

```
## <YYYY-MM-DD> — <hypothesis name>
Evidence: <N instances, dates>
Effect: <observed correlation, with caveat about sample size>
Open question: <what the user could be asked to confirm/refine/refute>
Status: open | confirmed | refined | refuted
```

Hypotheses below the evidence threshold do NOT get proposed. They sit in your working memory across the session and are dropped at end. Only refined, confirmed, or refuted hypotheses with strong supporting evidence become `PROFILE_UPDATE` proposals.

## Don't

- Don't compute statistics you can't substantiate. "Win rate 47%" needs an actual count, not vibes.
- Don't generate market-side patterns ("XAUUSD does X on Tuesdays") — only user-side patterns.
- Don't promote a hypothesis to "confirmed" without the user's explicit confirmation.