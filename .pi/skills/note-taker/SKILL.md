---
description: Persist notes to the Obsidian vault. Call when something is worth saving — PRD, trade journal entry, lesson, meeting notes, captured idea. Centralizes folder structure and frontmatter conventions; agents must not write to the vault directly.
---

# Note-taker

Use this skill whenever something is worth persisting to the Obsidian vault — captured ideas, meeting notes, trade journal entries, lesson summaries, research findings, or anything an agent or user wants to save for later retrieval.

This is the **only** way agents should write to the vault. Do not write directly to the vault path. Centralizing through this skill keeps folder structure, frontmatter, and link conventions consistent.

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