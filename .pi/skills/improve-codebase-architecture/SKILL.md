---
description: Engineer skill. Find deepening opportunities in a codebase — refactors that turn shallow modules into deep ones for testability and AI-navigability. Informed by the project glossary in `project.md` and existing ADRs. Use when the user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or asks for an architecture review. Adapted from Matt Pocock's skills repo to read this project's `project.md`-based glossary and per-project `adr/` folder.
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point — don't drift into "component," "service," "API," or "boundary." Full definitions in [LANGUAGE.md](LANGUAGE.md).

- **Module** — anything with an interface and an implementation (function, class, package, slice).
- **Interface** — everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature.
- **Implementation** — the code inside.
- **Depth** — leverage at the interface: a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place. (Use this, not "boundary.")
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place.

Key principles (see [LANGUAGE.md](LANGUAGE.md) for the full list):

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

This skill is _informed_ by the project's domain model. The domain language gives names to good seams; ADRs record decisions the skill should not re-litigate.

## Where the domain docs live (option-3 hybrid)

- **Project glossary**: `## Glossary` section inside `<vault>/projects/<slug>/project.md`. Read this before exploring — it's where the domain nouns are named.
- **ADRs**: one file per decision under `<vault>/projects/<slug>/adr/`. Read every file in this folder, oldest first, before generating candidates. ADRs constrain what's on the table.

There is **no `CONTEXT.md`** and **no `docs/adr/`** in this project. Do not create them.

## Process

### 1. Identify the project

Cross-reference `<vault>/projects/INDEX.md`. If the user named a project, jump to `<vault>/projects/<slug>/project.md`. If you can't infer the project, ask once — it determines where any new ADR or archived report lands.

### 2. Read the docs first

- `<vault>/projects/<slug>/project.md` — read end-to-end, especially `## Glossary` and `## Key decisions`
- `<vault>/projects/<slug>/adr/*.md` — read all ADRs in the area you're touching

If the project has no glossary section yet, that's a signal: the architectural language hasn't been pinned down. You can still proceed, but flag in the report that the project would benefit from a glossary pass via `grill-with-docs`.

### 3. Explore the code

Use whatever code-exploration tools are available. **In this project, prefer CodeGraph** (`codegraph_context`, `codegraph_explore`, `codegraph_callers`, `codegraph_callees`, `codegraph_impact`) for structural questions — it's a tree-sitter-parsed AST index, sub-millisecond reads, exactly the right tool for "what calls what / where are the shallow modules." Fall back to `grep`/`glob`/`read` only for literal-text questions or when CodeGraph isn't initialised.

Don't follow rigid heuristics — explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 4. Present candidates as an HTML report

Write a self-contained HTML file to the OS temp directory so nothing lands in the repo unsanctioned. Resolve the temp dir from `$TMPDIR`, falling back to `/tmp` (or `%TEMP%` on Windows), and write to `<tmpdir>/architecture-review-<timestamp>.html` so each run gets a fresh file. Open it for the user — `open <path>` on macOS — and tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams where a graph/flow/sequence reliably communicates the structure. Mix Mermaid with hand-crafted CSS/SVG visuals — use Mermaid when relationships are graph-shaped (call graphs, dependencies, sequences), and hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.

For each candidate, the same template as before, but rendered as a card:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram** — side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Recommendation strength** — one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why.

**Use the project glossary vocabulary for the domain, and [LANGUAGE.md](LANGUAGE.md) vocabulary for the architecture.** If `project.md`'s glossary defines "Order," talk about "the Order intake module" — not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts [[adr/0007-postgres-write-model]] — but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

Do NOT propose interfaces yet. After the file is written, ask the user: *"Which of these would you like to explore?"*

### 5. Archive (optional, surface to user)

The temp HTML is the primary deliverable — visual, throwaway, designed for one-time review. If the user wants the findings to persist in the vault:

1. Author a markdown summary (one candidate per heading, no diagrams, glossary terms intact) and route it through `note-taker` to `projects/<slug>/architecture-reviews/<YYYY-MM-DD>.md`.
2. Optionally follow up with `render-html` for a shareable URL on the local Nextra server.

Skip this step by default — propose it only if the user signals they want a durable artifact (*"save this", "send this to me", "archive the findings"*). The HTML temp file is enough for a one-time review.

### 6. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in the project glossary?** Add the term to `## Glossary` in `project.md` — same discipline as `grill-with-docs` (see `grill-with-docs/GLOSSARY-FORMAT.md`). Use the `edit` tool directly on `project.md`; bump its `updated:` field.
- **Sharpening a fuzzy term during the conversation?** Update the glossary right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing — skip ephemeral reasons (*"not worth it right now"*) and self-evident ones. Route the ADR through `note-taker` to `projects/<slug>/adr/`. See `grill-with-docs/ADR-FORMAT.md` for the format.
- **Want to explore alternative interfaces for the deepened module?** See [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md).

## Caller notes

- **Engineer subagent**: spawn this skill on a review card with `sub_persona: review-artifact` or as a dedicated `sub_persona: improve-architecture` card. Surfacing the HTML temp file path in the card outcome is fine — the PM and user read the card.
- **PM persona**: don't run this inline. Create an engineer card and let the subagent execute. The engineer is on Sonnet and reads code more reliably.

## Source

Adapted from [mattpocock/skills](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md). Three changes vs Matt's version:

1. **Glossary source**: `CONTEXT.md` (Matt) → `## Glossary` section of `<vault>/projects/<slug>/project.md` (this project).
2. **ADR source**: `docs/adr/` (Matt) → `<vault>/projects/<slug>/adr/` (this project).
3. **Code exploration**: added explicit preference for CodeGraph MCP tools where available — this project has a CodeGraph index, and structural questions should hit it before grep.

The HTML-report flow (Tailwind + Mermaid editorial layout in `$TMPDIR`) is preserved verbatim — it's the part of the skill that Matt's `render-html` equivalent doesn't replicate, and forcing it through the project's Nextra renderer would flatten the editorial design. The optional vault archive in step 5 is the bridge for users who want findings to persist.
