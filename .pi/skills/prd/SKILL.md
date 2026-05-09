---
description: PM collaborative skill. Use when drafting or revising a Product Requirements Document. Structured problem-led template.
---

# PRD Authoring

Use when drafting or revising a Product Requirements Document.

## Structure

```
1. Problem
   - What's broken or what opportunity exists, in user-observable terms
   - Who experiences it (specific segment) and how often
   - Cost of doing nothing

2. Goal
   - One-sentence outcome
   - Success metrics (3 max)

3. Non-goals
   - What this explicitly does NOT solve

4. Constraints
   - Time, scope, technical, regulatory

5. Proposal
   - The core change in 1 paragraph
   - User-facing flow / behavior
   - Open questions

6. Alternatives considered
   - 2–3 viable alternatives, why each was not chosen

7. Risks
   - What could break, what we're betting on
```

## Rules

- Problem section comes first and must be in the user's words, not yours.
- Every claim about user need must name a segment.
- "Non-goals" is mandatory — if you can't list 3, you don't understand the scope.
- Open questions belong in the doc. Don't paper over them.

## After drafting

- Save to `pm/<slug>.md` via `note-taker`.
- Spawn `pm/prd-critic` with the PRD body and the original problem statement as artifacts. Surface its findings.