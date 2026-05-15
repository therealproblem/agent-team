---
description: Layer 3 shared service — usable under every persona. Decompose a problem into sub-problems, sequence by priority and dependency, surface trade-offs explicitly at each step. Invoke for "where do I start", "plan this out", "break this down", "what's the order", "what depends on what", or any time scope is too big to attack head-on.
---

# Planning

Take a problem too big to grasp whole. Decompose it. Sequence it. Name the trade-offs.

## When to invoke

- A problem is large or fuzzy and the caller doesn't know where to start
- A goal exists but the path is unclear
- Multiple sub-problems compete for priority and dependencies aren't obvious
- The caller is about to charge in — interrupt and plan first

Works under **any persona** — same decomposition shape, different content:

- **PM**: feature → epics → stories with prerequisites
- **Engineer**: refactor or build → tasks with dependencies + risk tags
- **Educator**: course goal → modules → lessons with prerequisite chain
- **Language**: JLPT-level target → study tracks with cadence
- **Trader**: setup development → journaling cadence + study targets + observation periods

## Inputs

- **Goal** (one sentence — what does done look like)
- **Constraints**: time, attention, dependencies on others, hard deadlines
- **Known unknowns**: what you'd need to find out before / during

## Steps

1. **Restate the goal in one sentence.** If you can't, the goal isn't sharp enough — push back on the caller before planning.
2. **List 5–15 sub-problems** without ordering or filtering. Brainstorm broadly.
3. **Group into 2–5 clusters** (epics, phases, modules, tracks — whatever fits the domain).
4. **For each cluster, identify**:
   - **Dependencies** — what must complete before this can start
   - **Risk** — what could derail it; "I know how to do this" vs "I'll need to learn / discover something"
   - **Effort estimate** — coarse buckets (S / M / L / XL) only; precision is fake at this stage
5. **Sequence by**:
   - **Hard dependencies first** (you can't avoid them)
   - **High-risk / discovery work next** (the longer you wait, the more your plan downstream depends on assumptions)
   - **High-leverage / unblock-the-most-others next**
   - **Polish / nice-to-have last**
6. **Surface trade-offs.** What does this sequencing cost? Name 1–2 alternative sequences and why you didn't pick them.
7. **Mark the first concrete next step.** One action the caller can start *today*.

## Output

```
GOAL: <one sentence>
CONSTRAINTS: <bullet list>

CLUSTERS (sequenced):
  1. <cluster name>            depends-on: <none | other cluster>   risk: <low | med | high>   size: <S|M|L|XL>
     - <sub-problem>
     - <sub-problem>
  2. <cluster name>            depends-on: <…>                      risk: <…>                  size: <…>
     ...

ALTERNATIVES CONSIDERED:
  - <other sequencing>  — rejected because <reason>

NEXT STEP: <one specific action — verb + object + (when)>
```

## Save

Long-form plans live in the vault as markdown via `note-taker` (e.g. `pm/plans/<date>-<topic>.md` or `engineering/plans/<date>-<topic>.md`). If the plan would benefit from a visual read (Mermaid dependency graph, timeline, status grid), follow up with `render-html` to produce an HTML version. Chat reply: the vault path; plus the URL only if you rendered.

For short plans (2–3 clusters, 5–10 sub-problems), inline in the chat reply is fine — no `note-taker` or `render-html` needed.

## Don't

- **Don't plan without a one-sentence goal.** Vague goals produce vague plans.
- **Don't pretend to estimate precisely.** S/M/L/XL is honest at this stage; "3.5 days" is fiction.
- **Don't ignore dependencies to make the plan look parallel-friendly.** Reality wins.
- **Don't skip the alternatives.** Naming what you rejected is half the value — protects against regret later.
- **Don't bury the next step.** The plan exists to enable action; if the next step is unclear, the plan failed.
