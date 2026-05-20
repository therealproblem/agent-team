---
description: Layer 3 shared skill — opens a vault markdown file in a tmux side pane using `leaf` (TUI markdown viewer). This is the DEFAULT display surface for any vault markdown the agent wants the user to read. Call AFTER `note-taker` has saved the file, on every reply that surfaces a vault markdown path the user is meant to open. The Pi session always runs inside tmux (enforced by the `tmux-host` extension), so the split-pane is reliably available; on the rare headless paths (`--no-session`, cron) the tool returns a silent no-op and the agent's reply still names the file path. When `show-md` opens (`opened: true`), the chat reply collapses to a one-line pointer — no body summary, no recap of the file's contents — because the user is already reading them in the side pane. Use alongside (not instead of) `render-html` and `export` when those are also warranted; the three display surfaces are orthogonal (terminal vs web vs PDF).
---

# Show-md

`show-md` is the **markdown → tmux side pane** skill. It calls `leaf` on a saved vault markdown file in a tmux split, so the user can read the file next to the Pi pane without leaving the terminal.

> If the agent's reply names a vault markdown path the user is meant to open, **`show-md` runs automatically** and the chat reply collapses to a one-line pointer: the path plus at most one sentence of context (e.g. "what to do next" or a question for the user). Do **not** also paste the file's tables, lists, headings, key-points, or "active recall" questions back into chat — leaf is already rendering them in the side pane, and duplicating the body turns one screen of content into two. The side pane is the visible signal.

## Why this skill exists

The vault is markdown. The user reads markdown in three contexts:

| Surface | Skill | Shape |
|---|---|---|
| Terminal, next to Pi | `show-md` (this skill) | tmux split-pane, `leaf` renderer |
| Web browser | `render-html` | Nextra HTML at `/v/<slug>` on `:8080` |
| PDF (printable / sendable) | `export` | Kami-styled PDF at `/p/<slug>-<epoch>.pdf` |

`show-md` is the **default** because the terminal is where Pi lives. `render-html` and `export` are opt-in derivatives for richer reads or sendable deliverables. The three are independent — a persona may call any combination.

## When to call

**Call `show-md` whenever** the agent's reply names a vault markdown file the user is meant to open and read. Examples:

- `note-taker` just saved a draft → call `show-md(md_path)` so the user reads what was written.
- The agent references an existing vault note in its reply ("see `pm/prd/2026-05-17-foo.md`") → call `show-md` on it.
- The user asks "show me that PRD again" → call `show-md` directly on the existing file.

**Don't call `show-md` for:**

- Agent-to-agent output (sub-session hand-offs, reviewer input — no human reader).
- Headless invocations (`--no-session`, cron, CI) — the tool detects `$TMUX` is unset and silently no-ops, but the agent shouldn't bother calling.
- Replies that don't reference a markdown file (general chat, error messages, status updates).
- Files that aren't markdown (PDFs, HTML — those have their own surfaces).
- Replies where the user explicitly asked for the *web* render or the PDF *instead of* a terminal read. (`show-md` is additive, but if the user asked specifically for one surface, don't open the others.)

**Always call AFTER** `note-taker` has saved the file. The skill reads the file from disk — calling before save is a no-op (`not_found`).

## Inputs

```
show_md({
  md_path: "<vault-relative path>" | "<absolute path>",  // required
})
```

Vault-relative paths resolve against `$AGENTS_TEAM_VAULT_PATH` (or `<repo>/vault` if unset). Absolute paths pass through.

## Returns

```
{
  opened:   true | false,
  path?:    "<absolute path that was opened>",
  focused?: true,                              // new pane gets focus on open
  reason?:  "not_in_tmux" | "not_found" | "tmux_error",
}
```

When `opened: true`, the chat reply collapses to one line — the path plus at most one sentence of context. **Drop the body recap** (tables, bullet lists, headings, "key points", "active recall" Q&A) — leaf is already rendering all of that in the side pane. When `opened: false` (`not_in_tmux` / `not_found` / `tmux_error`), fall back to the agent's normal reply, which may include a short summary so the user has *something* to read.

## Pane behaviour

- **The new pane gets focus.** tmux switches the active pane to the leaf viewer the moment it opens — the user's next keystrokes go to leaf, not Pi. This is intentional: the user just asked to read; let them read without an extra hop.
- **Closing the pane.** `q` exits `leaf` (which closes the pane because the command ended). `Ctrl-b x` kills the pane regardless of leaf state (with a y/n confirm).
- **Switching back to Pi without closing.** `Ctrl-b o` cycles to the next pane (i.e. back to Pi). `Ctrl-b ;` toggles between the last two panes.

The tool result message includes a one-line reminder of these shortcuts — the agent should not repeat them in chat.

## Steps

1. **Confirm the file exists in the vault.** If `note-taker` just ran, this is already true. If the agent is referencing an existing file, trust the path — `show_md` checks `existsSync` and returns `not_found` cleanly if wrong.
2. **Call `show_md({ md_path })`.** One call. No retries on `not_in_tmux` — that's the headless path, the silent no-op is the correct behavior.
3. **Shrink the chat reply to one line.** Path + at most one sentence of context (a follow-up question, a next step, "want me to also render this as HTML?"). Don't restate what's already on screen in leaf.

## Don't

- **Don't recap the file's body in chat when `opened: true`.** No tables, no bullet lists of "key points", no "active recall" question rehash, no headings repeated as a chat outline. The user is reading the file in leaf in real time — pasting the same content into chat means they have to read it twice and scroll past a wall of duplicate text to get to anything new. Save chat for what *isn't* in the file: the next question, the next step, the choice you need from them.
- **Don't narrate the pane-open.** The visible pane is the signal. Lines like "Opening in side pane…" or "I've opened the file for you" are noise — the user can see the pane.
- **Don't retry on `not_in_tmux`.** That's the headless path; the tool is correctly silent. The agent's normal reply (which names the path) is sufficient.
- **Don't call for files outside the vault** as a default. The skill accepts absolute paths for flexibility (e.g. user asks to view a one-off file), but the trigger rule is *vault* markdown.
- **Don't call before `note-taker` finishes.** Save first, then show.
- **Don't substitute `show-md` for `render-html` / `export`.** They are independent surfaces. If a rich web read is warranted, call both `render-html` *and* `show-md`. Same for `export` if the artifact is a sendable deliverable.
- **Don't call from a reviewer / sub-session.** Agent-to-agent output isn't read by the user in real time; the side pane would dangle without an audience.
