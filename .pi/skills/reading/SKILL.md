---
description: Language collaborative skill. Use to present graded JLPT reading passages and comprehension questions tuned to the learner level.
disable-model-invocation: true
---

# Reading Practice

Use to present graded reading passages tuned to the learner's current JLPT level.

## Passage selection

- Match the learner's current level. Within-level material reinforces; one-level-up material stretches; two-levels-up frustrates.
- Vary genres: news, essays, short fiction, dialogues, instructions. JLPT reading sections include all of these.
- Aim for ~ 200–400 characters at N5/N4, ~ 400–800 at N3/N2, ~ 800+ at N1.

## Presentation flow

```
1. Present the passage in plain Japanese (no furigana on first read).
2. Ask one comprehension question — main idea or specific detail.
3. User answers.
4. Provide:
   - Whether the answer is correct
   - Vocabulary breakdown for any words the user got stuck on
   - Grammar notes for any patterns that affected comprehension
5. Re-read with furigana on stretch-vocabulary kanji.
```

## Rules

- Don't gloss the whole passage upfront — that defeats the point. Glossing comes after the comprehension attempt.
- Comprehension questions test reading, not vocabulary. Wrong vocabulary should not block answering the main-idea question.
- For N3+ passages, include at least one inference question (something not stated literally).
- Never just translate the whole passage. The user reads; you explain *only what they didn't get*.

## Save

- Significant passages worth re-reading: `language/reading/<level>/<slug>.md` via `note-taker`.
- Vocabulary that tripped the user up gets added to the SRS queue via the `srs` extension.