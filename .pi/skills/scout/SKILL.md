---
name: scout
description: "Find files / symbols / strings across repo + vault + .pi/state. Delegates to a cheap-model sub-agent so the hunt doesn't bloat root context or burn root-model tokens. Returns paths + short previews — never full bodies."
---

# scout — Layer 3 file finder

Use when you need to **locate** something on disk and don't already know the path:

- "Where is the PRD for X?"
- "Which extension registers tool Y?"
- "Has anyone mentioned Z anywhere in the vault?"
- "List all reviewers under `.pi/agents/`."

## Why it exists (and why it's a sub-agent)

File-hunting is high-token, low-reasoning work — exactly the kind of task you don't want eating root-session context or root-model cost. Scout runs in an **isolated sub-Pi process** on `openai/gpt-5-mini` (Pi's `ELICE_GPT_5_MINI` provider). Benefits:

- The "ls 50 dirs, grep 30 files, return 3 matches" exploration noise stays out of the root session.
- The cost stays cheap even on broad searches.
- Skill discoverability (Layer 3) without the inline-model lock-in.

## How to call

Via the `subagent` tool:

```
subagent({ agent: "scout", task: "<one-line search request>" })
```

Good task strings:

- `"Find any vault note tagged #threat-model or mentioning STRIDE"`
- `"Locate the extension that registers write_html_render"`
- `"List markdown files under .pi/state/profiles"`
- `"Where is the engineer subagent defined and which tools does it allow?"`

Bad — don't ask scout to **judge** or **summarize**:

- ❌ `"Which file should I edit to add a new tool?"` — that's reasoning, scout doesn't reason.
- ❌ `"What does the news-ingest extension do?"` — that's reading + synthesis, do it yourself after scout returns the path.

## What you get back

A JSON array of `{ path, line?, preview }` entries, most-relevant first, capped at 20. Paths are repo-relative. The caller (you) is responsible for `read`-ing the chosen match.

Example:

```json
[
  { "path": "vault/prd/2026-04-12-x-feature.md", "preview": "# X Feature PRD" },
  { "path": ".pi/extensions/obsidian-vault/index.ts", "line": 42, "preview": "pi.registerTool(write_html_render, ...)" }
]
```

## When NOT to use scout

- You already know the path → call `read` directly.
- You need to search the **live web** → that's `research`.
- You need today's **news items** → `news-ingest.query_today` / `get_item`.
- You need to **modify** files based on a search → use scout to find paths, then handle edits yourself. Scout is read-only by design.
