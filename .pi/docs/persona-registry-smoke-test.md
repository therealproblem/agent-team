# Persona Registry Smoke Test

This document describes how to verify that the canonical persona registry (`.pi/state/persona-registry.json`) is correctly consumed by all dependent systems after adding, removing, or renaming a persona.

## What the registry controls

- **Statusline footer** (`.pi/extensions/statusline/`) — persona labels in Line 2
- **Telegram dispatcher** (`.pi/extensions/telegram-bot/dispatcher.ts`) — valid `/persona` and `@persona` routing
- **Quiet read tool** (`.pi/extensions/quiet-read/`) — "adopt X persona" vs "load X skill" display logic
- **Board skill** (`.pi/skills/board/SKILL.md`) — documentation of valid `sub_persona:` values
- **System prompt** (`.pi/SYSTEM.md`) — reference to the canonical registry
- **Repo guide** (`AGENTS.md`) — reference to the canonical registry

## Registry schema

```json
{
  "personas": {
    "<persona-key>": {
      "label": "SHORT",        // e.g. "PM", "ED", "LAN"
      "description": "...",
      "skillPath": ".pi/skills/<persona-key>/SKILL.md",
      "innerSkills": ["skill1", "skill2", ...]
    }
  },
  "subagents": {
    "<subagent-key>": {
      "description": "...",
      "agentPath": ".pi/agents/<subagent-key>.md",
      "innerSkills": ["skill1", "skill2", ...]  // optional, only for engineer
    }
  }
}
```

## How to add a persona

1. **Create the persona SKILL.md** at `.pi/skills/<new-persona>/SKILL.md`.
2. **Add entry to registry** — open `.pi/state/persona-registry.json`, add a new key under `personas` with label, description, skillPath, and innerSkills.
3. **Update SYSTEM.md table** — add a row for the new persona in the personas table (this is still manual because the table includes domain and "when to adopt" columns that aren't in the registry).
4. **Run smoke tests** (below).

## How to remove a persona

1. **Remove the persona's SKILL.md** (or move it out of `.pi/skills/`).
2. **Remove entry from registry** — delete the key under `personas` in `.pi/state/persona-registry.json`.
3. **Update SYSTEM.md table** — remove the row.
4. **Run smoke tests** (below).

## How to rename a persona

1. **Rename the persona's skill directory** — `mv .pi/skills/<old-name> .pi/skills/<new-name>`.
2. **Update the registry** — change the key under `personas`, update `skillPath`.
3. **Update SYSTEM.md table** — change the persona name in the table.
4. **Run smoke tests** (below).

## Smoke tests

### 1. Statusline detection

Start a new Pi session and adopt the modified persona:

```bash
pi
```

In the session:

```
Read the pm persona skill.
```

**Expected:** The statusline's Line 2 should show the persona's label highlighted (bold + accent color). For a new persona, the label should appear. For a removed persona, it should no longer appear. For a renamed persona, the new label should appear.

**What this tests:** `.pi/extensions/statusline/index.ts` correctly loads the registry and builds the SKILL_REGEX.

### 2. Telegram routing

If you have the Telegram bot running and an allowed chat:

```
/pm test
@pm test
```

Send a message with the persona's slash command or mention.

**Expected:** The bot should invoke Pi with the correct persona. For a new persona, it should route. For a removed persona, it should fall back to ingestion (no routing). For a renamed persona, the new name should route.

**What this tests:** `.pi/extensions/telegram-bot/dispatcher.ts` correctly loads personas from the registry.

### 3. Quiet read persona detection

In a Pi session:

```bash
pi -p "Read .pi/skills/pm/SKILL.md"
```

**Expected:** The TUI should show `adopt pm persona` (not `load pm skill`).

Try the same with a non-persona skill:

```bash
pi -p "Read .pi/skills/feynman/SKILL.md"
```

**Expected:** The TUI should show `load feynman skill`.

**What this tests:** `.pi/extensions/quiet-read/index.ts` correctly distinguishes personas from inner skills via the registry.

### 4. Board sub-persona validation

Create a card with the new/renamed persona's inner skill as `sub_persona:`:

```bash
pi
```

```
Adopt pm persona.

Create a board card under agents-team with persona: pm, sub_persona: prd, title: "Test card", body: "Test".
```

**Expected:** The card is created successfully. Check that the `sub_persona:` value matches one of the `innerSkills` listed in the registry for that persona.

**What this tests:** The board skill documentation (`.pi/skills/board/SKILL.md`) references the registry as the source of truth for valid `sub_persona:` values.

### 5. Documentation references

Check that the following files mention the registry:

- `.pi/SYSTEM.md` — "The canonical registry of personas... is maintained in `.pi/state/persona-registry.json`."
- `AGENTS.md` — "**Canonical persona registry:** `.pi/state/persona-registry.json`..."
- `.pi/skills/board/SKILL.md` — "The canonical list is maintained in `.pi/state/persona-registry.json`..."

**Expected:** All three files reference the registry. No hard-coded persona lists remain in those docs.

**What this tests:** Documentation consumers know where to look for the source of truth.

## Common failure modes

- **Statusline shows old persona after rename:** The statusline extension caches the regex at module load. Restart Pi to reload.
- **Telegram bot routes old persona after rename:** Same — restart the bot process.
- **Board validation rejects valid sub-persona:** Check that the `innerSkills` array in the registry matches the actual skill directories under `.pi/skills/`.

## What is NOT centralized

- **SYSTEM.md personas table:** The "Domain" and "When to adopt" columns contain prose that can't be mechanically generated from the registry. This table still requires manual updates when adding/removing/renaming personas.
- **Persona SKILL.md files:** Each persona's behavior, rules, and inner skill loading logic live in its own SKILL.md. The registry only tracks metadata (label, description, path, inner skills).
- **Profile file names:** Profiles under `vault/.memory/profiles/` (e.g. `product.md`, `language.md`, `trading.md`) are not derived from persona names and are not tracked in the registry. A persona's SKILL.md names which profile(s) it reads.

## Next steps after passing smoke tests

If all tests pass:

1. Commit the registry change + SKILL.md changes + doc updates as a single commit.
2. Surface the change in the session where the persona was added/removed/renamed (if applicable).
3. Restart any long-running processes that cache the registry (Pi sessions, Telegram bot).

If any test fails:

1. Check the registry JSON for typos (persona key, skillPath, label).
2. Check that the SKILL.md actually exists at the path listed in the registry.
3. Verify that all consumers load the registry from `.pi/state/persona-registry.json` (not from a stale hard-coded list).
