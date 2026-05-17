---
description: PM collaborative skill. Use when authoring product content — landing pages, feature pages, docs, onboarding, marketing copy — and deciding the voice / register / reading level for each page given the target audience. Produces a per-page content plan + draft copy. Distinct from `scribe` (which only rephrases given prose) and from `content` (which authors lesson bodies for the educator persona).
disable-model-invocation: true
---

# Copywriter

Use when a product has multiple pages or content surfaces and you need to decide **what each page says**, **how it says it**, and **in what voice** — given the target audience and the page's job in the user's journey.

You author. You do not just rephrase. (For rephrasing, use `scribe` after a draft exists.)

## When to call

- A new product needs a landing page + feature pages + docs + onboarding — voice must stay coherent across them while each page does a different job
- A product is rebranding and the entire copy stack needs to be re-pitched to a new audience
- A PM needs a content plan before handing pages to the engineer to implement

## Inputs the caller provides

- **Product brief:** what it is, who it's for, the promise
- **Audience profile:** primary audience, secondary audience (if any), their context of use, their existing vocabulary
- **Page inventory:** which pages exist (landing, features, pricing, docs, get-started, etc.)
- **Design.md** (optional but ideal): so voice aligns with the visual register the `uiux` skill picked
- **Constraints:** banned words/phrases, required claims, regulatory disclaimers, brand voice doc if one exists

If any of these are missing, name them in the response before authoring. Don't guess at audience.

## Step 1 — Voice & tone guide

Decide a single voice for the product, then describe it concretely. Vague voice descriptions ("friendly", "professional") are useless to the engineer — pin it to mechanics.

```markdown
## Voice

- **Register:** <plain · technical · editorial · conversational · authoritative · aspirational>
- **Reading level:** <Flesch grade level target, e.g. "grade 8"> — informs sentence length and vocabulary
- **Sentence length:** <avg target, e.g. "12–18 words; vary deliberately">
- **Pronouns:** <"we" / "you" / "the product" — decide and stick to it>
- **Contractions:** <yes / no>
- **Jargon policy:** <which technical terms are allowed unglossed, which need a one-line gloss on first use, which are banned>
- **Humor:** <none / dry / playful — and where it is and isn't allowed>
- **Sales register:** <where on the informational ↔ persuasive axis the copy sits>

## Avoid

- <specific words or phrasings — e.g. "leverage", "seamless", "world-class", "revolutionize", "delight", em-dashes if the brand bans them>
- <hedges that erode trust — "we believe", "we think", "we feel">
- <unsupported superlatives — "the best", "the only", "the fastest" without a citation>
```

## Step 2 — Per-page content plan

For each page in the inventory, produce one block:

```markdown
### <Page name> — <URL slug>

**Job:** <one sentence — what the user is trying to do, or what we're trying to get them to do, on this page>

**Audience moment:** <where in the journey they are — first-touch, evaluating, onboarding, troubleshooting, returning>

**Language type for this page:**
- **Register lean:** <informational | persuasive | instructional | reassuring | aspirational> — pick the dominant one
- **Why this register:** <one line tying the choice to the audience moment>
- **Density:** <skim-first (heavy headings, short paragraphs) | depth-first (longer prose) | reference (tables, lookups)>
- **Tone modifier vs. the global voice:** <e.g. "slightly more playful than docs"; "more reassuring than landing">

**Outline:**
1. <H2 or section> — <what it does for the user>
2. …

**Must include:** <claims, CTAs, regulatory text, links — the things that cannot be missing>

**Must not include:** <stale claims, internal codenames, competitive call-outs the brand bans>
```

## Step 3 — Draft copy

After the plan is approved (or if the caller asked for copy directly), author each page following its plan. Draft conventions:

- **Headings carry the message.** A skimmer reading only the H2s should still get the page's argument.
- **Lead with the user's outcome, not the product's mechanism.** Mechanism follows once the outcome has earned the reader's attention.
- **Verbs > nouns.** "Ship faster" beats "acceleration of shipping velocity."
- **Specifics > abstractions.** "Deploys in 12 seconds" beats "fast deploys." If you can't be specific, say nothing.
- **Cut every word the sentence still works without.** Re-read each paragraph and remove one word per sentence on principle.
- **One idea per paragraph.** If a paragraph has two ideas, it has two paragraphs.
- **CTAs are verbs.** "Start free", "See the demo", "Read the docs" — not "Learn more."

## Register palette (pick one per page in Step 2)

| Register | Use for | Mechanics |
|---|---|---|
| **Informational** | Docs, references, status, changelogs | Neutral verbs, no second-person, no hype, tables and lists welcome |
| **Persuasive** | Landing, feature pages, pricing | Outcome-led, second-person, specific claims, CTA every fold |
| **Instructional** | Onboarding, get-started, tutorials | Imperative verbs, numbered steps, "you" sparingly, screenshots referenced |
| **Reassuring** | Pricing FAQs, support, error pages | Plain words, acknowledge concern, name the next action |
| **Authoritative** | Whitepapers, technical deep-dives, architecture | Declarative, citations, no hedging, dense paragraphs OK |
| **Aspirational** | Brand pages, manifestos, hero copy | Short sentences, vivid nouns, restrained adjectives, one idea per line |

A page can lean on one register and borrow from a second — never mix more than two. Three-register pages read as confused.

## Output structure

Return a single markdown document with three top-level sections — `## Voice`, `## Pages` (each page block from Step 2), and `## Drafts` (each page's copy from Step 3, if drafts were requested).

After authoring, the caller (PM) saves this via `note-taker` to `pm/content/` with title `Content — <product slug>`.

## Don't

- **Don't invent product claims.** If the brief doesn't say it, you can't write it. Surface a question instead.
- **Don't author copy without a voice guide.** Without Step 1, every page drifts to its own voice and the product reads inconsistent.
- **Don't write the same register on every page.** A landing-page tone on a docs page is hostile; a docs tone on a landing page is dead.
- **Don't use `scribe` to "polish" your output.** Scribe is for re-targeting an existing draft to a different audience — calling it on your own draft loses the deliberate choices you made in Step 2.
- **Don't ship `Lorem ipsum`, `[TODO]`, or `<your-product>` placeholders.** If a fact is missing, name what's missing in the draft — `[need: paying-customer count as of <date>]` — so the PM can fill it.
