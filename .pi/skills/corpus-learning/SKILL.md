---
description: Cross-persona inner skill (educator, engineer, pm). Compressed-mastery method for learning a new field/domain from sources. The user assembles a corpus (textbooks + papers + lecture transcripts), then runs THREE specific questions over it to extract the intellectual landscape, then loops through active-recall using Feynman-style explanation. Invoke for "teach me X from scratch", "ramp me up on this field", "I need to master Y in N days", or any new-subject deep-dive. Default learning method for the educator persona.
---

# Corpus learning

A compressed-mastery method built on the observation that **most learners ask the wrong questions of their sources**. Asking "summarize this" or "explain X" produces passive understanding — recognition, not production. The method swaps those for three specific questions that extract the field's mental map, then loops through active recall against discriminator questions.

Adapted from a NotebookLM-centric workflow described publicly in 2026 by an MIT grad student. The tool is replaceable (NotebookLM, Pi `read` over local files, anything); **the questions are the method**.

## When to invoke

- "Teach me X from scratch"
- "I have to master Y in N days/weeks"
- "Ramp me up on this field/framework/domain"
- User is preparing for a qualifying exam, interview, or deep technical conversation on a subject they've never studied
- New job / new project requires fast subject-matter ramp

**Do NOT invoke for**: short topic Q&A, single-concept clarifications (use `feynman` instead for those), or test-prep where the test is multiple-choice fact recall (flashcards beat this method for that).

## Inputs

- **Subject** — name + scope. "What does mastery look like for you in this field?" (Ability to teach it / pass an exam / debate it with practitioners / ship work using it.)
- **Time budget** — total hours available. 48 hours of focused work is the article's reference; adjust.
- **Source plan** — does the user have a corpus already (NotebookLM with sources loaded, a Zotero library, a folder of PDFs)? Or do they need help assembling one?
- **Baseline** — what does the user already know? Avoid covering ground they have.

## The 5 phases

### Phase 1 — Corpus assembly (upfront, before anything else)

Variety beats volume. The recommended composition:

- **4–6 textbooks at varying levels** — one intro (the field for outsiders), one or two standard course textbooks, one or two specialist / advanced
- **10–20 highly-cited papers in the field** — landmark papers, recent landmark reviews, the contentious ones
- **Lecture transcripts / video courses** — MIT OCW, Stanford, university YouTube channels; download transcripts where possible

Three flows for the corpus itself:

1. **External corpus tool** (NotebookLM, Perplexity Spaces, etc.) — user loads sources there; this skill becomes a question-guided tutor while the user queries the tool. You don't read the sources directly; you direct the *user's* querying.
2. **Local files via Pi `read`** — user places sources in a folder (e.g. `vault/learning/<subject>/`); the agent reads them as needed during the active-recall loop to verify the user's answers against the source material.
3. **Web sources via `research` skill** — for sources only available online (landmark papers' preprint pages, lecture course pages, official docs, blog posts). Use `tff-search_web` to discover candidates, `tff-fetch_url` (markdown format) to pull readable text, then either save the pulled markdown into `vault/learning/<subject>/` (becomes flow 2) or quote directly during Phase 5 verification. Stealth fetch bypasses Cloudflare on most academic and tech-vendor pages.

Mix freely — a real corpus often has all three (a textbook on the user's bookshelf, a few PDFs in `vault/`, plus current web pages for the cutting edge). Confirm with the user which mix before proceeding.

### Phase 2 — Mental model extraction (≈1 hour)

The single most important question:

> **"What are the 5 core mental models that every expert in this field shares?"**

Mental models = the deep structures experts internalize after years. The frames they think *with*, not the facts they *know*. Examples:
- In economics: "people respond to incentives", "trade-offs are pervasive", "markets clear via prices"
- In machine learning: "bias-variance trade-off", "you can't learn without inductive bias", "generalization is the goal, not training error"
- In physics: "energy is conserved", "symmetries imply conservation laws", "all forces are interactions between fields"

Surface them, pressure-test them against the corpus, refine until the user can recite all 5 and say in one sentence what each one *predicts*. If the user can't predict with the model, it's not yet internalized.

### Phase 3 — Disagreement map (≈1 hour)

> **"Where do experts in this field fundamentally disagree? For each disagreement: name it, summarize the strongest argument on each side."**

Target 3–5 disagreements. This is where the *live frontier* of the field is. Most students spend a full semester just figuring out which debates even exist. Examples:
- In ML: connectionism vs. symbolic AI; scaling laws as fundamental vs. emergent
- In macro: rational-expectations Keynesianism vs. heterogeneous-agent models
- In physics: many-worlds vs. Copenhagen interpretations

For each: name the debate, the strongest version of each position, the empirical or theoretical evidence each side cites, and what would *settle it* (if anything).

### Phase 4 — Discriminator generation (≈30 minutes)

> **"Generate 10 questions that distinguish someone who deeply understands this subject from someone who just memorized the facts."**

Discriminator questions are the *test*. They can't be answered by surface knowledge — they require the mental models from Phase 2 and awareness of the disagreements from Phase 3. Examples from the article-style framing:
- "Why does X stop working when condition Y holds?" (probes mechanism, not definition)
- "How would you design an experiment to distinguish hypothesis A from B?" (probes methodology)
- "What's the strongest argument against the consensus view, and is it persuasive?" (probes intellectual honesty)

Bad discriminators look like: "What is X?" — recognizable, answerable from memory.

### Phase 5 — Active-recall loop (the bulk — 30–40 hours)

For each of the 10 discriminator questions:

1. **User answers from memory.** No looking at sources. Aim for production, not recognition.
2. **Apply the Feynman test** — explain the answer in plain language, no borrowed jargon, as if teaching a 12-year-old. (See `feynman` skill for the loop.) Where the user stumbles or reaches for technical vocabulary, that's a gap.
3. **For every wrong or shallow answer, the highest-leverage prompt**:
   > "Explain why this is wrong / shallow, and what I'm missing."
4. **Send the user back to the corpus** with that specific gap in mind. Targeted re-reading, not a re-read of the whole textbook.
5. **Re-answer** without the source. Repeat until the answer is correct AND can be Feynman-explained.

The bar for "done" is: **user could hold a 20-minute unscripted conversation with a practitioner and not get destroyed**. They can argue for and against the disagreements. They can predict using the mental models. They can apply the discriminators to a novel problem.

## Output

A knowledge-map document, saved to the vault as markdown via `note-taker` at `learning/corpus-maps/<date>-<subject>.md`. If the map would benefit from an interactive read (Mermaid graph of the field, tabs per mental model, timeline of intellectual history, sidebar TOC for many sections), follow up with `render-html` to publish HTML in `renders/`. Contents:

```
# <Subject> — corpus-learning map

## Scope of mastery
<what "mastery" was defined as for this study>

## Sources (corpus)
- <textbook 1>
- <textbook 2>
- ...

## 5 mental models
1. <model> — <one-sentence prediction>
2. ...

## Disagreements (intellectual landscape)
### <Debate name>
Side A: <position> — strongest argument: <one paragraph>
Side B: <position> — strongest argument: <one paragraph>
What would settle it: <evidence / experiment>

## 10 discriminator questions + final answers
1. Q: <question>
   A: <user's final Feynman-style answer>
2. ...

## Open questions / where I still feel weak
- <gap 1>
- <gap 2>
```

The HTML artifact is the externalized version of the user's mental model. They re-read it as a refresher, hand it to others, or reference it when the same subject comes up in future work.

## Don't

- **Don't start active recall before mental models are in place.** Recall against unfamiliar terrain is just guessing.
- **Don't ask "explain X" or "summarize Y" as substitutes for the three questions.** Those produce passive consumption — the entire failure mode this method is designed to prevent.
- **Don't accept "I got the gist."** The gist is what the user already had before they started. The point is to be able to make and defend claims in the field's own terms.
- **Don't skip corpus diversity.** Six textbooks beats one textbook because no single source has the full mental-model coverage. Different authors emphasize different frames.
- **Don't memorize the disagreements as facts.** Understand the *arguments* well enough that the user could reconstruct each side from scratch.
- **Don't use this for the wrong kind of mastery.** Multiple-choice tests on fact recall — flashcards via the `srs` extension or `assessment-author` skill are more efficient.
- **Don't let Phase 5 become re-reading.** Re-reading is the most popular and least effective study activity. Phase 5 is *production* — explanations from memory, then targeted gap-filling.

## Caller notes

- **Educator**: this is the default method for "teach me a new subject". Other educator skills (`curriculum`, `content`, `assessment-author`) are for *designing materials for someone else* to learn from; corpus-learning is for the user themselves to master a subject.
- **Engineer**: new framework, new language, new infrastructure pattern (Kubernetes from scratch, a database internals deep-dive). The "corpus" is documentation + RFCs + source-code reading + a few books.
- **PM**: ramping up on a new market vertical (fintech, healthtech, infosec) — the "corpus" is market reports, segment-leader product reviews, regulatory documents, industry-veteran writing, conference talks.
