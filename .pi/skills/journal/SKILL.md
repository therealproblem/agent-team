# Trade Journal

Use to capture a single trade. Structured fields plus free-text narration.

## Capture template

```yaml
---
date: <YYYY-MM-DD>
time_entry: <HH:MM>
time_exit: <HH:MM or "open">
symbol: <e.g. XAUUSD>
direction: long | short
size: <units / lots>
entry: <price>
exit: <price or null>
stop: <price>
target: <price or null>
result: <P&L in account currency, or null if open>
result_R: <multiple of risk, or null>
---
```

## Free-text narration (the part that matters)

After the structured fields, capture in the user's own words:

1. **Setup** — what pattern / context made this a trade? (Be the user's voice, not a textbook.)
2. **Why now** — what triggered entry vs. just watching?
3. **Conviction** — high / medium / low, and why.
4. **Emotion** — what was the user feeling at entry? At exit? (This is the most under-captured field; ask if missing.)
5. **Adjustments** — did the user move stop / target / size mid-trade? Why?
6. **Outcome reflection** — for closed trades: what did the user learn, or what surprised them?

## Rules

- Capture the user's words. Don't substitute your own framing for theirs.
- One trade = one entry. Don't roll up.
- "Open" trades get logged at entry and re-visited at exit; both versions of the entry stay (don't overwrite).
- If a field is missing, **ask one question** to fill the most useful gap. Use the `clarifier` skill for follow-ups.

## Save

- Path: `trades/<YYYY>/<YYYY-MM-DD>-<symbol>-<entry-time>.md`.
- Save via `note-taker` with `folder: trades`, `tags: [<symbol>, <direction>]`, `source_agent: trader`.
