---
description: Cross-persona skill. Tell the agent to zoom out and give broader context or a higher-level perspective on an unfamiliar section of code. Use when entering a new area of the codebase, when a narrow read is missing context, or when a recommendation needs to be situated in the whole system. From Matt Pocock's skills repo.
disable-model-invocation: true
---

# Zoom Out

I don't know this area of code well. Go up a layer of abstraction. Give me a map of all the relevant modules and callers, using the project's domain glossary vocabulary (the `## Glossary` section of `<vault>/projects/<slug>/project.md`, if present).

## Caller notes

- **PM persona**: invoke when reasoning about scope cuts in unfamiliar parts of the codebase, before committing a PRD to engineer.
- **Engineer subagent**: invoke at the start of a card that touches an area you haven't worked in, before drafting acceptance work. Prefer `codegraph_context` if the project has CodeGraph initialized — it does the same job structurally and is faster.

## Source

Adapted from [mattpocock/skills](https://github.com/mattpocock/skills/blob/main/skills/engineering/zoom-out/SKILL.md). Project glossary reference updated to point at this project's `project.md`-based glossary (option-3 hybrid).
