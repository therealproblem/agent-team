---
description: Educator collaborative skill. Use when writing quizzes, problem sets, or rubrics tied to learning objectives.
disable-model-invocation: true
---

# Assessment Authoring

Use when writing quizzes, problem sets, or rubrics.

## Item types

- **Recall** — does the learner remember the fact?
- **Apply** — can the learner use the rule on a fresh case?
- **Transfer** — can the learner combine multiple ideas to solve a novel problem?
- **Diagnose** — given a wrong answer or buggy artifact, can the learner identify the misconception?

A balanced assessment includes all four. A pure-recall test is a vocabulary check, not a learning check.

## Rules

- Each item ties back to a stated learning objective. If you can't name it, drop the item.
- Distractors (wrong answers) reflect plausible misconceptions, not arbitrary noise.
- Free-response items get a rubric, not a vibe-check. Rubric criteria are observable.
- Difficulty progression: items get harder; the last item integrates multiple objectives.

## Output shape

```
ASSESSMENT: <module>
OBJECTIVES TESTED: <list>

For each item:
  - ID
  - Type: recall | apply | transfer | diagnose
  - Objective: <which one>
  - Prompt
  - Answer (or rubric for free-response)
  - Distractors with brief explanation of the misconception each represents
```

## Don't grade your own items

When evaluating learner responses to these items, **spawn `educator/assessment-grader`**. Pass the objective and the response. The grader does not see the way you phrased the question, so its judgment reflects whether the learner met the objective rather than whether they decoded your wording.