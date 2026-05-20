---
description: Layer 3 shared service — transforms a research-tree of sources + claims into a structured deliverable. Mandates a fixed output shape (TL;DR → supporting points with claim-level citations → contested/uncertain section → "go deeper" → dated). Replaces ad-hoc inline writing by the calling persona. Called as Step 5 of the `research` orchestrator before handoff to `note-taker` and `render-html`. Forbids quote-sandwich output — synthesize closes the sources, drafts in its own words, then re-opens to verify.
---

# Synthesize

The "phase 5" of research — converts {sources + tree + triangulate + steelman} into a structured deliverable. Different from `note-taker` (which saves whatever you hand it). Synthesize *transforms*.

## When to call

- Step 5 of `research` orchestrator, after deep-reads / triangulate / steelman have completed.
- Any time a persona has collected research material and needs to produce a deliverable for the user (not just hand back excerpts).
- Reusable outside the research pipeline — call it any time you have {sources + claims} and need a structured artifact.
- NOT for one-shot answers where the user wanted the agent's read, not a sourced synthesis.

## Inputs

```json
{
  "frame": { "question": "...", "deliverable_shape": "...", "success_criteria": [...] },
  "tree": <research-tree JSON, root + branches>,
  "sources": [{ "url": "...", "title": "...", "key_excerpts": [...], "type": "primary|secondary|tertiary", "date": "ISO" }],
  "triangulate_results": [<from triangulate skill>] | null,
  "steelman_result": <from steelman agent> | null
}
```

## Output — mandated shape

A **markdown body** (no frontmatter — `note-taker` adds frontmatter and title separately). Body sections start at `##` per the project's vault conventions (no body H1).

```markdown
**TL;DR:** <one sentence answer.>

<2–5 supporting paragraphs / sections. Every non-trivial claim ends with [^n]-style inline citation tying back to a source.>

## What's contested / uncertain

<Required section. If everything is settled consensus, say so explicitly: "Nothing in this synthesis is contested as of <date>." Otherwise list disagreements, version-dependencies, scope limits, gaps in the evidence.>

<If steelman returned credible_opposition or conclusion_unsafe, surface it here — not in a footnote.>

## Go deeper

<1–2 best sources for the next layer of depth. One sentence each on why.>

<If the tree has paused / abandoned branches, mention them here so the user can decide whether to spawn follow-up research.>

---
*Synthesized <ISO date>. Sources fetched between <earliest> and <latest>. Tree depth: <max depth from research-tree>.*

[^1]: <Source title> — <url> · <author / org> · <date>
[^2]: ...
```

## Steps

1. **Read the frame.** The `deliverable_shape` and `success_criteria` are the contract. The output must satisfy them.
2. **Read the tree, not just the leaves.** Prerequisite branches go into the body as "background you need to know" *before* the main answer if they're load-bearing. Sibling branches go into a comparison section if `deliverable_shape: comparison`, otherwise as a "you might also want" pointer.
3. **Close the sources. Draft from memory.** Write the synthesis without re-reading. This forces actual understanding instead of stitched quotes. Then re-open the sources and verify every claim.
4. **Claim-level citations.** Every non-trivial assertion gets a `[^n]` footnote. Not URL-dumps at the end. If a claim has multiple supporting sources, cite the strongest one and mention the corroboration count inline ("widely reported [^3], with three independent re-reports").
5. **Mandatory "what's contested" section.** Even if the answer is settled. Honest research has this section; advocacy doesn't.
6. **Include date + tree depth.** The footer matters — state-of-the-art rots, and tree depth signals how much branching happened during the run.
7. **Surface unresolved branches.** If the tree has any `status: paused` or `status: abandoned` branches, mention them at the end of "Go deeper" so the user can decide whether to spawn follow-up research.
8. **Return the markdown body.** Caller hands it to `note-taker`.

## Shape-specific overrides

| Shape | TL;DR style | Body emphasis | Extra section |
|---|---|---|---|
| `summary` | The answer | 2–3 paragraphs, no comparison tables | none |
| `comparison` | "X vs Y: <one-line verdict>" | Side-by-side table + per-axis paragraphs | "When to pick each" |
| `how-to` | "How to X in N steps" | Numbered steps; prereqs called out at top | "Common gotchas" |
| `timeline` | "<Subject> evolved from A to B over <span>" | Chronological, dated section per era | "What changed each turning point" |
| `decision` | The recommendation | Recommendation, conditions, what could reverse it | "Failure modes" (mandatory) |
| `fact-check` | The verdict | Verdict; supporting/contradicting per source class | "Confidence" + "Caveats" |
| `landscape-map` | "The field of X in 2026" | Vocabulary, schools, voices, recency — straight from `research-survey` enriched by deep reads | "Open questions in the field" |

## Style rules

- **Plain language.** Terms-of-art only after defining them inline (use the vocabulary table from `research-survey`).
- **Active voice.** "The library deprecated X in v3" not "X was deprecated by the library in v3."
- **Hedge accurately.** "Confirmed by ≥2 independent primaries" beats "widely reported." "One source claims" beats "people say."
- **Dates everywhere.** Every source citation has a date. The synthesis has a date. "Recent" without a date is a smell.

## Don't

- **Don't quote-sandwich.** A paragraph that's three quotes in a row separated by "and" / "moreover" isn't synthesis. Close the sources, write in your own words, then verify.
- **Don't bury the steelman.** If `steelman_result` returned credible opposition, it goes in "What's contested" prominently, not in a footnote.
- **Don't fabricate claims.** Every assertion must trace to a source in the input. If you can't, drop the claim or surface as an open question in "What's contested."
- **Don't pad with caveats to sound balanced.** Caveats are useful when real, noise when manufactured.
- **Don't include the research process** ("I searched for X, then fetched Y…"). The deliverable is the answer, not the diary.
- **Don't write a body H1.** The title is in note-taker's frontmatter. Body starts at the TL;DR line.
- **Don't add frontmatter.** That's `note-taker`'s job. You return the body only.
