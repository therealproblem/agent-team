---
description: PM inner skill. Synthesize qualitative user data — interview notes, support tickets, survey free-text, user-quoted feedback — into a small number of VALIDATED user problems. Invoke before drafting a PRD (problem-discovery phase), after a batch of customer interviews, or whenever the user is staring at a pile of raw qualitative input and wants signal extracted.
---

# User research synthesis

Take a pile of raw qualitative data. Find the patterns that recur with frequency, severity, and named segments. Output a small number of validated problems, not a long list of every complaint.

## When to invoke

- Pre-PRD problem discovery — synthesize before deciding what to build
- After a batch of customer interviews (≥5)
- Periodic review of support / sales / NPS qualitative feedback
- User has notes / quotes and wants "what's the actual problem here"

## Inputs

- Raw qualitative data — interview notes, ticket transcripts, survey free-text, sales call notes
- Optional: segment metadata per source (which customer type, what plan, when)
- Optional: pre-existing problem hypotheses to validate/falsify

## Steps

1. **Read everything first.** Do not start themeing on first pass — note initial impressions but suspend judgment.
2. **Code each input** with one or more theme tags (free-form, descriptive — refine later). One quote can carry multiple tags.
3. **Cluster the tags into themes.** Aim for 5–10 themes. Fewer = under-coded; more = over-coded.
4. **For each theme, surface**:
   - **Frequency**: how many distinct sources mentioned it (not how many times it was said — one loud user is one user)
   - **Segments**: who said it (specific customer types, plans, use cases)
   - **Severity quotes**: 2–3 direct user quotes that convey the intensity
   - **Unmet need**: a one-sentence statement of what the user is trying to do and what's blocking them — **in problem form, not solution form**
5. **Rank by problem strength** = frequency × severity × addressability. Cut to top 3–5.
6. **State validated problems** in PRD-ready language.

## Output

```
SAMPLE: <N interviews / N tickets / etc.>     WINDOW: <dates>     SEGMENTS COVERED: <list>

THEMES (initial — internal scratchpad):
  - <theme tag>: <N sources>
  - ...

VALIDATED PROBLEMS (top 3–5):
  1. PROBLEM: <one sentence, in the user's voice — "I can't…" / "It takes me… to…">
     SEGMENT: <who has this>
     FREQUENCY: <N of M sources>
     SEVERITY: <quote 1>
                <quote 2>
     UNMET NEED: <one sentence — what they're trying to do, what blocks them>
     CURRENT WORKAROUND: <if they have one — informative about strength of need>
  2. ...

CUT FOR LATER (themes that didn't make top 3–5):
  - <theme>: <one sentence why — too rare / too vague / single-segment edge case>

HYPOTHESES TO VALIDATE NEXT:
  - <if a theme is suggestive but the sample is too small or skewed>
```

## Save

Produce the full synthesis as HTML via `document` skill, lands at `vault/docs/`. The chat reply is the URL + a one-line summary of the top problem identified.

The artifact feeds directly into a PRD — the `PROBLEM` section of a PRD should cite this synthesis doc.

## Don't

- **Don't propose solutions.** Synthesis stops at "what's the problem". Solutioning is a separate step (PRD authoring).
- **Don't extrapolate from one or two sources.** Strong wording is not strong evidence.
- **Don't confuse strong opinions with high frequency.** A vocal minority is still a minority — surface that explicitly.
- **Don't paraphrase user quotes into your own words for the SEVERITY block.** The user's words carry signal your paraphrase strips.
- **Don't suppress contradictory data.** If two segments say opposite things, that's a finding — surface both.
