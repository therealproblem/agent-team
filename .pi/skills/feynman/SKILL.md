---
description: Layer 3 shared service — available under every persona. The Feynman technique — test understanding of any single concept by explaining it in plain language, no borrowed jargon, as if to a 12-year-old. Invoke for "do I really understand this", "explain X in plain words", "where are my gaps on Y", or any time the user has read/heard about a concept and wants to verify they've absorbed it. The user's stumbles ARE the diagnostic.
---

# Feynman technique

A test of understanding via production. The premise: you can only claim to understand a concept if you can explain it cleanly to someone with no background — no jargon, no hand-waving, no "well, technically…". Where the explanation breaks down, your understanding does too. **The stumbles are the diagnostic.**

Named after Richard Feynman, who used it to learn physics topics he wasn't yet confident in. Works on anything explainable: code patterns, market dynamics, grammar rules, trade setups, system architectures, philosophical positions.

## When to invoke

- User says: "do I actually understand this", "let me see if I get it", "explain X back to me but plainly"
- Mid-corpus-learning Phase 5 (active recall): as the verification style after each discriminator answer
- After reading a paper, doc, or book chapter — before moving on
- When the user catches themselves using a term they can't unpack
- When teaching others — verifying *their own* grasp first

## The loop

### 1. Pick one concept

A single, specific concept. Not "machine learning" — "what gradient descent is and why it works". Not "the user persona" — "why this user persona buys our product and not the competitor's". Crisp scope.

### 2. Explain it in plain language

Constraints:

- **Vocabulary a 12-year-old (or a smart non-specialist) would know**. If the user catches themselves typing "stochastic optimization", "tail risk", "graded reading", *they've failed the rule*. Restart that sentence in plain words.
- **No "essentially"-handwaving**. "Essentially what's happening is…" is a flag for "I'm about to skip the part I don't get." Stop and unpack.
- **Concrete examples**. Abstract definitions don't survive Feynman; concrete cases do. "When you do X, what actually happens is Y, because Z."
- **No reading from sources**. From memory or it doesn't count.

The explanation can be spoken, written, typed — modality doesn't matter. *Production* is the test.

### 3. Find the gaps

The gaps show up as:

- **Sentences that started fine and trailed off** — you hit something you don't really get
- **Borrowed jargon** — you used a technical word because you couldn't unpack it
- **Vague verbs** — "it handles", "it processes", "the system manages" — what does it actually *do*?
- **Skipped causality** — "X happens. Then Y." But *why* does Y follow from X?
- **Analogies that don't quite map** — flag them; sometimes useful, but watch for "this is like Z" where Z papers over the gap

Write each gap down as a specific question: "Why does X cause Y?", "What's the difference between A and B?", "When does Z fail?"

### 4. Fill the gap from the source

Targeted return to the source material — not a re-read of the whole thing, just the specific gap. Read until that one question is answered. Take a note in your own words.

### 5. Re-explain

Go back to step 2. Re-explain the concept end-to-end, with the gap filled. If new gaps surface (often they do — filling one reveals adjacent ones), iterate.

Stop when: you can explain it once, end-to-end, plain words, no stumbles, no jargon-without-unpacking. Then you understand it. Until then, you don't — and pretending you do is the failure mode this technique exists to prevent.

## Output

```
CONCEPT: <one sentence statement of what's being tested>

EXPLANATION (Feynman, plain words):
<2–5 paragraphs the user produced from memory>

GAPS SURFACED:
1. <specific question>
2. ...

SOURCE PASSAGES CONSULTED:
- <reference + brief note>

REFINED EXPLANATION:
<the cleaner version after the gap was filled>

STATUS: <understood | partial — gaps remaining: <list>>
```

For routine in-conversation use, you don't need to write this out formally. For learning a heavy concept worth committing to memory, the full output through `note-taker` is appropriate.

## Don't

- **Don't accept jargon as a substitute for understanding.** Every term has to unpack. If the user can't unpack "amortized complexity" or "demand elasticity" or "te-form" in plain words, they don't yet understand it, no matter how confident they sound saying it.
- **Don't let "you know what I mean" stand.** That phrase is the user telling themselves they understand something they can't articulate. Push back: "Walk me through what 'know what you mean' is doing in that sentence."
- **Don't pre-fill gaps for the user.** The whole point is that *they* surface their own gaps via their own attempt. Jumping in with "you missed that X also depends on Y" robs the diagnostic.
- **Don't combine multiple concepts in one Feynman pass.** One concept at a time. Otherwise the gaps blur and the loop loses focus.
- **Don't skip to step 4 (filling gaps) without doing step 2 (the explanation).** The explanation IS the test. No production, no diagnostic. "Just tell me where my gaps are" turns the technique back into passive consumption.

## Caller notes

- **Educator**: default verification mode for active recall in `corpus-learning` Phase 5 and standalone after any new concept.
- **Engineer**: explain a tricky bug fix or system design to a non-engineer; explain a new framework's core concept after reading docs.
- **PM**: explain a feature's value to a non-technical exec; explain a complex user journey end-to-end without product jargon.
- **Language**: explain a Japanese grammar pattern in English a learner one level below could follow; or explain it *in* Japanese using simpler structure (when at higher levels). The "plain words" constraint is per-level: an N3 learner's plain-words bar isn't an N1 learner's.
- **Trader**: explain why a setup works without trading jargon ("price action", "liquidity sweep", "structure break" all have to unpack). The clearest test of whether the user actually understands a setup or is just pattern-matching.
