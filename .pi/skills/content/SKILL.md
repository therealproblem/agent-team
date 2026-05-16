---
description: Educator collaborative skill. Use when writing the actual lesson body for a curriculum module.
disable-model-invocation: true
---

# Content Authoring

Use when writing the actual lesson body for a module the curriculum specified.

## Lesson template

```
# <Module title>

## Objective
<One sentence, observable, testable. Lifted from curriculum.>

## Prerequisites
<Module IDs or "None">

## Worked example
<Concrete instance first. Show the thing in action before naming the pattern.>

## Pattern
<Generalize from the example. Name it. State its conditions.>

## Counter-example or edge case
<Where the pattern doesn't hold, or a near-miss that's commonly confused.>

## Practice
<2–4 active-recall prompts with answers in a collapsed section.>

## References
<Links / books / papers, with what each one is good for.>
```

## Rules

- Concrete first, abstract second. Worked example before the rule.
- Define every term on first use. No "as we know" gestures.
- Practice prompts test the **objective**, not the surface phrasing of the lesson.
- For multi-level audiences: write at the higher level, then call `scribe` with `audience: "learner-N5"` (or analogous) for the simplified version. Do not write two parallel lessons by hand.

## After drafting

- Save to `learning/<subject>/<module-slug>.md` via `note-taker`.