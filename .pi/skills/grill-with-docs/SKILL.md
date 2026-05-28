---
description: PM / engineer skill. Grilling session that challenges your plan against the project's existing domain language, sharpens terminology, and updates the project glossary + ADRs inline as decisions crystallise. Use when the user wants to stress-test a plan against the project's documented vocabulary and prior decisions. Adapted from Matt Pocock's skills repo to write into this project's vault structure.
---

# Grill With Docs

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Where the docs live (option-3 hybrid)

This skill is identical to `grill-me` plus inline updates to two artifacts:

| Artifact | Location | Writer |
|---|---|---|
| Domain **glossary** | `## Glossary` section inside `<vault>/projects/<slug>/project.md` | `edit` tool (existing file) |
| **ADRs** (one file per decision) | `<vault>/projects/<slug>/adr/<NNNN>-slug.md` | `note-taker` (new file) |

> Why the split: glossary lives next to project goals / stakeholders / handover so a fresh session reads everything in one file. ADRs are append-only artifacts that each tell one story — keeping them as separate files makes them link-stable from PRDs and cards, and lets the trail accumulate without bloating `project.md`.

There is **no `CONTEXT.md`** in this project. There is **no `docs/adr/`** in this project. Do not create them.

### Multiple contexts

When the project spans several bounded contexts (e.g. an `ordering` and a `billing` slice of one codebase), use `## Glossary — <context>` subheadings inside the same `project.md` rather than spawning multiple files. The per-project structure stays flat. ADR filenames may prefix the context: `0007-billing-postgres-write-model.md`.

If contexts truly want separate glossaries (different teams, different vocabularies, no overlap), split the work into separate **projects** under `<vault>/projects/` — that's the existing primitive for "different bounded contexts."

## Domain awareness

At the start of the session:

1. **Identify the active project.** Cross-reference `<vault>/projects/INDEX.md`. If the user named a project, jump to `<vault>/projects/<slug>/project.md`. If you can't infer the project, ask once before grilling — it determines where every decision lands.
2. **Read `project.md` end-to-end.** Pay particular attention to:
   - `## Glossary` (if present) — the existing vocabulary
   - `## Key decisions` — chronological decision log
   - Sibling `adr/` folder — open and read every ADR file, oldest first, before grilling
3. **Read recent ADRs** in `<vault>/projects/<slug>/adr/`. They're decisions the skill should not re-litigate.

Create files lazily — only when you have something to write. If no `## Glossary` section exists in `project.md`, append one when the first term is resolved. If no `adr/` directory exists, route the first ADR through `note-taker` with folder `projects/<slug>/adr/` and it'll be created.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `project.md`'s glossary, call it out immediately. *"Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"*

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. *"You're saying 'account' — do you mean the Customer or the User? Those are different things."*

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: *"Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"*

### Update the glossary inline

When a term is resolved, update the `## Glossary` section of `project.md` right there — use the `edit` tool directly on the file (it already exists; this isn't a new vault write, so `note-taker` doesn't gate it). Don't batch these up; capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

The glossary should be **totally devoid of implementation details**. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

Bump `project.md`'s `updated:` frontmatter field whenever you edit the glossary.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder *"why did they do it this way?"*
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

When an ADR is warranted, route it through `note-taker` (markdown-only, vault writes go through the sanctioned writer per global rule 2). Folder: `projects/<slug>/adr/`. Filename: `<NNNN>-slug.md` where `NNNN` is the next sequential number — scan the existing `adr/` directory to find the highest current number and increment.

After the ADR file lands, append a one-line entry to `project.md`'s `## Key decisions` log linking to it:

```md
- **YYYY-MM-DD —** Picked Postgres as the write-model store. *Rationale:* see [[adr/0007-postgres-write-model]]
```

## Caller notes

- **PM persona**: use this instead of plain `grill-me` when the project has an established `project.md` and you want the session to deposit durable glossary + ADR entries. Pair with `prd` — grilling refines the problem before drafting.
- **Engineer subagent**: invoke before non-trivial implementation when the card's domain language is ambiguous. ADRs you create become inputs for `improve-codebase-architecture` later.

## Source

Adapted from [mattpocock/skills](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md). Two changes vs Matt's version:

1. **Glossary destination**: `CONTEXT.md` (Matt) → `## Glossary` section of `<vault>/projects/<slug>/project.md` (this project).
2. **ADR destination**: `docs/adr/` (Matt) → `<vault>/projects/<slug>/adr/` (this project, per-project).

Rationale: glossary belongs next to the rest of `project.md` (one orientation file per project); ADRs stay separate so each decision is link-stable and the trail is append-only.
