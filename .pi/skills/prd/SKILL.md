---
description: PM collaborative skill. Use when drafting or revising a Product Requirements Document. Structured problem-led template.
disable-model-invocation: true
---

# PRD Authoring

Use when drafting or revising a Product Requirements Document.

## Discovery (before drafting)

Make sure each of these is covered. If the user hasn't given you the answer, **ask** — conversationally, one thread at a time, not as a form. Items already obvious from context (`<vault>/projects/<slug>/project.md`, the conversation, the existing codebase) don't need re-asking.

1. **Problem** — what's broken / opportunity, in the user's own words
2. **Affected segment** — who specifically, how often they hit it
3. **Cost of doing nothing** — what we lose by not solving
4. **Goal** — one-sentence outcome
5. **Success metrics** — for each: baseline, target, timeframe, how it's measured
6. **Constraints** — time, scope, regulatory, technical
7. **Surface area** — greenfield, or modifying existing code / UI / API?
8. **Stack + integrations** — what this touches; internal + external services
9. **Performance / scale envelope** — only if non-trivial
10. **Non-goals** — what's explicitly out of scope (≥3)
11. **Alternatives** — 2–3 viable, why each was passed
12. **Risks** — what could break, what we're betting on

Do not stall the user with a Q1–Q12 wizard. Cover the gaps in the natural flow of the conversation; cite back what you already know.

### Propose, don't interrogate

Before asking the user for a discovery item, try to infer it from `project.md`, the conversation, or the code. When you have signal to guess plausibly, **propose 2–3 candidates and a recommendation** instead of asking an open question.

> Instead of "what segment is affected?", say:
>
> > From what you've said, the affected segment is most likely:
> > 1. Power users hitting the export flow daily (recommended — matches the volume signal)
> > 2. New users still in onboarding
> > 3. Internal ops users running batch jobs
> >
> > Reply `1`, `2`, `3`, or correct me.

Items where this fits well: affected segment, scope cut, non-goals, alternatives considered, risks. Stick to open questions only when you genuinely have no signal — and never make the user author structure (sections, scope boundaries, non-goal lists) when you can draft a starting point.

## Structure

```
1. Problem
   - What's broken or what opportunity exists, in user-observable terms
   - Who experiences it (specific segment) and how often
   - Cost of doing nothing

2. Goal
   - One-sentence outcome
   - Success metrics (3 max). Each: baseline → target by timeframe, measured how.

3. Non-goals
   - What this explicitly does NOT solve (≥3 items)

4. Constraints
   - Time, scope, technical, regulatory

5. Proposal
   - The core change in 1 paragraph
   - User-facing flow / behavior
   - Open questions

6. Technical proposal
   - Surface area — what's new vs. modified
   - API sketch — endpoints with request / response shape (code blocks)
   - Schema sketch — tables / columns added or modified (code blocks)
   - Integrations — internal + external services touched
   - Failure handling — what happens when this goes wrong
   (This is a *proposal*, not binding spec. The engineer can push back and update.)

7. Rough timeline
   - One paragraph or short list: big chunks of work, rough span, gating dependencies.
   - No per-task hours — that's card-level work.
   - Example: "Schema + auth (~3 days) → UI flow (~5 days) → test + rollout (~2 days). Twilio integration on the critical path."

8. Alternatives considered
   - 2–3 viable alternatives, why each was not chosen

9. Risks
   - What could break, what we're betting on
```

## Rules

- Problem section comes first and must be in the user's words, not yours.
- Every claim about user need must name a segment. Bare "users / customers / people" is not a segment.
- Success metrics must be falsifiable: you can tell, after shipping, whether each one moved.
- "Non-goals" is mandatory — if you can't list 3, you don't understand the scope.
- Technical proposal is a *proposal*, not binding spec. If the engineer changes shape during implementation, update the PRD.
- Open questions belong in the doc. Don't paper over them.

## After drafting

- Save to `pm/<slug>.md` via `note-taker`.
- Spawn `pm/prd-critic` with the PRD body and the original problem statement as artifacts. Surface its findings.
