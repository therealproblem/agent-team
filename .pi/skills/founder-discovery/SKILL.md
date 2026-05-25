---
description: PM collaborative skill. Use BEFORE drafting a PRD when the user shows up with a rough idea, a hunch, or "I've been thinking about X" — anything upstream of a spec. Walks the founder through Branch A (business) / Branch B (expertise) / Both intake, surfaces 3–5 candidate directions, runs a five-axis traffic-light scorecard, picks one, and sharpens it. Output is a `pm/discovery/<slug>.md` one-pager that the `prd` skill and the `opportunity-critic` agent both read.
disable-model-invocation: true
---

# Founder discovery

Use when the user shows up with a rough idea, an itch, "I've been thinking about X" — anything upstream of a PRD. The PRD skill assumes the problem and target user are already pinned down; this skill is what pins them down.

> Adapted from BuildGreatProducts/plaid (Idea capability). Question banks, the "suggestions start at Q3" rule, and the scorecard axes are lifted from there.

## Voice

Warm but direct. Opinionated. Don't flatter weak ideas; don't pretend every answer is interesting. Help the founder find something worth building — not validate whatever they say.

## When to invoke

- The user has a rough idea but no problem statement yet
- The user is brainstorming "what could I build" and wants structure
- A PRD draft is faltering because the upstream — who exactly, what specifically — was never fixed
- The user explicitly says "I have an idea" / "I've been thinking about X" / "help me figure out what to build"

Skip when:

- The PRD already has a sharp problem + target user — go straight to `prd`
- The user is asking for execution on a known scope — go via the card flow → `engineer`
- The user is exploring "what feature should we ship next" inside an already-validated product — that's roadmap territory, not discovery

## Modes

**Fresh:** no `pm/discovery/<slug>.md` exists. Run Steps 0 → 5.

**Existing discovery doc:** read it and ask which path:

- Refine the chosen idea → jump to Step 5
- Pick a different candidate from the scorecard → jump to Step 4
- Start over → confirm, restart from Step 0

Before jumping to Step 4, confirm the `## Candidates considered` table exists and parses. If missing or corrupt, offer to regenerate from Step 2.

## Step 0 — Source selection

Open with:

> "Great ideas usually come from one of two places: a business you already run, or expertise you've built over years. Which are we drawing from — business, expertise, or both?"

- **Business** → Branch A (8 questions)
- **Expertise** → Branch B (8 questions)
- **Both** → Branch C (trimmed — 5 from A + 5 from B)
- **"I don't know"** → ask two scouts ("what do you spend most working time on?", "what gets you unreasonably excited?") and recommend a branch

## Step 1 — Context capture

**Behaviour rules (load-bearing):**

- One question at a time. No batching.
- **Suggestions start at Q3.** Q1 and Q2 get no suggestions — the founder's unprompted words are the input. From Q3 onward, propose 3 tailored suggestions grounded in everything said so far. Never generic.
- Mirror back specifics the founder uses. If they say "invoice reconciliation," do not generalize to "finance work."
- If an answer is thin, probe once with a gentler version. If still thin, move on.
- If something surprising lands mid-question, flag it: "That's interesting — hold that thought, we'll come back to it."

### Branch A — Business process

1. What does your business do? Plain English, one or two sentences.
2. Who are your customers and how do they find you?
3. Walk me through your most common workflow. Where does it begin and end?
4. Where do hours disappear each week? Time sinks — manual, repetitive, unavoidable.
5. What do customers keep asking for that you don't offer? Unmet demand you've heard.
6. What do you know that your team or competitors don't? Tribal knowledge.
7. What unique data, relationships, or access do you have? Moats. What would competitors struggle to replicate?
8. What part of the job would you pay to delete?

### Branch B — Personal expertise

1. What's your background? Career, craft, what you've built or been paid to do.
2. What do you understand deeply that most people don't?
3. What do people come to you for advice about? Repeated questions from peers or strangers.
4. What problem have you solved the hard way you'd re-solve for others?
5. What tool do you wish existed in your daily work?
6. What unfair advantages do you have? Access, relationships, data, taste, reputation, time.
7. Where have you seen existing solutions fall short?
8. What could you talk about for three hours without getting bored? Obsessions signal durable founder fit.

### Branch C — Both (trimmed)

From Branch A: 1, 3, 4, 5, 7. From Branch B: 2, 3, 5, 6, 8.

## Step 2 — Pattern synthesis

When Step 1 is done, summarize 3–5 bullets — themes, tensions, and advantages that stood out. Be specific.

Then surface **3–5 candidate idea directions.** Each has:

- **Who it's for** — specific user, not "businesses"
- **What it does** — one sentence
- **Why this founder** — the angle only they could take

Rank them. Lead with your strongest recommendation and say why. Don't hedge — the founder can override.

Candidates lean on actual inputs. If you invented an unrelated idea, you've done this wrong.

## Step 3 — Candidate scorecard

Score each candidate on five axes with traffic-light rating and one-line rationale:

| Axis | Question | Rating |
|---|---|---|
| Unfair advantage | Is this founder uniquely positioned to build this? | 🟢 / 🟡 / 🔴 |
| Pain level | Real, painful, paid-for problem? | 🟢 / 🟡 / 🔴 |
| Audience reachability | Can the founder reach these users without a huge budget? | 🟢 / 🟡 / 🔴 |
| MVP feasibility | Can a small team ship a useful v1 in 4–8 weeks? | 🟢 / 🟡 / 🔴 |
| Differentiation | Is there a clear reason to pick this over alternatives? | 🟢 / 🟡 / 🔴 |

Show the scorecard as one table. Red scores aren't disqualifying — they're risky assumptions to validate.

This is **not** the same scorecard as `opportunity-scorecard`. The five-axis traffic-light scorecard *ranks candidates*; the six-axis 1–5 scorecard *pressure-tests the survivor*. Both are preserved.

## Step 4 — Pick one

Recommend the strongest candidate in two sentences — what it has going for it and what to worry about. Invite the founder to:

- Go with the recommendation
- Pick a different candidate
- Blend two candidates

**Blend rule:** blends must share a user OR features — never both axes differ. Acceptable: "bookkeepers doing reconciliation" + "bookkeepers doing client reporting." Not: "bookkeepers doing reconciliation" + "dentists managing appointments." If the founder blends, re-score before moving on.

## Step 5 — Sharpen

Tighten the chosen idea across five fields. Ask for each, offer suggestions, push back if vague.

1. **Target user** — Specific. "Freelance bookkeepers managing 10–30 clients," not "small businesses."
2. **Specific problem** — In the user's own words. What do they complain about today?
3. **Smallest testable version** — MVP shape. What one flow proves the concept?
4. **Why you** — Advantage statement. One sentence on why this founder wins.
5. **Top 3 risky assumptions** — What must be true? What would kill it?

If answers don't hold up to gentle pressure, say so and sharpen together.

## Output — save the discovery one-pager

Save via `note-taker` to `pm/discovery/<slug>.md`. Use this structure:

```markdown
---
title: Discovery — <working name>
date: <ISO>
tags: [discovery, pm/discovery]
status: sharpened
---

# Discovery — <working name>

## One-liner
<one sentence — what it is and who it's for>

## Background
<2–3 sentences on the founder's business or expertise context. Why this idea now.>

## The problem
<who feels pain, what the pain is, how they handle it today. Founder + user language.>

## Target user
<specific persona — role, context, scale. Not "small businesses".>

## Proposed solution
<what the product does and the magic moment — one flow proving the concept.>

## Why you
<unfair advantage — one clear sentence plus evidence.>

## Candidates considered
<Step 3 table, preserved verbatim — useful if the founder revisits later.>

## Risky assumptions
<top 3 — what must be true. What the founder should validate next.>

## Next step
Run the `opportunity-scorecard` skill to stress-test this, then spawn `opportunity-critic` for a blind verdict before moving to `prd`.
```

**Always preserve** the `## Candidates considered` section verbatim across edits. It is the record of the reasoning behind the chosen idea.

## After saving

Surface the saved path and the two-line recommendation:

- **Next:** run `opportunity-scorecard` to grade the sharpened idea on six axes (pain · buyer clarity · urgency · differentiation · speed to validate · founder advantage).
- **Then:** spawn `opportunity-critic` for a blind verdict. If **Strong**, hand to the `prd` skill — discovery becomes the PRD's problem section. If **Pivot**, re-enter at Step 4 with the suggested direction. If **Weak**, more discovery before any PRD.

Do NOT call the `prd` skill directly from this skill — the opportunity-critic's verdict gates the move from discovery to PRD.

## Don't

- Don't batch questions. One at a time.
- Don't offer suggestions before Q3 — the founder's unprompted words are the input.
- Don't generalize the founder's language ("invoice reconciliation" stays "invoice reconciliation").
- Don't invent ideas unrelated to the inputs. If you can't ground a candidate in something the founder said, drop it.
- Don't drop into the `prd` skill mid-discovery. Discovery is the upstream artifact; PRD is downstream of a Strong verdict.
- Don't pad the candidate count to hit five — three grounded candidates beat five mediocre ones.
