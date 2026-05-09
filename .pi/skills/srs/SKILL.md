# SRS Reviews

Use when running spaced-repetition reviews on vocab, kanji, or grammar items. Backed by the `srs` extension which holds the queue and scheduling state.

## Session shape

```
1. srs.list_due() → items due now
2. For each item:
   a. Present in target form (Japanese for production, English for recognition)
   b. User answers
   c. Grade: again | hard | good | easy
   d. srs.record(item_id, grade) — extension reschedules
3. End-of-session summary: items reviewed, accuracy, weak categories
```

## Rules

- One item at a time. Don't batch.
- Present in the format the item type expects:
  - Vocab: meaning → Japanese (production) OR Japanese → meaning (recognition); alternate
  - Kanji: reading prompts cycle on/kun; meaning prompts standalone
  - Grammar: pattern → produce a sentence using it
- Don't reveal the answer until the user attempts.
- Honor the user's "again" without judgment — that's how SRS works.
- After the session, summarize **weak categories**, not weak individual items. "Verb conjugation in volitional form" beats "the word 行く."

## Save

- Append session summary to `language/srs/<YYYY-MM-DD>.md` via `note-taker`.
- Pattern hypotheses about persistent weaknesses go to `language/_weak-points.md` (a single growing doc).
