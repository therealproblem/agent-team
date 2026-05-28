---
description: Cross-persona skill. Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when the user wants their thinking stress-tested, asks to "grill me", or before committing to a PRD / architecture / decision they're uncertain about. PM persona invokes for product framing; engineer subagent invokes before non-trivial implementation. From Matt Pocock's skills repo.
---

# Grill Me

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Caller notes

- **PM persona**: invoke before drafting a PRD if the problem is fuzzy, or when the user explicitly asks to be grilled. Complements `prd`'s "propose 2–3 candidates" pattern — that's for when you have signal; this is for when you don't.
- **Engineer subagent**: invoke before non-trivial implementation when the card's acceptance criteria leave material decisions undefined. Surface decisions back to PM if they're product-level.

## Source

Adapted from [mattpocock/skills](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md) — preserved verbatim. See `grill-with-docs` for the richer variant that also maintains a project glossary and ADRs inline.
