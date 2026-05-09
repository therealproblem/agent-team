# Agents Team

A personal agent system built on the Pi coding agent harness (`@earendil-works/pi-coding-agent`, v0.74+).

## Architecture (4 layers, by purpose)

```
Layer 0  META               observes & optimizes the system
Layer 1  ORCHESTRATION      Task Distributor — user-facing router (root Pi session)
Layer 2  DOMAIN AGENTS      isolated sub-sessions, one per domain
         ├ Work     pm, engineer
         ├ Learning educator, language
         └ Finance  trader (student mode)
Layer 2.5 ISOLATED REVIEWERS spawned by Layer 2 agents
         prd-critic · uat-tester · red-team · assessment-grader · jlpt-examiner
Layer 3  SHARED SERVICES    inline skills any agent can call
         note-taker · news · scribe
```

## Pi mapping

The **flat** layout is convention-aligned with Pi:

| Architectural concept | Pi artifact |
|---|---|
| Layer 0 + 1 (Meta + Distributor) | The root Pi session. `.pi/SYSTEM.md` is the Distributor's prompt. `meta-logger` extension subscribes to `session_shutdown`. |
| Layer 2 + 2.5 agents | `.pi/agents/<name>.md` files — one per agent, with frontmatter (`name`, `description`, `tools`). The `subagent` extension (Pi's official example) spawns them as isolated sub-Pi processes. |
| Layer 2.5 collaborative skills | `.pi/skills/<name>/SKILL.md` — Pi auto-discovers and loads on demand. |
| Layer 3 services | Same shape as Layer 2.5 skills — `.pi/skills/<name>/SKILL.md`. |
| Tool surfaces | TypeScript extensions in `.pi/extensions/` register tools via `defineTool` + `pi.registerTool`. |

## Specialization rule (Layer 2.5)

> **Sub-session when contamination would corrupt the output. Skill when shared context aids the work.**

A UAT tester or red-team reviewer *must* be blind to the implementer's reasoning. Same loop = same context = bias. Skills cannot enforce this; sub-sessions can.

A frontend specialist working on the same feature as the backend specialist *benefits* from continuity. Don't pay for isolation that hurts collaboration.

See `~/.claude/plans/what-is-pi-code-steady-gray.md` for the full design rationale.

## Trader runs in student mode

Trader is uniquely **a student of the user's trading**. Never prescriptive. Surfaces patterns as Socratic questions only. Reflects "should I do X?" back at the user; refuses to call trades.

## Directory layout

```
.pi/
├── SYSTEM.md                  Root agent (Distributor + Meta directives)
├── agents/                    Layer 2 + 2.5 — flat agent files
│   ├── pm.md
│   ├── engineer.md
│   ├── educator.md
│   ├── language.md
│   ├── trader.md
│   ├── prd-critic.md          Layer 2.5 isolated reviewer (spawned by pm)
│   ├── uat-tester.md          Layer 2.5 isolated reviewer (spawned by engineer)
│   ├── red-team.md            Layer 2.5 isolated reviewer (spawned by engineer)
│   ├── assessment-grader.md   Layer 2.5 isolated reviewer (spawned by educator)
│   └── jlpt-examiner.md       Layer 2.5 isolated reviewer (spawned by language)
├── skills/                    Layer 2.5 collaborative skills + Layer 3 services
│   ├── note-taker/SKILL.md    Layer 3
│   ├── news/SKILL.md          Layer 3
│   ├── scribe/SKILL.md        Layer 3
│   ├── prd/SKILL.md           Layer 2.5 (pm)
│   ├── roadmap/SKILL.md       Layer 2.5 (pm)
│   ├── stakeholder-summary/SKILL.md   Layer 2.5 (pm)
│   ├── frontend/SKILL.md      Layer 2.5 (engineer)
│   ├── backend/SKILL.md       Layer 2.5 (engineer)
│   ├── uiux/SKILL.md          Layer 2.5 (engineer)
│   ├── devops/SKILL.md        Layer 2.5 (engineer)
│   ├── curriculum/SKILL.md    Layer 2.5 (educator)
│   ├── content/SKILL.md       Layer 2.5 (educator)
│   ├── assessment-author/SKILL.md     Layer 2.5 (educator)
│   ├── srs/SKILL.md           Layer 2.5 (language)
│   ├── kanji/SKILL.md         Layer 2.5 (language)
│   ├── grammar/SKILL.md       Layer 2.5 (language)
│   ├── reading/SKILL.md       Layer 2.5 (language)
│   ├── journal/SKILL.md       Layer 2.5 (trader)
│   ├── clarifier/SKILL.md     Layer 2.5 (trader)
│   ├── pattern-watch/SKILL.md Layer 2.5 (trader)
│   └── question-generator/SKILL.md    Layer 2.5 (trader)
└── extensions/                TypeScript extensions (auto-loaded by Pi)
    ├── subagent/              Official Pi example — spawns project agents
    ├── obsidian-vault/        Registers `write_note`. Used by `note-taker` skill.
    ├── news-ingest/           Registers `fetch_topic`. Used by `news` skill.
    ├── srs/                   Registers `list_due`, `record`, `add_item`.
    ├── trade-journal/         Registers `list_trades`, `read_trade`.
    └── meta-logger/           Subscribes to `session_shutdown`; appends to .pi/meta-logs/.
```

## Configuration

- **Vault location.** Default: project-root `vault/` (gitignored). Override with the `AGENTS_TEAM_VAULT_PATH` env var if you want notes to land in your real Obsidian vault elsewhere on disk. Used by `obsidian-vault` and `trade-journal` extensions.
- No `settings.json` needed — Pi auto-discovers everything in `.pi/agents/`, `.pi/skills/`, and `.pi/extensions/`.

## Layer 0 — Meta (per-domain user model)

`.pi/state/profiles/` contains markdown files that build the system's understanding of *who you are* in each domain. Loaded by agents at session start, updated via the hybrid mechanism (agent proposes a `PROFILE_UPDATE` at session end, you approve / edit / reject).

| File | Loaded by |
|---|---|
| `_global.md` | every agent (Layer 2 + Layer 2.5 reviewers) — interaction-style preferences |
| `engineering.md` | engineer |
| `product.md` | pm |
| `trading.md` | trader (replaces the earlier `vault/trades/_patterns.md`) |
| `learning.md` | educator |
| `language.md` | language |

**Layer 2.5 reviewers (prd-critic, uat-tester, red-team, assessment-grader, jlpt-examiner)** load only `_global.md` — domain profiles would compromise their blind isolation. They also do NOT propose profile updates; that's the parent agent's responsibility.

**Update flow.** At session end, the agent surfaces a `PROFILE_UPDATE` proposal:

```
PROFILE_UPDATE: <_global.md | <domain>.md>
SECTION: <section heading>
PROPOSED ENTRY: <one or two lines to add>
EVIDENCE: <what was observed this session that supports this>
```

The user approves, edits, or rejects. If approved, the agent uses the `edit` tool to write the entry. The bar: would a future session benefit from knowing this, AND is the evidence strong enough? One-time observations don't qualify.

**Synthesis.** The `meta-review` skill (`.pi/skills/meta-review/SKILL.md`) reads all profiles on demand and surfaces cross-domain patterns, contradictions, and tacit knowledge that's emerged. Invoke when you want a step-back view of what the system has learned about you.

## Web frontend — agent-of-empires

For browser-based access to Pi sessions, this project uses [agent-of-empires](https://github.com/njbrake/agent-of-empires) (`aoe`). It's a tmux-backed session manager that renders the Pi TUI inside a web page — multi-session dashboard, optional remote access via Tailscale Funnel or Cloudflare Tunnel, installable as a PWA.

It is **not** a chat-styled UI like LibreChat. It's the Pi terminal interface in a browser tab, with extra dashboard chrome.

### One-time setup

Run the bootstrap script — installs Pi, aoe, tmux (with required config), registers this project as a session, and creates `.env` with a fresh passphrase:

```bash
bash scripts/setup.sh                # installs everything + launches dashboard
bash scripts/setup.sh --no-launch    # installs everything, doesn't start serve
```

Idempotent — safe to re-run on this machine or any new one. Targets macOS (Homebrew) and Linux (apt/dnf/pacman) for tmux; Pi and aoe install paths are platform-agnostic.

The script does not require sudo on macOS. Linux installs of tmux may prompt for sudo.

### Local secrets — `.env`

Project-local secrets (the aoe passphrase, optional vault path override) live in `.env` (gitignored). Copy from the template and fill in:

```bash
cp .env.example .env
# Edit .env — generate a passphrase with:
#   openssl rand -base64 24 | tr -d '/+=' | head -c 32
```

### Launching the web dashboard

```bash
set -a; source .env; set +a              # load AOE_SERVE_PASSPHRASE into env
aoe serve                                # → http://127.0.0.1:8080
```

Authentication is on by default (localhost binding + passphrase from env). Open the URL, enter the passphrase, click the **agents-team** session to attach.

Other useful invocations:

| Command | Purpose |
|---|---|
| `aoe serve --no-auth` | Skip the passphrase entirely (only allowed on localhost binding) |
| `aoe serve --remote` | Expose externally via Tailscale / Cloudflare Tunnel for phone access |
| `aoe serve --daemon` | Run in background; `aoe serve --stop` to halt |
| `aoe` | Terminal TUI dashboard (no browser) |
| `aoe agents` | Show which agents `aoe` recognizes as installed |
| `aoe list` | Show registered sessions |

In the dashboard, click the agents-team session to launch / attach. From there, you're talking to Pi the same way you would from the CLI — all `.pi/agents/`, `.pi/skills/`, and `.pi/extensions/` work the same.

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

1. **Save work via Note-taker.** Never write to the vault directly; call `note-taker` skill (which calls the `write_note` tool).
2. **Tune outward-facing prose via Scribe.** When output is for a non-default audience, route through `scribe` rather than rephrasing inline.
3. **Trader is a student.** Never prescribes; only questions.

## Build status

| Layer | Component | Status |
|---|---|---|
| 0 | meta-logger extension (`session_shutdown` hook) | Functional stub |
| 1 | Distributor (`.pi/SYSTEM.md`) | Functional |
| 2 | pm, engineer, educator, language, trader | Functional system prompts; isolated sub-sessions verified |
| 2.5 (reviewers) | prd-critic, uat-tester, red-team, assessment-grader, jlpt-examiner | Functional system prompts |
| 2.5 (collaborative skills) | All 18 skills | Markdown content complete |
| 3 | note-taker | Skill + `write_note` tool functional |
| 3 | news | Skill complete; `fetch_topic` returns empty (TODO: pick source) |
| 3 | scribe | Skill complete |
| ext | subagent | Pi's example, copied as-is |
| ext | obsidian-vault | Functional (writes notes with frontmatter) |
| ext | trade-journal | Functional (read-side accessor) |
| ext | srs | Functional SM-2 scheduler; needs deck seeding |
| ext | news-ingest | Stub (`realFetch` returns []) |

## Verification

Tier 1 (Pi starts and discovers everything) — **passing.**
Tier 3 (`subagent` spawns project agent end-to-end) — **passing.**
Tiers 2, 4, 5, 6 (skill smoke, isolation, student mode, end-to-end) — pending live testing.

Run smoke tests:

```bash
# Pi loads, discovers everything
pi --no-session -p "List your tools, skills, and agents."

# Subagent spawn works
pi --no-session -p "Use subagent with agentScope:'project', agent:'engineer', confirmProjectAgents:false, task:'Reply with PI-OK only'."
```
