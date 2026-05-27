---
description: Layer 3 shared skill — DISPATCHES rendering of a vault markdown note to an isolated `render-html` subagent so the parent session's context window stays clean. The subagent reads the source, transforms it, plans single vs multipart via `plan_html_render`, writes the `.mdx` file(s) at `<vault>/artifacts/renders/`, verifies they compile, and returns the URL(s). The parent's job is just to decide *whether* to delegate (call/skip rules below), compose the task string, and surface returned URLs to the user. Personas call this AFTER `note-taker` has saved the markdown, and only when an interactive reading experience is worth the work.
---

# Render HTML (dispatcher)

`render-html` is a thin dispatcher. The actual rendering — reading the markdown, picking diagrams, authoring the body, planning the split, writing the `.mdx`, verifying compilation — happens **inside the `render-html` subagent**, with its own context window. The parent session never sees the body or the tool plumbing; it sees only the verified URL(s) the subagent returns.

This isolation is the point: a long curriculum render that would burn 20k tokens of body, diagrams, and tool round-trips in the parent now costs the parent a single subagent call + the returned URL(s).

> Terminal-side reading lives in a different skill: `show-md` opens the vault markdown in a tmux side pane via `leaf`. `show-md` runs by default on every reply that names a vault markdown path; `render-html` is opt-in on top of that when an interactive *web* read is worth the work.

> If you would otherwise paste a multi-section markdown doc inline as the agent's reply, **stop**. Save it via `note-taker` first, then call this skill.

## When to call

**Call `render-html` when** the markdown would meaningfully benefit from renderer patterns (diagrams, tabs, callouts, timelines, sparklines, configurators). The subagent will skip and tell you so if the source genuinely doesn't warrant a render.

**Don't call `render-html` for:**
- Inbox captures, journal entries, trade entries, meeting notes — short, no structure, no audience.
- ADRs / PRDs whose primary read path is git PR review — the diff IS the read.
- Anything agent-to-agent (sub-session output, prompt context, hand-offs) — markdown is leaner.
- Output the user will read in the terminal — HTML is unreadable there.
- 50-word replies — they don't deserve a styled page.

**Always call `render-html` after** `note-taker` (not before). The vault markdown path is the input.

## Targeted chart edits — skip the subagent

Every rendered Mermaid block carries a 1-based `Chart N` caption (numbering resets per part on multipart). When the user references a chart by number — *"render chart 3 as a table"*, *"swap part 2 chart 1 for a bullet list"* — **do not redispatch to the subagent**. The fix is local:

1. Locate the Nth fenced ```mermaid``` block in the vault source `.md`.
2. Make the same swap in the corresponding `.mdx` under `<vault>/artifacts/renders/`. For multipart, find the part's slug from the user's reference ("part 2") and edit only that file. Single-page renders have one `.mdx` to edit.
3. Replace both with the requested alternative (GFM table, bullet list, prose, etc.). Apply the same content transform to both files so they stay in sync.
4. No re-dispatch, no replan, no re-verify. `/v/[slug]` is `force-dynamic` — the next page load picks up the change. Tell the user the chart was swapped and the existing URL still works.

This shortcut is *only* for targeted swaps of an individual chart (or other in-place fixups like a typo). If the request reshapes the document — new sections, new diagrams, restructured headings — go back through the subagent so the planner can decide single vs multipart again.

## How to dispatch

Call the `subagent` tool with `agent: "render-html"`. The task is natural language; include:

- **Required:** the vault-relative path of the source markdown.
- **Optional:** a title override (if the URL slug should differ from the frontmatter title), a patterns hint (`mermaid`, `tabs`, `timeline`, …), an intent ("for sharing externally", "exec brief", "scannable").

```
subagent({
  agent: "render-html",
  task: "Render the vault note at pm/prd/2026-05-15-foo.md as an HTML page. Audience: external stakeholders; reach for diagrams over prose."
})
```

The subagent process loads its own system prompt — you don't need to repeat authoring rules, diagram patterns, or tool contracts in the task. Keep the task focused on inputs and intent.

`agentScope` defaults to `"user"` in the `subagent` tool; the `render-html` agent lives in `.pi/agents/`, so pass `agentScope: "both"` (or `"project"`) when you call.

## What you get back

The subagent's final output is the user-facing reply. Surface it to the user verbatim — don't paraphrase, summarize, or expand.

**Single-page:**

```
Open: <url>
Source: vault/.../file.md
```

**Multi-part:**

```
Open:
- Part 1 — <title>: <url>
- Part 2 — <title>: <url>
- ...
Source: vault/.../file.md
```

The subagent also surfaces each URL into the TUI as soon as it's verified (boxed `render-html` status message), so the user sees URLs trickle in even while the subagent is still running.

## Errors from the subagent

If the subagent returns an error message instead of a URL block, it's one of:

- **"The source at … doesn't warrant an HTML render"** — the markdown is mostly prose with no diagrammable structure. Tell the user; do not retry.
- **"Next.js dev server not reachable"** — the local server is down. Tell the user once; don't retry until they confirm it's up.
- **"Render verification failed: <reason>"** — MDX compile error. The subagent already tried to fix; this means it couldn't. Surface the reason to the user and ask whether to debug the source.

In every error case, the parent's role is to surface the message — not to silently retry or paper over.

## Don't

- **Don't author the markdown body yourself.** That's the subagent's job. If you find yourself drafting Mermaid blocks or callouts in the parent session, stop and dispatch.
- **Don't paste the rendered body inline** in the chat reply. The URL is the deliverable.
- **Don't list multiple render URLs proactively.** Each render is shared deliberately in direct response to a specific request.
- **Don't include cloudflared / tunnel suggestions** in your reply. The URL stands alone.
- **Don't auto-render.** Personas (or the user) explicitly trigger this skill. There's no global "save and render" hook.
- **Don't call `plan_html_render`, `write_html_render`, or `write_html_render_multipart` directly** from the parent. Those tools are the subagent's; using them in the parent defeats the token-isolation purpose.
- **Don't append a "Source:" footer or any provenance line to the rendered artifact.** Source path belongs in the chat reply only — the subagent already follows this rule.
