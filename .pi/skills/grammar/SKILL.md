---
description: Language collaborative skill. Use for JLPT grammar pattern practice and explanation, including drilling modes.
---

# Grammar Drills

Use for JLPT grammar practice and explanation.

## Per-pattern output

```
PATTERN: <name in Japanese with romaji>
JLPT: N4

Form: <grammatical formula, e.g. V-た + ばかり>
Meaning: <plain English>
Nuance: <what makes this pattern different from near-synonyms>

Examples:
  1. <natural example sentence>
     <translation>
  2. <natural example sentence>
     <translation>

Common confusions:
  - vs. <near-synonym pattern>: <when to use which>

Drill prompts:
  - <fill-in or translation prompt>
```

## Rules

- Always cite JLPT level.
- Examples must be natural — no awkward textbook sentences. If a sentence wouldn't appear in real Japanese, drop it.
- "Common confusions" is critical for N3 and above. Most patterns have a near-synonym; learners need to see them side by side.
- Don't over-explain. State the rule, show 2 examples, contrast with the near-synonym, drill.

## Drilling modes

- **Recognition**: present a sentence using the pattern, ask the user to identify the pattern and meaning.
- **Production**: give a context, ask the user to construct a sentence using the pattern.
- **Discrimination**: present a sentence with a near-synonym instead, ask the user to choose between two patterns and explain why.

## Save

- Per-pattern notes: `language/grammar/<level>/<pattern-slug>.md` via `note-taker`.