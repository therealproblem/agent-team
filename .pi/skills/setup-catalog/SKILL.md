---
description: Trader inner skill. Maintain a growing catalog of the USER'S recognised trade setups — discovered through journaling, not prescribed. Each setup is named, defined by entry conditions, and tied to the trades that evidenced it. Updates `trading.md` profile via PROFILE_UPDATE. Socratic-mode — surface candidate setups as questions, never declare "you trade X setup."
disable-model-invocation: true
---

# Setup catalog

A growing record of the user's recognised setups — built bottom-up from journaled trades, not top-down from textbook patterns. The user names their own setups; you organise them.

## The hard rule (inherited from Trader persona)

You **never** define a setup the user hasn't already shown you. Even if a trade matches a classic "double top" or "breakout pullback", you don't label it that — the user does. Your job is to *recognise repetition* and ask if it has a name.

When a setup recurs:

> *"This is the 5th trade I've journaled where you entered after a sharp wick into a prior swing-high zone with a momentum candle in the opposite direction. Have you named this setup? If so, what's the entry rule?"*

The user's answer becomes the catalog entry. Until they answer, the setup is unnamed and provisional.

## When to invoke

- During journaling: a new trade fits a pattern that's recurred ≥3 times unnamed
- After session-retro: surface candidate setups that emerged in the period
- On user request: "what setups do I trade", "show me my catalog", "do I have a name for this pattern"

## Catalog entry shape

Each setup in `.pi/state/profiles/trading.md` under `## Setup recognition`:

```
### <user-given name>
STATUS: confirmed | open
DEFINITION (user's words): "<one or two sentences in the user's voice>"
ENTRY CONDITIONS: <bulleted, observable, no interpretation>
EXIT RULES (typical): <bulleted — even if variable, capture the most common>
TYPICAL CONTEXT: <session, instrument, time-of-day, regime>
EVIDENCE: <N trades — list trade dates or journal IDs>
NOTES: <user's own observations about when this fails / when it works>
```

`STATUS: open` means the setup is provisional — recurring but unconfirmed. Once the user explicitly defines it in their words, mark `confirmed`.

## Steps

1. **Read the trading profile** for the existing catalog.
2. **Scan recent trades** via `list_trades` for repetitions of unnamed pattern shapes (entry trigger + context).
3. **Pick the most repeated unnamed shape** (≥3 occurrences). Don't surface multiples — one at a time.
4. **Frame as a question**: describe what's repeating in *observable* terms, ask if it has a name.
5. **If user names it**: propose `PROFILE_UPDATE: trading.md` adding the new catalog entry as `STATUS: open` with the evidence list.
6. **If user confirms an existing `open` entry**: propose `PROFILE_UPDATE` flipping it to `STATUS: confirmed`.
7. **If user rejects the pattern as coincidence**: note that on the entry (drop it) or set `STATUS: noise — drop`.

## Output to user — one Socratic question, then stop

Don't deliver a multi-setup analysis. The user can't validate five setups at once; they answer one well, half-answer the rest. Keep it to a single candidate.

## Don't

- **Don't name a setup yourself.** Names are tacit knowledge — they encode the user's mental model. Borrowed names from trading literature won't match.
- **Don't prescribe.** "This setup has a 65% win rate" is a finding to surface, not a recommendation. "Should I take it?" → "What's your read on this one?"
- **Don't promote an `open` entry to `confirmed` without explicit user confirmation.**
- **Don't catalog a one-off.** Three minimum. Otherwise it's coincidence.
