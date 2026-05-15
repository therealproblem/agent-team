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
                              note-taker · render-html · export · news · scribe · research · summary · reminders
```

The earlier model used a Distributor that spawned each domain as a separate Pi sub-session — paying a model loop per turn. **Path B** (current) pulls domain agents inline as personas: the root session reads a persona's `SKILL.md` and operates under those rules. Reviewers stay as sub-processes only when contamination would corrupt their judgment.

## Pi mapping

| Architectural concept | Pi artifact |
|---|---|
| Layer 0 + 1 (Meta + root agent) | The single Pi session. `.pi/SYSTEM.md` is its system prompt — explains the persona model and routes to the right persona. |
| Personas (pm, engineer, educator, language, trader) | `.pi/skills/<name>/SKILL.md` — adopted by the root session by reading the file and following its instructions. |
| Reviewers (prd-critic, uat-tester, red-team, assessment-grader, jlpt-examiner) | `.pi/agents/<name>.md` — spawned as isolated sub-Pi processes via the `subagent` extension. Pre-loaded with `_global.md` profile only — no domain profiles, to preserve blindness. |
| Inner skills (prd, frontend, kanji, journal, …) | `.pi/skills/<name>/SKILL.md` — Pi auto-discovers and loads on demand inside the active persona. |
| Layer 3 services (note-taker, render-html, export, news, scribe, research, summary, reminders) | Same shape as inner skills — `.pi/skills/<name>/SKILL.md`, available under every persona. |
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
│   ├── note-taker/SKILL.md    Layer 3 (DEFAULT vault writer — markdown only, Obsidian-strict)
│   ├── render-html/SKILL.md   Layer 3 (md → Nextra HTML page served at /v/<YYYY-MM-DD>-<slug> on :8080)
│   ├── export/SKILL.md        Layer 3 (md → Kami-styled PDF served at /p/<YYYY-MM-DD>-<slug>-<epoch>.pdf on :8080; each regeneration gets a fresh epoch suffix to defeat CDN caching, and prior PDFs for the same title — across all dates — are auto-pruned after the new one is on disk)
│   ├── news/SKILL.md          Layer 3
│   ├── scribe/SKILL.md        Layer 3
│   ├── research/SKILL.md      Layer 3 (online research via camoufox-pi)
│   ├── summary/SKILL.md       Layer 3 (inline TL;DR of a URL or pasted text — paired with research; no vault write, no HTML, no PDF)
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
├── extensions/                TypeScript extensions (auto-loaded by Pi)
│   ├── subagent/              Official Pi example — spawns reviewer sub-sessions
│   ├── obsidian-vault/        Registers `write_note` (markdown → vault), `write_html_render` (md → Nextra content/v/<date>-<slug>.mdx), `write_export_pdf` (Kami HTML → PDF → <repo>/exports/<date>-<slug>-<epoch>.pdf, served by the Next.js route handler at `app/p/[slug]/route.ts` which reads from disk at request time; each regeneration appends a fresh Unix-epoch suffix so the URL is never reused).
│   ├── server/                Subscribes to `session_start`; spawns `next start` (production, from pre-built `.next/`) on :8080 from `.pi/server/`, kills on Pi exit. Bails with a clear message if `.next/` is missing — run `bash scripts/setup.sh` (or `npm run build` in `.pi/server/`) to produce it. Surfaces ready/failed status as a TUI message.
│   ├── news-ingest/           Registers `fetch_topic`, `query_today`, `get_item`, `refresh_all_topics`. Fetches RSS/Atom feeds (plain Node `fetch`, no Camoufox) and persists into a daily-rolling JSON store at `.pi/state/news.json` (auto-purged on day rollover). Source registry: `.pi/state/news-sources.json` (topic → [feed URLs]). Topics absent from the registry return `fallback_hint: "no_rss_source"` so the `news` skill delegates to `research`. Cron-driven by `scripts/news-cron.sh`. Surfaces a `news: last scrape …` line on `session_start` (or `No news` when empty). Slash commands: `/news-refresh` (manual full sweep, in-extension), `/show-news` (returns the `/news` page URL — Next.js route at `app/news/page.tsx` reads `news.json` on each request, Highlights / All toggle). Used by `news` skill.
│   ├── srs/                   Registers `list_due`, `record`, `add_item`.
│   ├── trade-journal/         Registers `list_trades`, `read_trade`.
│   └── reminders/             Subscribes to `session_start`; surfaces open items from .pi/state/reminders.md as a TUI message.
└── server/                    Next.js 16 + Nextra 4 app — serves HTML renders at /v/<date>-<slug> and PDFs at /p/<date>-<slug>-<epoch>.pdf on port 8080. Themed with the OpenWeb parchment palette (DESIGN-2). Boots automatically via the `server` extension. No auth — URL is the access control.
```

## Configuration

- **Vault location.** Default: project-root `vault/` (gitignored). Override with the `AGENTS_TEAM_VAULT_PATH` env var if you want notes to land in your real Obsidian vault elsewhere on disk. Used by `obsidian-vault` and `trade-journal` extensions.
- **Server location.** Default: project-root `.pi/server/`. Override with `AGENTS_TEAM_SERVER_PATH`. Houses the Next.js + Nextra app that serves renders and PDFs.
- **Server port.** Default: `8080`. Override with `AGENTS_TEAM_SERVER_PORT`.
- **Server mode.** Default: `production` (spawns `next start` against the pre-built `.next/`). Set `AGENTS_TEAM_SERVER_MODE=dev` (or `development`) to spawn `next dev --webpack` with hot reload — the build-dir check is skipped and the first request compiles on demand.
- **Server title.** Default: `agents-team`. Override with `AGENTS_TEAM_SERVER_TITLE` — appears as the wordmark in the top-left navbar and as the suffix on every page's `<title>`. **Read at build time**, not runtime: `layout.tsx` is statically pre-rendered, so the value is baked into `.pi/server/.next/`. Change the var, then re-run `bash scripts/setup.sh` (or `cd .pi/server && npm run build`) for the new title to take effect. `scripts/setup.sh` auto-sources `.env` for the build.
- **Public URL.** Default: `http://localhost:8080`. Override with `AGENTS_TEAM_SERVER_PUBLIC_URL` — set this to your **named** cloudflared tunnel hostname so HTML render / PDF URLs returned by tools are share-ready across sessions. (Quick tunnels rotate URLs on every restart; named tunnels are persistent.) Read at runtime, so a Pi restart is enough — no rebuild needed.
- **Chrome binary.** PDF export uses headless Chrome. Auto-detected on macOS (`/Applications/Google Chrome.app`), Linux, and Windows. Override with `AGENTS_TEAM_CHROME_PATH` if Chrome is installed elsewhere.
- **Pi auto-discovers** everything in `.pi/agents/`, `.pi/skills/`, and `.pi/extensions/` — no `settings.json` entry needed for in-repo code.
- **Installed npm packages** (recorded in `.pi/settings.json`, dropped into `.pi/npm/node_modules/`):
  - `@the-forge-flow/camoufox-pi` — stealth web fetcher + DuckDuckGo search via Camoufox (fingerprint-resistant Firefox fork). Backs the `research` skill. First call downloads the Camoufox binary (~500 MB). Install: `pi install -l npm:@the-forge-flow/camoufox-pi`.

## Local artifact server

The `server` extension boots a Next.js 16 + Nextra 4 dev server on port 8080 at session start. Renders land at `http://localhost:8080/v/<YYYY-MM-DD>-<slug>`; PDFs at `http://localhost:8080/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf` (the epoch suffix is appended on every export so regenerations don't hit a stale CDN cache; prior PDFs for the same title — across all dates — are auto-pruned once the new one is on disk). URL is the access control — anyone with the link can read; no auth, no listing (sidebar hidden, search index not built, sitemap not generated, 404 page is bare). Slugs are predictable from the title, so the URL is not secret — share each one deliberately.

To expose the server externally, run cloudflared yourself:

```bash
# Quick (URL rotates on restart):
cloudflared tunnel --url http://localhost:8080

# Named tunnel (persistent URL — recommended for AGENTS_TEAM_SERVER_PUBLIC_URL):
cloudflared tunnel create agents-team
cloudflared tunnel route dns agents-team renders.example.com
cloudflared tunnel run agents-team
```

First-time server setup:

```bash
cd .pi/server && npm install
```

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

In-repo extensions (`obsidian-vault`, `server`, `trade-journal`) auto-load `.env` from the repo root at startup via `.pi/lib/dotenv.ts`. Shell-exported values still win, so ad-hoc overrides work. `scripts/setup.sh` also sources `.env` before `npm run build` so build-time vars (the wordmark) get baked into the Nextra production output.

Vars worth setting:

- `AGENTS_TEAM_VAULT_PATH` — point at your real Obsidian vault elsewhere on disk.
- `AGENTS_TEAM_SERVER_PATH` — relocate the Next.js + Nextra server (default `.pi/server/`).
- `AGENTS_TEAM_SERVER_PORT` — port the dev server binds (default `8080`).
- `AGENTS_TEAM_SERVER_MODE` — `production` (default) or `dev` for `next dev --webpack` with hot reload.
- `AGENTS_TEAM_SERVER_TITLE` — wordmark + page-title suffix (default `agents-team`).
- `AGENTS_TEAM_SERVER_PUBLIC_URL` — base URL the tools return. Set to your named cloudflared tunnel hostname so HTML render / PDF URLs are share-ready.
- `AGENTS_TEAM_CHROME_PATH` — override Chrome binary used for PDF export (auto-detected on macOS / Linux / Windows by default).

## News brief cron

The `news` skill is backed by a daily-rolling JSON store at `.pi/state/news.json`. To populate it before you start your day (so `query_today` returns content without hitting the network), schedule [scripts/news-cron.sh](scripts/news-cron.sh) via `cron`:

```bash
# Once per morning at 07:00
crontab -l 2>/dev/null | { cat; echo "0 7 * * * $(pwd)/scripts/news-cron.sh"; } | crontab -

# Or hourly between 06:00 and 21:00
crontab -l 2>/dev/null | { cat; echo "0 6-21 * * * $(pwd)/scripts/news-cron.sh"; } | crontab -
```

The script runs `pi --no-session` against `news-ingest.refresh_all_topics`, which fetches every topic in `.pi/state/news-sources.json` and writes into the DB. Logs to `/tmp/agents-team-news-cron.log`. Requires `pi` on PATH and the laptop awake at trigger time (cron does **not** wake a sleeping Mac — use `launchd` if you need wake-on-fire).

If the cron is skipped (laptop closed, machine off, …), the `news-ingest` extension surfaces a `news: … — stale (cron skipped?). Run /news-refresh to refresh now.` line on the next Pi session start. `/news-refresh` runs the same full sweep manually, entirely inside the extension — no agent turn, no LLM cost. The DB is the day's working set; bookmarking is opt-in (the skill calls `note-taker` to copy an item into the vault on user request) — items are never auto-saved.

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

1. **Vault is markdown. HTML and PDF are on-demand derivatives served over HTTP.** Everything that needs to persist — PRDs, ADRs, reports, lesson plans, summaries, exec briefs, captures, journal entries — goes through `note-taker` and lands in the Obsidian vault as markdown with proper YAML frontmatter, inline `#tags`, and `[[wiki-links]]`. The vault is an Obsidian vault: graph view, backlinks, and tag search depend on it staying markdown-first. **HTML and PDF are separate, opt-in derivatives** served by the local Nextra server on port 8080: `render-html` produces a Nextra-rendered markdown page (DESIGN-2 parchment editorial styling, Mermaid diagrams, GFM callouts) at `http://localhost:8080/v/<YYYY-MM-DD>-<slug>`; `export` produces a print-ready Kami-styled PDF (parchment canvas, ink-blue accent, serif throughout, single chromatic hue) at `http://localhost:8080/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf` (epoch suffix = Unix seconds, freshly minted per regeneration so the CDN can't return a stale copy). The URL is the access control — anyone with the link reads; no auth, no listing. The agent's reply for a derivative is the http URL plus the markdown source path — **never** the rendered body inline, and **never** a list of URLs the user didn't ask for. Render only when the artifact would meaningfully benefit from on-screen reading (diagrams, tabs, callouts, timelines); export only when the artifact is a real deliverable that needs to be sent, printed, or formally archived (resume, letter, portfolio, report, slides). Short captures, agent-to-agent output, and PR-review artifacts stay markdown-only.
2. **Never write to the vault directly.** All vault writes go through `note-taker` (which calls `write_note`). All HTML renders go through `render-html` (which calls `write_html_render`). All PDF exports go through `export` (which calls `write_export_pdf`). These three skills are the only sanctioned writers.
3. **Tune outward-facing prose via Scribe.** When output is for a non-default audience, route through `scribe` rather than rephrasing inline.
4. **Trader is a student.** Never prescribes; only questions.
5. **Memory ops are quiet.** Operations on `.pi/state/` (reminders, profile updates, any other state) must not surface thinking blocks, diff visualizations, or prose summaries. Use purpose-built tools where they exist (`reminder_add` / `reminder_resolve` / `reminder_list` for reminders) instead of `read` + `edit`, so the TUI shows a one-line tool result rather than a diff. For profile updates: surface the `PROFILE_UPDATE` proposal text to the user for approval, then apply silently — no narration of what just changed.

## Build status

| Layer | Component | Status |
|---|---|---|
| 1 | Root session (`.pi/SYSTEM.md`) | Persona-adoption model (Path B) |
| Personas | pm, engineer, educator, language, trader | Skill bodies in `.pi/skills/<name>/SKILL.md` |
| Reviewers | prd-critic, uat-tester, red-team, assessment-grader, jlpt-examiner | Spawned as sub-sessions via `subagent` |
| Inner skills | All 18 (prd, roadmap, frontend, …) | Markdown content complete |
| 3 | note-taker, render-html, export, news, scribe | Skills present. `note-taker` enforces Obsidian conventions (frontmatter, tags, wiki-links). `render-html` reads vault markdown and emits a markdown body that Nextra serves at `/v/<YYYY-MM-DD>-<slug>`. `export` produces Kami-styled PDFs served at `/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf` (via headless Chrome) for deliverables — resume, letter, portfolio, report, slides, etc. The `-<epoch>` suffix is appended per export to defeat CDN caching; prior PDFs for the same title — across all dates — are unlinked automatically once the new one is on disk. `fetch_topic` is live — RSS-backed via `.pi/state/news-sources.json`; topics without a registry entry fall back to `research` (search-back). |
| 3 | research | Skill present. Backed by installed npm package `@the-forge-flow/camoufox-pi` (tools: `tff-fetch_url`, `tff-search_web`). |
| ext | subagent | Pi's example, with profile pre-load + `--system-prompt` patch |
| ext | obsidian-vault | Three tools: `write_note` (markdown → vault), `write_html_render` (md → `.pi/server/content/v/<date>-<slug>.mdx`), `write_export_pdf` (PDF → `<repo>/exports/<date>-<slug>-<epoch>.pdf` via headless Chrome, served by the Next.js route handler at `app/p/[slug]/route.ts` which reads from disk at request time). |
| ext | server | Lifecycles the Next.js / Nextra server (port 8080). Spawns on session_start; kills on Pi exit. Detects an already-bound port and skips spawn. |
| ext | trade-journal | Functional (read-side accessor) |
| ext | srs | Functional SM-2 scheduler; needs deck seeding |
| ext | news-ingest | Functional. Plain-fetch RSS/Atom from feeds listed per topic in `.pi/state/news-sources.json`. Hand-rolled RSS 2.0 + Atom 1.0 parser. Persists into `.pi/state/news.json` (plain JSON file), `(topic, url)` dedup, daily-purge on next write past local-day rollover. Four tools: `fetch_topic` (single topic, live fetch + write, 1h freshness cache), `query_today` (store-only read, no network), `get_item` (lookup by id, used by bookmark flow), `refresh_all_topics` (cron-driven full sweep). Topics with no registry entry return `fallback_hint: "no_rss_source"` so the `news` skill can delegate to `research`. On `session_start` surfaces `news: last scrape <date> (<relative>), <N> items in store` (or `No news` when empty). Slash commands: `/news-refresh` (manual full sweep, in-extension, no agent turn), `/show-news` (returns the `/news` page URL — Next.js route at `app/news/page.tsx` reads `news.json` on each request and offers a Highlights / All tab toggle). |
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
