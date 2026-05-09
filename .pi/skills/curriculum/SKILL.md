# Curriculum Design

Use when sequencing topics into a learning path.

## Output shape

```
SUBJECT: <topic>
TARGET LEARNER: <starting level, prior knowledge, goal>
TIME BUDGET: <hours / weeks>

For each module:
  - Title
  - Learning objective(s) — observable, testable
  - Prerequisites — module IDs already covered
  - Estimated time
  - Key concepts (3–6)
  - Active-recall prompt(s) — at least 1
  - Reference material
```

## Rules

- Sequence by **prerequisite**, not by familiarity. The learner skipping a topic they "already know" still has to earn it via the recall prompt.
- Every module has at least one active-recall prompt — recognition is not learning.
- Modules build to a capstone: a project, problem set, or task that integrates the modules.
- Time budgets are honest. If 40 hours of material won't fit in 20, surface the trade-off (drop modules vs. shallower coverage) — don't shrink the time estimate.

## After drafting

- Save curriculum to `learning/<subject>/curriculum.md` via `note-taker`.
- For each module, queue the `content` skill to author the actual lesson.
