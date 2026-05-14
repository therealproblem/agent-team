# Agents Team

A personal agent system built on the Pi coding agent harness (`@earendil-works/pi-coding-agent`, v0.74+).

## Architecture (3 layers, by isolation)

```
Layer 0   META                observes & optimizes the system
Layer 1   ROOT SESSION        single Pi session — adopts personas inline
          │
          ├── Personas (skills, inline)   pm, engineer, educator, language, trader
          │   no extra model loop per turn; the root IS the persona while it's on
          │
          └── Reviewers (sub-agents)  prd-critic · uat-tester · red-team
                                      assessment-grader · jlpt-examiner
              blind by isolation — spawned via `subagent` when the active persona
              needs adversarial review
Layer 3   SHARED SERVICES     skills any persona can call inline
                              document · note-taker · news · scribe · research · reminders
```

The earlier model used a Distributor that spawned each domain as a separate Pi sub-session — paying a model loop per turn. **Path B** (current) pulls domain agents inline as personas: the root session reads a persona's `SKILL.md` and operates under those rules. Reviewers stay as sub-processes only when contamination would corrupt their judgment.

## Pi mapping

| Architectural concept | Pi artifact |
|---|---|
| Layer 0 + 1 (Meta + root agent) | The single Pi session. `.pi/SYSTEM.md` is its system prompt — explains the persona model and routes to the right persona. `meta-logger` extension subscribes to `session_shutdown`. |
| Personas (pm, engineer, educator, language, trader) | `.pi/skills/<name>/SKILL.md` — adopted by the root session by reading the file and following its instructions. |
| Reviewers (prd-critic, uat-tester, red-team, assessment-grader, jlpt-examiner) | `.pi/agents/<name>.md` — spawned as isolated sub-Pi processes via the `subagent` extension. Pre-loaded with `_global.md` profile only — no domain profiles, to preserve blindness. |
| Inner skills (prd, frontend, kanji, journal, …) | `.pi/skills/<name>/SKILL.md` — Pi auto-discovers and loads on demand inside the active persona. |
| Layer 3 services (document, note-taker, news, scribe, research, reminders) | Same shape as inner skills — `.pi/skills/<name>/SKILL.md`, available under every persona. |
| Tool surfaces | TypeScript extensions in `.pi/extensions/` register tools via `defineTool` + `pi.registerTool`. |

## Specialization rule

> **Sub-session when contamination would corrupt the output. Inline (persona or skill) when shared context aids the work.**

A UAT tester or red-team reviewer *must* be blind to the implementer's reasoning. Same loop = same context = bias. Inline cannot enforce this; sub-sessions can.

Domain work *benefits* from continuity — keeping PM and engineer in the same session means an engineer persona can read the PRD draft directly from earlier in the conversation. Don't pay for isolation that hurts collaboration.

See `~/.claude/plans/what-is-pi-code-steady-gray.md` for the full design rationale.

## Trader runs in student mode

Trader is uniquely **a student of the user's trading**. Never prescriptive. Surfaces patterns as Socratic questions only. Reflects "should I do X?" back at the user; refuses to call trades.

## Directory layout

```
.pi/
├── SYSTEM.md                  Root agent — persona-adoption rules
├── agents/                    Reviewers only (spawned as sub-Pi processes)
│   ├── prd-critic.md          spawned by pm persona
│   ├── uat-tester.md          spawned by engineer persona
│   ├── red-team.md            spawned by engineer persona
│   ├── assessment-grader.md   spawned by educator persona
│   └── jlpt-examiner.md       spawned by language persona
├── skills/                    Personas + inner skills + Layer 3 services
│   ├── pm/SKILL.md            PERSONA
│   ├── engineer/SKILL.md      PERSONA
│   ├── educator/SKILL.md      PERSONA
│   ├── language/SKILL.md      PERSONA
│   ├── trader/SKILL.md        PERSONA
│   │
│   ├── document/SKILL.md      Layer 3 (default for any long-form output)
│   ├── note-taker/SKILL.md    Layer 3
│   ├── news/SKILL.md          Layer 3
│   ├── scribe/SKILL.md        Layer 3
│   ├── research/SKILL.md      Layer 3 (online research via camoufox-pi)
│   ├── reminders/SKILL.md     Layer 3 (capture / resolve persistent todos)
│   │
│   ├── prd/SKILL.md           inner (pm)
│   ├── roadmap/SKILL.md       inner (pm)
│   ├── stakeholder-summary/SKILL.md   inner (pm)
│   ├── frontend/SKILL.md      inner (engineer)
│   ├── backend/SKILL.md       inner (engineer)
│   ├── uiux/SKILL.md          inner (engineer)
│   ├── devops/SKILL.md        inner (engineer)
│   ├── curriculum/SKILL.md    inner (educator)
│   ├── content/SKILL.md       inner (educator)
│   ├── assessment-author/SKILL.md     inner (educator)
│   ├── srs/SKILL.md           inner (language)
│   ├── kanji/SKILL.md         inner (language)
│   ├── grammar/SKILL.md       inner (language)
│   ├── reading/SKILL.md       inner (language)
│   ├── journal/SKILL.md       inner (trader)
│   ├── clarifier/SKILL.md     inner (trader)
│   ├── pattern-watch/SKILL.md inner (trader)
│   ├── question-generator/SKILL.md    inner (trader)
│   └── meta-review/SKILL.md   Layer 0 — cross-profile synthesis
└── extensions/                TypeScript extensions (auto-loaded by Pi)
    ├── subagent/              Official Pi example — spawns reviewer sub-sessions
    ├── obsidian-vault/        Registers `write_note` (markdown + HTML).
    ├── news-ingest/           Registers `fetch_topic`. Used by `news` skill.
    ├── srs/                   Registers `list_due`, `record`, `add_item`.
    ├── trade-journal/         Registers `list_trades`, `read_trade`.
    ├── meta-logger/           Subscribes to `session_shutdown`; appends to .pi/meta-logs/.
    └── reminders/             Subscribes to `session_start`; surfaces open items from .pi/state/reminders.md as a TUI message.
```

## Configuration

- **Vault location.** Default: project-root `vault/` (gitignored). Override with the `AGENTS_TEAM_VAULT_PATH` env var if you want notes to land in your real Obsidian vault elsewhere on disk. Used by `obsidian-vault` and `trade-journal` extensions.
- **Pi auto-discovers** everything in `.pi/agents/`, `.pi/skills/`, and `.pi/extensions/` — no `settings.json` entry needed for in-repo code.
- **Installed npm packages** (recorded in `.pi/settings.json`, dropped into `.pi/npm/node_modules/`):
  - `@the-forge-flow/camoufox-pi` — stealth web fetcher + DuckDuckGo search via Camoufox (fingerprint-resistant Firefox fork). Backs the `research` skill. First call downloads the Camoufox binary (~500 MB). Install: `pi install -l npm:@the-forge-flow/camoufox-pi`.

## Layer 0 — Meta (per-domain user model)

`.pi/state/profiles/` contains markdown files that build the system's understanding of *who you are* in each domain. Loaded on demand by personas (when adopted) or by reviewers (via the subagent extension's profile pre-load).

| File | Loaded by |
|---|---|
| `_global.md` | every persona + every reviewer — interaction-style preferences |
| `product.md` | pm persona |
| `engineering.md` | engineer persona |
| `learning.md` | educator persona |
| `language.md` | language persona |
| `trading.md` | trader persona |

**Personas** read their profiles via the `read` tool at adoption time (instructed by their SKILL.md). The cost is one read per persona-swap, not per turn — cheap.

**Reviewers** load only `_global.md` — domain profiles would compromise blind isolation. The `subagent` extension pre-injects this so the reviewer doesn't waste a turn reading files. Reviewers do NOT propose profile updates; that's the active persona's responsibility.

**Update flow.** At session end, the agent surfaces a `PROFILE_UPDATE` proposal:

```
PROFILE_UPDATE: <_global.md | <domain>.md>
SECTION: <section heading>
PROPOSED ENTRY: <one or two lines to add>
EVIDENCE: <what was observed this session that supports this>
```

The user approves, edits, or rejects. If approved, the agent uses the `edit` tool to write the entry. The bar: would a future session benefit from knowing this, AND is the evidence strong enough? One-time observations don't qualify.

**Synthesis.** The `meta-review` skill (`.pi/skills/meta-review/SKILL.md`) reads all profiles on demand and surfaces cross-domain patterns, contradictions, and tacit knowledge that's emerged. Invoke when you want a step-back view of what the system has learned about you.

## Web frontend

Not currently wired in — being built from scratch. The CLI (`pi` from the repo root) is the only entry point right now.

## One-time setup

Run the bootstrap script. Installs Pi, tmux (with Pi-friendly config), and creates a `.env` from the template:

```bash
bash scripts/setup.sh
```

Idempotent — safe to re-run on this machine or any new one. Targets macOS (Homebrew) and Linux (apt/dnf/pacman) for tmux; the Pi install step is platform-agnostic. Does not require sudo on macOS.

## Local secrets — `.env`

Project-local secrets and overrides live in `.env` (gitignored). Copy from the template:

```bash
cp .env.example .env
```

Currently the only var of interest is the optional `AGENTS_TEAM_VAULT_PATH` for pointing at your real Obsidian vault.

## Implementation workflow rule

**Build custom only when necessary.** Default is to find and reuse, not write.

Before writing any custom extension, skill, or slash command:

1. **List the tools / capabilities required** in a "## Tools required" block.
2. **Pause** — the user checks Pi's online library (`pi list`, `pi install <source>`, the published extension registry) for an existing implementation.
3. **Only write custom code after confirming nothing exists** in the repo or ecosystem.

The proposal block must classify each requirement:

```
## Tools required
- write_note          — provided by .pi/extensions/obsidian-vault (existing in this repo)
- fetch_topic         — provided by .pi/extensions/news-ingest (existing, stubbed)
- <new capability>    — NOT YET AVAILABLE. Candidates to check:
                        - Pi package registry
                        - npm @pi-extension/* packages
                        - GitHub earendil-works org examples
```

Three buckets, three actions:

1. **Already in this repo** → reference the existing extension. No new code.
2. **Available in the Pi ecosystem** → user installs (`pi install <source>`). No new code.
3. **Genuinely missing** → only then implement under `.pi/extensions/`, and only the minimum needed.

"Necessary" means: the capability is required to make the agent or skill work, AND no existing package provides it (or no acceptable existing package — e.g. licensing conflict, abandoned, unmaintained). "It would be cleaner if I wrote my own" is not necessary. "Pi already has it but I want a different shape" is not necessary — adapt the agent prompt or skill to the existing tool's shape instead.

The pause is the point. Do not skip it for "small" extensions — small custom code accumulates faster than it pays back.

## Global behaviour rules

These apply to every agent:

1. **Documents are HTML by default.** Any long-form artifact — PRDs, reports, lesson plans, summaries, exec briefs, anything multi-section or longer than ~400 words — goes through the `document` skill. It produces a self-contained HTML file (minimalist shadcn-style template, embedded CSS, no external assets, dark/light auto) and returns a `file://` URL. The agent's reply to the user is the URL plus a one-sentence summary — **not** the rendered body inline. Other formats (markdown, PDF) only when the user asks explicitly. Short captures (< 200 words, no structure) stay markdown via `note-taker`.
2. **Save work via Note-taker or Document.** Never write to the vault directly; route through one of those skills (which call the `write_note` tool).
3. **Tune outward-facing prose via Scribe.** When output is for a non-default audience, route through `scribe` rather than rephrasing inline.
4. **Trader is a student.** Never prescribes; only questions.
5. **Memory ops are quiet.** Operations on `.pi/state/` (reminders, profile updates, any other state) must not surface thinking blocks, diff visualizations, or prose summaries. Use purpose-built tools where they exist (`reminder_add` / `reminder_resolve` / `reminder_list` for reminders) instead of `read` + `edit`, so the TUI shows a one-line tool result rather than a diff. For profile updates: surface the `PROFILE_UPDATE` proposal text to the user for approval, then apply silently — no narration of what just changed.

## Build status

| Layer | Component | Status |
|---|---|---|
| 0 | meta-logger extension (`session_shutdown` hook) | Functional stub |
| 1 | Root session (`.pi/SYSTEM.md`) | Persona-adoption model (Path B) |
| Personas | pm, engineer, educator, language, trader | Skill bodies in `.pi/skills/<name>/SKILL.md` |
| Reviewers | prd-critic, uat-tester, red-team, assessment-grader, jlpt-examiner | Spawned as sub-sessions via `subagent` |
| Inner skills | All 18 (prd, roadmap, frontend, …) | Markdown content complete |
| 3 | document, note-taker, news, scribe | Skills present; `fetch_topic` still returns empty (TODO: pick source or delegate to `research`) |
| 3 | research | Skill present. Backed by installed npm package `@the-forge-flow/camoufox-pi` (tools: `tff-fetch_url`, `tff-search_web`). |
| ext | subagent | Pi's example, with profile pre-load + `--system-prompt` patch |
| ext | obsidian-vault | Writes markdown and HTML via `write_note` (`format` param) |
| ext | trade-journal | Functional (read-side accessor) |
| ext | srs | Functional SM-2 scheduler; needs deck seeding |
| ext | news-ingest | Stub (`realFetch` returns []) |
| ext | reminders | Functional. Surfaces a numbered list from `.pi/state/reminders.md` on `session_start` via `pi.sendMessage`. Registers `/clear <N>` slash command — clears reminder by index directly from the extension, no agent turn. Tools: `reminder_add`, `reminder_resolve` (fallback for natural-language resolves), `reminder_list`. |

## Verification

Tier 1 (Pi starts and discovers everything) — **passing.**
Tier 3 (`subagent` spawns project agent end-to-end) — **passing.**
Tiers 2, 4, 5, 6 (skill smoke, isolation, student mode, end-to-end) — pending live testing.

Run smoke tests:

```bash
# Pi loads, discovers everything
pi --no-session -p "List your tools, skills, and agents."

# Subagent spawn works (reviewers only — pick any of the five)
pi --no-session -p "Use subagent with agentScope:'project', agent:'prd-critic', task:'Reply with PI-OK only.'"

# Persona adoption (inline, no subagent)
pi --no-session -p "Adopt the engineer persona and reply PI-OK."
```
