---
description: Synthesize across .pi/state/profiles/ to surface stable patterns, contradictions, and tacit knowledge across domains. Layer 0 self-knowledge pass; on-demand only.
disable-model-invocation: true
---

# Meta Review

Use this skill when the user wants to step back and look at what the system has learned about them across domains. This is the Layer 0 self-knowledge synthesis pass.

Meta is **not telemetry**. It's a synthesis across the user's per-domain profiles, looking for cross-domain patterns, contradictions, and tacit knowledge that's emerged.

## When to call

- User says "what have you learned about me?", "give me a meta review", "what's in my profiles?"
- User asks for cross-domain pattern analysis ("how do I show up in trading vs. engineering?")
- Periodic check-in (weekly, monthly) — surface the user's evolving model of themselves
- Before a major decision or workflow change — surface relevant tacit knowledge

## Inputs

- All files in `.pi/state/profiles/` — `_global.md`, `engineering.md`, `product.md`, `trading.md`, `learning.md`, `language.md`

## Steps

1. **Read every profile file.** Use the `read` tool. Don't skim — every line is the user's evolving self-model.

2. **Surface, in this order:**
   - **What's stable** — preferences and patterns that show up across multiple profiles or have accumulated significant evidence.
   - **What's emerging** — patterns that appear in just one profile but feel like they might generalize. Flag them as "candidate generalizations."
   - **What contradicts** — places where two profiles disagree about the same person (e.g., "decisive in trading, deliberative in engineering"). Don't resolve the contradiction — surface it as a question.
   - **What's empty** — domains with little or no profile content. May indicate dead-code agents, or domains the user hasn't engaged with yet.
   - **Tacit knowledge** — entries marked as such, especially under "Tacit knowledge" sections of trading and learning profiles. These are the highest-value insights.

3. **Format the review** as markdown with these sections:

```markdown
# Meta Review — <YYYY-MM-DD>

## What's stable about you
<Cross-domain patterns. Most-confident observations. Not generic — specific to this user.>

## What's emerging
<Single-domain patterns that might generalize. Phrased as candidate hypotheses.>

## What contradicts
<Places where profiles disagree. Surface as "is X the same person as Y?" — don't resolve.>

## Empty corners
<Domains with no profile signal yet. Possible dead code, possible blind spots.>

## Tacit knowledge surfaced
<Highest-value: what the user has revealed about themselves through observation that they didn't declare upfront.>

## Open questions to take into the next session
<2–4 things worth probing next time. Should be Socratic, not advisory.>
```

4. **End with a single Socratic question to the user.** Like Trader, Meta surfaces patterns *as questions*, not as findings. Pick the most interesting open thread from the review. Example: *"You decompose-then-revise in engineering but jump straight to action when journaling trades — is that intentional or a leak?"*

## Don't

- Don't give advice. Surface patterns; let the user decide what to do.
- Don't average across profiles. Cross-domain inconsistency is itself useful signal.
- Don't propose profile edits as part of this skill — that flow belongs to individual domain agents at session end.
- Don't claim things the profiles don't support. If a profile is empty or thin, say so explicitly.

## Frequency

This skill runs on demand, not automatically. The user invokes it when they want the synthesis.