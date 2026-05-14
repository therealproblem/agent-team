---
description: Language inner skill. Extract new vocabulary from a Japanese passage, score by usefulness + JLPT level, and queue selected items into the SRS deck via the `add_item` tool. Invoke when the user reads a passage and wants the new words captured for future review, or when they paste any chunk of Japanese and say "mine this for vocab".
---

# Vocab mining

Pull new vocab from a passage, score it, queue the worthwhile ones into SRS.

## When to invoke

- User pastes a Japanese passage and asks for vocab extraction
- User finishes a reading session and wants the new words captured
- User says "mine this", "add these to SRS", "what new words are here"

## Inputs

- Source passage (Japanese, any length up to a few paragraphs)
- Optional: target JLPT level filter (skip items way above or below)
- Optional: domain hint (news / novel / textbook / chat — affects relevance weighting)

## The loop

1. **Tokenize.** Identify every noun / verb / adjective / adverb / set phrase. Skip particles and function words.
2. **Deduplicate against the existing SRS deck** via `list_due` and inferred deck state. If a word is already known/queued, skip.
3. **Tag each candidate** with: dictionary form (lemma), reading (hiragana), JLPT level, part-of-speech, one-line gloss.
4. **Score for inclusion**:
   - Frequency in real Japanese (high freq → high priority)
   - Relevance to passage's topic (mining for *this* domain matters more than passage-incidental words)
   - Distance from learner's current JLPT level (one level above current = ideal; three levels above = skip)
5. **Surface a candidate list**, ordered by score, with a recommended cut line ("add top 8?").
6. **On user confirmation**, call `add_item` per accepted word with the tagged metadata.

## Output

Surface as a table before the `add_item` calls:

```
| Word | Reading | POS | JLPT | Gloss | Score | Recommend |
|------|---------|-----|------|-------|-------|-----------|
| 経験 | けいけん  | n   | N3   | experience | 0.92 | ✓ |
| 抽象的 | ちゅうしょうてき | na-adj | N2 | abstract | 0.71 | ✓ |
| 言い渡す | いいわたす | v   | N1 | to declare/sentence | 0.31 | skip — too far above |
```

After confirmation:

```
Added 8 items to SRS deck under N3 + N2 review queue.
Next review window: <from list_due>.
```

## Don't

- **Don't add every word.** A passage of 200 words might produce 30 candidates; usually only 5–10 are worth queueing.
- **Don't add words 2+ levels above current.** The retention rate isn't worth the deck pollution.
- **Don't skip the dedup step.** Adding a duplicate splits the user's review history for that word.
- **Don't add idioms as if they were individual words.** Capture the phrase verbatim — keep meaning attached.
- **Don't infer readings for unfamiliar kanji.** Look them up; if uncertain, surface the ambiguity rather than guess.

## Save

Surface a short markdown summary via `note-taker` under `language/<level>/<date>-vocab-mining.md` if the user wants a record beyond the SRS queue itself. Otherwise the SRS deck IS the record.
