---
description: Persist short markdown notes to the Obsidian vault — captured ideas, journal entries, meeting notes, one-liners. For long-form artifacts (PRDs, reports, lessons, summaries with multiple sections) use the `document` skill, which produces self-contained HTML. Agents must not write to the vault directly.
---

# Note-taker

Use this skill for **short markdown captures** that belong in the vault — captured ideas, meeting notes, trade journal entries, single-paragraph summaries, anything sub-200-words and unstructured.

For longer artifacts (PRDs, design docs, reports, lesson plans, exec briefs, anything multi-section) — use the **`document`** skill instead. That skill produces self-contained HTML and returns a `file://` URL, which is the project default for any non-trivial document.

> Rule of thumb: if you would normally write a multi-section markdown doc with H2 headings, you want `document`, not `note-taker`.

`note-taker` and `document` are the **only** ways agents should write to the vault. Do not call `write_note` directly. Centralizing through these skills keeps folder structure, format, and conventions consistent.

## When to call

- User says "save this", "note this down", "remember this"
- A Layer 2 agent finishes a meaningful artifact (PRD draft, trade entry, curriculum outline)
- Periodic snapshots of long-running state (Trader's pattern hypotheses, Language's SRS queue)

## Inputs

```
note-taker.save({
  title: "<short noun phrase>",
  body: "<markdown content>",
  folder: "inbox" | "trades" | "pm" | "engineering" | "learning" | "language" | "meta" | <free path>,
  tags: ["<tag>", ...],          // optional
  links: ["<existing-note-title>", ...],  // optional — wiki-link to other notes
  source_agent: "<agent name>"   // optional — which agent generated this
})
```

If `folder` is omitted, default to `inbox`. Files are written as `<folder>/<YYYY-MM-DD>-<slugified-title>.md`.

## Frontmatter convention

Every note gets:

```yaml
---
title: <title>
created: <ISO timestamp>
source_agent: <agent>
tags: [<tags>]
---
```

## Steps

1. Validate inputs (title required; body required).
2. Generate a slug from the title and resolve the target path.
3. Build frontmatter from inputs.
4. Call the `obsidian-vault` extension's `write_note` tool with the assembled markdown.
5. Return `{ path, title }` to the caller.

## Don't

- Don't dedupe automatically — let the user resolve duplicates manually.
- Don't summarize the body before writing. Write what you were given.
- Don't infer tags or folder unless explicitly asked. If unclear, default to `inbox` and surface a follow-up question.