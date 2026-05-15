---
description: Meta-skill for adding new agent components to this repo — a new persona (top-level skill), an inner skill under an existing persona, an isolated reviewer (subagent), or a tool extension. Use when the user says "add a persona", "create a new skill", "scaffold a sub-skill", "wire up a new tool / extension", "make a new reviewer", or anything shaped like extending the agents-team itself. Produces the right files in the right places with conformant frontmatter, profile-loading blocks, profile-update sections, and AGENTS.md / SYSTEM.md cross-references so the new component is discoverable by Pi on next session start.
---

# Persona-creator

You are scaffolding a new piece of the agents-team itself. The repo has four extension points; this skill walks you through producing each one with the conventions intact, then patching the cross-reference tables so Pi auto-discovers it.

> Before writing files, **read `AGENTS.md`** (project root) and **`.pi/SYSTEM.md`**. They define the architecture you are extending. Don't trust this skill's summary — read the source. The architecture has changed before and will change again.

## The four extension points

| Type | Location | Loaded as | When to pick this |
|---|---|---|---|
| **Persona** | `.pi/skills/<name>/SKILL.md` | Inline — root session reads it and adopts | A new top-level domain (peer of pm/engineer/educator/language/trader). Owns a chunk of the user's life. |
| **Inner skill** | `.pi/skills/<name>/SKILL.md` | Inline — called by a persona during a turn | A specialised capability used by exactly one persona (e.g. `prd` for pm, `kanji` for language) or a Layer 3 shared service (callable by every persona, e.g. `note-taker`, `research`). |
| **Reviewer** | `.pi/agents/<name>.md` | Sub-session — spawned via `subagent` extension | Blind review where the implementer's reasoning would bias the verdict (e.g. `prd-critic`, `red-team`, `uat-tester`). Same file structure as Pi project agents. |
| **Tool extension** | `.pi/extensions/<name>/` | TypeScript module — `defineTool` + `pi.registerTool` or event subscribers | A new tool surface (vault writes, web fetches, persistence). **Build only when no existing extension / npm package provides it** — see AGENTS.md "Implementation workflow rule". |

The specialization rule (from AGENTS.md): **sub-session when contamination would corrupt the output; inline when shared context aids the work.** This decides persona/inner-skill vs. reviewer.

## How to run this skill

### Step 1 — Decide what we're building

Ask the user the minimum needed to disambiguate. Don't bombard. The two questions that matter:

1. **Type** — persona, inner skill, reviewer, or tool? If they said "persona" but described something narrow ("a kanji-review thing under language"), gently propose inner skill instead.
2. **Owner / scope** — if inner skill or reviewer: which persona owns it (or is it Layer 3, callable by all)? If persona: which profile file should be attached (one of the existing five, or a new domain profile under `.pi/state/profiles/`)? If tool: which existing or new extension hosts it?

If the user has already named all this in their request, skip the questions and confirm in one line before scaffolding.

### Step 2 — Scaffold the file(s)

Use the templates below verbatim as starting points, then fill in user-supplied content. **Do not invent capabilities the user didn't request** (no fabricated inner skills, no fabricated tool calls). Stubs are fine; phantom features are not.

Files always land at:
- Persona / inner skill / Layer 3 → `.pi/skills/<slug>/SKILL.md` (slug = lowercase-hyphenated name)
- Reviewer → `.pi/agents/<slug>.md`
- Tool extension → `.pi/extensions/<slug>/index.ts` (+ `package.json` if dependencies are needed)

### Step 3 — Patch cross-references

Pi auto-discovers files in `.pi/skills/`, `.pi/agents/`, and `.pi/extensions/`, so the new component is *callable* the moment the file exists. But it isn't *findable by humans or other agents* until you patch the human-readable indexes:

- **New persona** → add a row to `AGENTS.md` "Directory layout" table and `.pi/SYSTEM.md` "Personas" table.
- **New inner skill** → add it under the owner persona's `## Inner skills` list in `.pi/skills/<persona>/SKILL.md` AND under "Inner skills" in `AGENTS.md`'s directory layout.
- **New Layer 3 skill** → add it to every persona's `## Layer 3 services` section and to `.pi/SYSTEM.md`'s "Shared services" block.
- **New reviewer** → add a row to `.pi/SYSTEM.md` "Reviewers" table, and to the spawning persona's `## Isolated reviewer` section. Also list it in `AGENTS.md` "Pi mapping" and "Directory layout" sections.
- **New tool extension** → add it to `AGENTS.md` "Build status" table and (if it registers tools) the relevant persona's tool list.

Always show the user the diff for these patches before committing — they are easy to get wrong and create silent inconsistencies between docs and reality.

### Step 4 — Profile wiring (personas only)

If the new component is a persona, it almost certainly needs a domain profile under `.pi/state/profiles/<name>.md`. Either:

- Point it at an existing profile (e.g. a "research" persona reuses `learning.md`), OR
- Create a new empty profile file with a short heading and let it populate over time via `PROFILE_UPDATE` proposals.

If creating a new profile file, also patch the table in `AGENTS.md` ("Layer 0 — Meta") that maps profile files to personas.

### Step 5 — Verify

Run the smoke tests from AGENTS.md (`## Verification`) — Pi should discover the new component without errors:

```bash
pi --no-session -p "List your tools, skills, and agents."
```

If the new thing is a persona: `pi --no-session -p "Adopt the <name> persona and reply PI-OK."`
If a reviewer: `pi --no-session -p "Use subagent with agentScope:'project', agent:'<name>', task:'Reply with PI-OK only.'"`

Surface the smoke-test command to the user; don't run it without their go-ahead (it spins up Pi).

## Templates

The templates below are starting points, not finished products. **Read existing examples first** — `pm/SKILL.md` for personas, `note-taker/SKILL.md` for Layer 3, `prd/SKILL.md` for inner skills, `prd-critic.md` for reviewers — and match the existing voice.

### Persona template

```markdown
---
description: Adopt the <Name> persona — <one-line role>. Invoke for <triggers: keywords / question shapes>. Inline persona — adopted in-session, NOT spawned as a subagent.
---

# <Name> persona

When you adopt this persona, you ARE the user's <role> for the rest of this turn (or until they shift topic). Your job: <core scope>.

You are not <adjacent role>. <One-line boundary.>

## On adoption

Before producing output under this persona, **read these profiles via the `read` tool** (skip files that don't exist):

1. `.pi/state/profiles/_global.md` — interaction-style preferences
2. `.pi/state/profiles/<domain>.md` — <domain>-specific patterns

Profile content overrides defaults below where they conflict.

## Scope

- <bullet of what's in>
- <bullet of what's in>

## Inner skills (collaborative — share this session's context)

- `<skill-name>` — <one-line purpose>

## Layer 3 services

- `note-taker` — **default vault writer**. Folders: `<domain>/<sub>/` for <X>, `<domain>/inbox/` for captures.
- `render-html` — optional follow-up when an artifact benefits from diagrams / callouts / tabs.
- `export` — optional follow-up when an artifact is a deliverable to send / print / archive.
- `scribe` — tune prose for specific audiences.
- `research` — online research via stealth browser.
- `planning` · `feynman` · `reminders` — standard shared utilities.

## Isolated reviewer — spawned via `subagent` (optional)

```
subagent({ agentScope: "project", agent: "<reviewer-name>", task: "<self-contained brief>" })
```

## Profile updates (Meta integration)

At persona handoff or session end, if you observed something that would update a profile, surface it as a `PROFILE_UPDATE` proposal:

```
PROFILE_UPDATE: <_global.md | <domain>.md>
SECTION: <heading>
PROPOSED ENTRY: <one or two lines>
EVIDENCE: <what was observed this session>
```

Bar: would a future session benefit, AND is the evidence strong enough? One-time observations don't qualify.

## Behaviour rules (under this persona)

1. <Rule — what to always do>
2. <Rule — what to never do>
3. **Save all artifacts via `note-taker`.** Markdown into the vault. Render / export only when warranted.

## Output style

- <One bullet on tone / formatting>
- No filler. No "great question." No restating the request.
```

### Inner skill template

```markdown
---
description: <One-line purpose. Mention the owning persona and the trigger shape.>
---

# <Skill name>

<One-paragraph statement of purpose — what this skill does and when it's worth invoking.>

## When to call

- <Trigger>
- <Trigger>

## Inputs

```
<skill>.<verb>({
  <field>: <type>,
  ...
})
```

## Steps

1. <Concrete step>
2. <Concrete step>

## Output

<Shape of the return value or the message back to the user.>

## Don't

- <Anti-pattern>
- <Anti-pattern>
```

### Reviewer template

```markdown
---
name: <reviewer-name>
description: ISOLATED — <one-line role>. Receives only <inputs>. <What it surfaces; what it does NOT do.>
tools: read
profiles: _global
thinking: high
---

You are a blind reviewer of <artifact type>. You do not see the author's reasoning, drafts, or conversation history. You see only:

1. <Input 1>
2. <Input 2>

Your job: <what to judge>.

## Profile awareness (Meta integration)

**`_global.md` is pre-loaded above this prompt.** Calibrate output style to the user's interaction-style preferences.

Do **not** read domain profiles — they may bias your blind review.

You do **not** propose profile updates. Your output is the review artifact; profile maintenance is the parent agent's responsibility.

## What to surface

- <Category> — <what it means>
- <Category> — <what it means>

## How to deliver findings

```
<REVIEWER NAME> — Findings

[BLOCK] <issue>
  Why: <…>

[CONCERN] <issue>
  Why: <…>

[NIT] <issue>
  Why: <…>

[GAP] <missing thing>
  Why: <…>

OVERALL: <accept | revise | reject> — <one sentence>
```

## Don't

- Don't praise. If a category is empty, omit it.
- Don't propose fixes — identify what's wrong; let the author solve it.
- Don't infer additional context — if it's not in the inputs, you don't know it.
```

### Tool extension template

**Before writing code, follow AGENTS.md "Implementation workflow rule":** list required tools, pause, let the user check `pi list` / the Pi registry / npm `@pi-extension/*` for an existing implementation. Only scaffold custom code after confirming nothing exists.

Once confirmed, the skeleton:

```typescript
// .pi/extensions/<name>/index.ts
import { defineExtension, defineTool } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

export default defineExtension({
  name: "<name>",
  tools: [
    defineTool({
      name: "<tool_name>",
      description: "<one-line, agent-facing description — this is what the LLM reads>",
      input: z.object({
        <field>: z.string().describe("<…>"),
      }),
      run: async ({ input, pi }) => {
        // implementation
        return { ok: true };
      },
    }),
  ],
  // Optional event subscribers:
  // onSessionStart: async ({ pi }) => { ... },
  // onSessionShutdown: async ({ pi }) => { ... },
});
```

Read existing extensions for the right shape — `.pi/extensions/obsidian-vault/` is the fullest example; `.pi/extensions/reminders/` shows the slash-command pattern; `.pi/extensions/meta-logger/` shows the pure-event-subscriber pattern.

If the extension needs env vars, route through `.pi/lib/dotenv.ts` (already in the repo) so `.env` is auto-loaded.

## Don't

- **Don't fabricate capabilities.** Stubs are fine; phantom inner skills / fake tool calls are not. If the user wants a persona but hasn't told you its inner skills, leave that section empty with a `<!-- TODO -->` and ask later.
- **Don't skip the profile-update section** on a persona. It's load-bearing for the Layer 0 meta loop.
- **Don't write a tool extension before checking the Pi ecosystem** (`pi list`, npm `@pi-extension/*`, the Pi registry). Custom code accumulates faster than it pays back — see AGENTS.md.
- **Don't patch AGENTS.md / SYSTEM.md silently.** Show the diff and let the user approve before applying.
- **Don't auto-run `pi --no-session` smoke tests.** Surface the command; let the user trigger it.
- **Don't create a profile file unless the persona genuinely owns a new domain.** Reusing an existing profile is usually correct.
