---
description: Layer 3 shared service — persistent todos. Capture via the `reminder_add` tool when the user says "remind me X". Users typically resolve via the `/clear <N>` slash command (handled entirely by the extension, NO agent turn); the `reminder_resolve` tool is a fallback for natural-language resolution like "mark X done". List via `reminder_list`. The `reminders` extension owns the file (`.pi/state/reminders.md`) and surfaces open items at every session start as a numbered list. Do NOT use `read` or `edit` on the file — call the tools.
---

# Reminders

Persistent open-items list. Captured by `reminder_add` when the user says "remind me X". Surfaced at every session start by the `reminders` extension. Resolved by `reminder_resolve` only on explicit user say-so.

**Memory ops are quiet.** Do not think out loud, do not narrate the diff, do not paraphrase the tool result. Call the tool. The tool's own output is the confirmation — no extra prose needed.

This is a distinct memory substrate from profiles and the vault:

- **Profiles** = slow-growth user model, approval-gated, read at persona adoption
- **Vault** = artifacts produced (notes, documents)
- **Reminders** (this) = user-visible open items, fast write, lifecycle ends only on explicit user say-so

## When to invoke

### `reminder_add(text)`

Trigger phrases:
- "remind me to X" / "remind me about Y"
- "don't let me forget Z"
- "I need to remember to ..."
- "add a reminder to ..."

Pass the user's verbatim wording as `text`. **No paraphrasing.** Their phrasing IS the reminder.

### `reminder_resolve(match)`

**The primary user path for resolving a reminder is `/clear <N>`** — a slash command handled directly by the extension with no agent turn. Surface it once if the user describes finishing something but didn't use a number: *"You can clear #2 directly with `/clear 2`."*

Use the `reminder_resolve` tool only when the user resolves *in natural language* (no number) and wants you to act:

Trigger phrases:
- "I did X" / "done with Y" / "finished Z"
- "resolved <item>" / "mark <item> done"
- "<item> is done" / "<item> is resolved"

Pass a distinctive substring of the reminder as `match`. The reminder is **deleted** — no history is kept. If the tool reports multiple matches, ask the user which one (one question) and retry with a more specific substring. Or: point the user at `/clear <N>` and stop.

### `reminder_list()`

Trigger phrases:
- "what are my reminders" / "show my todos" / "what's open"

No parameters. Returns the numbered list directly.

## Output style

After any tool call, **say nothing or one short word.** The tool result is already shown in the TUI — don't restate it.

| Tool result | Your response |
|---|---|
| `Added: <item>` | (nothing, or just `ok.`) |
| `Resolved: <item>` | (nothing, or just `ok.`) |
| List output | (nothing — the list is already visible) |
| Error (no match / multiple matches) | One question to disambiguate, OR point at `/clear <N>` |

`/clear <N>` produces its own TUI message via the extension — you never see it as a tool result and you should not react to it. The user runs that command; the extension handles it; the agent is not in the loop.

## Don't

- **Don't `read` or `edit` `.pi/state/reminders.md` directly.** The extension owns the file format. Always call the tools.
- **Don't auto-resolve.** Inferring "the user must have done this by now" is wrong. Only the user can resolve.
- **Don't paraphrase.** Keep the user's exact wording as the reminder text.
- **Don't dedupe.** Two similar items is the user's choice.
- **Don't narrate.** No thinking, no diff explanation, no summary of what just happened.
- **Don't combine with the profile-update flow.** Reminders aren't profile entries — different lifecycle, different gate.
