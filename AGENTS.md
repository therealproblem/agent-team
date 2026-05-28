# Agents Team

A personal agent system built on the Pi coding agent harness (`@earendil-works/pi-coding-agent`, v0.74+).

## Architecture (3 layers, by isolation)

```
Layer 0   META                observes & optimizes the system
Layer 1   ROOT SESSION        single Pi session — adopts personas inline
          │
          ├── Personas (skills, inline)   pm · educator · language · trader
          │   no extra model loop per turn; the root IS the persona while it's on
          │   engineering requests route through pm, which spawns the engineer subagent
          │
          └── Reviewers (sub-agents)  prd-critic · uat-tester · red-team
                                      assessment-grader · jlpt-examiner
              blind by isolation — spawned via `subagent` when the active persona
              needs adversarial review
Layer 3   SHARED SERVICES     skills any persona can call inline
                              note-taker · show-md · render-html · export · news · scribe · research · summary · reminders · scout
```

The earlier model used a Distributor that spawned each domain as a separate Pi sub-session — paying a model loop per turn. **Path B** (current) pulls domain agents inline as personas: the root session reads a persona's `SKILL.md` and operates under those rules. Reviewers stay as sub-processes only when contamination would corrupt their judgment.

**Canonical persona registry:** `.pi/state/persona-registry.json` defines all top-level personas, their labels, skill paths, and inner skills. Adding/removing/renaming a persona requires updating only that file plus the persona's SKILL.md — statusline, docs, board validation, and Telegram dispatcher consume the registry.

## Pi mapping

| Architectural concept | Pi artifact |
|---|---|
| Layer 0 + 1 (Meta + root agent) | The single Pi session. `.pi/SYSTEM.md` is its system prompt — explains the persona model and routes to the right persona. |
| Personas (pm, educator, language, trader) | `.pi/skills/<name>/SKILL.md` — adopted by the root session by reading the file and following its instructions. Registered in `.pi/state/persona-registry.json`. Four inline personas; `engineer` is NOT a persona. |
| Reviewers (prd-critic, uat-tester, red-team, assessment-grader, jlpt-examiner) + scout + steelman + engineer | `.pi/agents/<name>.md` — spawned as isolated sub-Pi processes via the `subagent` extension. Pre-loaded with `_global.md` profile only — no domain profiles, to preserve blindness (reviewers) or model isolation (engineer, scout). Reviewers use isolation for blindness; `scout` uses it for cheap-model offload + context-noise isolation; `engineer` uses it for Sonnet execution with a clean card-focused context. |
| Inner skills (prd, frontend, kanji, journal, …) | `.pi/skills/<name>/SKILL.md` — Pi auto-discovers and loads on demand inside the active persona or subagent. Inner skills available under each persona/subagent are listed in the registry. |
| Layer 3 services (note-taker, show-md, render-html, export, news, scribe, research, summary, reminders, scout) | Same shape as inner skills — `.pi/skills/<name>/SKILL.md`, available under every persona. `scout` is a thin facade — the SKILL.md dispatches to `.pi/agents/scout.md` so the file-hunting work runs on a cheap model (`openai/gpt-5-mini` via Pi's `ELICE_GPT_5_MINI` provider) in an isolated sub-process. |
| Tool surfaces | TypeScript extensions in `.pi/extensions/` register tools via `defineTool` + `pi.registerTool`. |

## Specialization rule

> **Sub-session when contamination would corrupt the output, OR when cost / context isolation is the point. Inline (persona or skill) when shared context aids the work.**

A UAT tester or red-team reviewer *must* be blind to the implementer's reasoning. Same loop = same context = bias. Inline cannot enforce this; sub-sessions can.

Domain work *benefits* from continuity — the PM persona has access to the full session context when deciding whether to spawn the `engineer` subagent, and can pass rich briefs that reference earlier conversation. Don't pay for isolation that hurts collaboration.

See `~/.claude/plans/what-is-pi-code-steady-gray.md` for the full design rationale.

## Trader runs in student mode

Trader is uniquely **a student of the user's trading**. Never prescriptive. Surfaces patterns as Socratic questions only. Reflects "should I do X?" back at the user; refuses to call trades.

## Directory layout

```
.pi/
├── SYSTEM.md                  Root agent — persona-adoption rules
├── agents/                    Sub-Pi processes (reviewers + scout)
│   ├── prd-critic.md          spawned by pm persona
│   ├── uat-tester.md          spawned by engineer subagent
│   ├── red-team.md            spawned by engineer subagent
│   ├── assessment-grader.md   spawned by educator persona
│   ├── jlpt-examiner.md       spawned by language persona
│   └── scout.md               spawned by any persona via the `scout` Layer 3 skill — cheap-model file finder
├── skills/                    Personas + inner skills + Layer 3 services
│   ├── pm/SKILL.md            PERSONA
│   ├── educator/SKILL.md      PERSONA
│   ├── language/SKILL.md      PERSONA
│   ├── trader/SKILL.md        PERSONA
│   │
│   ├── note-taker/SKILL.md    Layer 3 (DEFAULT vault writer — markdown only, Obsidian-strict)
│   ├── show-md/SKILL.md       Layer 3 (DEFAULT display surface — opens vault markdown in a tmux side pane via `leaf`. Called after note-taker on every reply that names a vault md path.)
│   ├── render-html/SKILL.md   Layer 3 (md → Nextra HTML page served at /v/<YYYY-MM-DD>-<slug> on :8080)
│   ├── export/SKILL.md        Layer 3 (md → Kami-styled PDF served at /p/<YYYY-MM-DD>-<slug>-<epoch>.pdf on :8080; each regeneration gets a fresh epoch suffix to defeat CDN caching, and prior PDFs for the same title — across all dates — are auto-pruned after the new one is on disk)
│   ├── news/SKILL.md          Layer 3
│   ├── scribe/SKILL.md        Layer 3
│   ├── research/SKILL.md      Layer 3 (online research via camoufox-pi)
│   ├── summary/SKILL.md       Layer 3 (inline TL;DR of a URL or pasted text — paired with research; no vault write, no HTML, no PDF)
│   ├── reminders/SKILL.md     Layer 3 (capture / resolve persistent todos)
│   ├── scout/SKILL.md         Layer 3 (file finder — dispatches to `.pi/agents/scout.md` sub-agent on `openai/gpt-5-mini` so the hunt is cheap and doesn't bloat root context. Returns paths + short previews across repo + vault + `.pi/state/`.)
│   │
│   ├── prd/SKILL.md           inner (pm)
│   ├── roadmap/SKILL.md       inner (pm)
│   ├── stakeholder-summary/SKILL.md   inner (pm)
│   ├── frontend/SKILL.md      inner (engineer subagent)
│   ├── backend/SKILL.md       inner (engineer subagent)
│   ├── uiux/SKILL.md          inner (engineer subagent)
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
│   ├── tmux-host/             At module-load (before any session_start handler), re-execs the process as `tmux new-session -A -s pi pi <argv>` when `$TMUX` is unset and the invocation is interactive (no `--no-session`/`-p`/`--prompt`). Result: every interactive Pi session runs inside the `pi` tmux session, which the `show-md` skill's side-pane viewer depends on. Sentinel env var `AGENTS_TEAM_NO_TMUX_REEXEC=1` disables the re-exec (set automatically on the inner pi after re-exec; set manually in cron / CI / embedded contexts).
│   ├── show-md/               Registers `show_md` — opens a vault markdown file in a tmux side pane via `leaf` (`tmux split-window -h 'leaf <abs path>'`). The new pane takes focus; `q` closes leaf (and the pane), `Ctrl-b o` cycles back to Pi without closing, `Ctrl-b x` kills the pane outright. Silent no-op when `$TMUX` is unset.
│   ├── subagent/              Official Pi example — spawns reviewer sub-sessions
│   ├── obsidian-vault/        Registers `write_note` (markdown → vault), `write_html_render` (md → `<vault>/artifacts/renders/<date>-<slug>.mdx`), `write_export_pdf` (Kami HTML → PDF → `<vault>/artifacts/exports/<date>-<slug>-<epoch>.pdf`, served by the Next.js route handler at `app/p/[slug]/route.ts` which reads from disk at request time; each regeneration appends a fresh Unix-epoch suffix so the URL is never reused).
│   ├── server/                Subscribes to `session_start`; spawns `next start` (production, from pre-built `.next/`) on :8080 from `.pi/server/`, kills on Pi exit. Bails with a clear message if `.next/` is missing — run `bash scripts/setup.sh` (or `pnpm build` in `.pi/server/`) to produce it. Surfaces ready/failed status as a TUI message.
│   ├── news-ingest/           Registers `fetch_topic`, `query_today`, `get_item`, `refresh_all_topics`. Fetches RSS/Atom feeds (plain Node `fetch`, no Camoufox) and persists into a daily-rolling JSON store at `.pi/state/news.json` (auto-purged on day rollover). Source registry: `.pi/state/news-sources.json` (topic → [feed URLs]). Topics absent from the registry return `fallback_hint: "no_rss_source"` so the `news` skill delegates to `research`. Cron-driven by `scripts/news-cron.sh`. Surfaces a `news: last scrape …` line on `session_start` (or `No news` when empty). Slash commands: `/news-refresh` (manual full sweep, in-extension), `/show-news` (returns the `/news` page URL — Next.js route at `app/news/page.tsx` reads `news.json` on each request, Highlights / All toggle). Used by `news` skill.
│   ├── srs/                   Registers `list_due`, `record`, `add_item`.
│   ├── trade-journal/         Registers `list_trades`, `read_trade`.
│   └── reminders/             Subscribes to `session_start`; surfaces open items from `<vault>/.memory/reminders.md` as a TUI message.
└── server/                    Next.js 16 + Nextra 4 app — serves HTML renders at /v/<date>-<slug> and PDFs at /p/<date>-<slug>-<epoch>.pdf on port 8080. Themed with the OpenWeb parchment palette (DESIGN-2). Boots automatically via the `server` extension. No auth — URL is the access control.
```

## Configuration

- **Vault location.** Default: project-root `vault/` (gitignored). Override with the `AGENTS_TEAM_VAULT_PATH` env var if you want notes to land in your real Obsidian vault elsewhere on disk. Used by `obsidian-vault` and `trade-journal` extensions.
- **Server location.** Default: project-root `.pi/server/`. Override with `AGENTS_TEAM_SERVER_PATH`. Houses the Next.js + Nextra app that serves renders and PDFs.
- **Server port.** Default: `8080`. Override with `AGENTS_TEAM_SERVER_PORT`.
- **Server mode.** Default: `production` (spawns `next start` against the pre-built `.next/`). Set `AGENTS_TEAM_SERVER_MODE=dev` (or `development`) to spawn `next dev --webpack` with hot reload — the build-dir check is skipped and the first request compiles on demand.
- **Server title.** Default: `agents-team`. Override with `AGENTS_TEAM_SERVER_TITLE` — appears as the wordmark in the top-left navbar and as the suffix on every page's `<title>`. **Read at build time**, not runtime: `layout.tsx` is statically pre-rendered, so the value is baked into `.pi/server/.next/`. Change the var, then re-run `bash scripts/setup.sh` (or `cd .pi/server && pnpm build`) for the new title to take effect. `scripts/setup.sh` auto-sources `.env` for the build.
- **Public URL.** Default: `http://localhost:8080`. Override with `AGENTS_TEAM_SERVER_PUBLIC_URL` — set this to your **named** cloudflared tunnel hostname so HTML render / PDF URLs returned by tools are share-ready across sessions. (Quick tunnels rotate URLs on every restart; named tunnels are persistent.) Read at runtime, so a Pi restart is enough — no rebuild needed.
- **Chrome binary.** PDF export uses headless Chrome. Auto-detected on macOS (`/Applications/Google Chrome.app`), Linux, and Windows. Override with `AGENTS_TEAM_CHROME_PATH` if Chrome is installed elsewhere.
- **Disable auto-tmux.** Set `AGENTS_TEAM_NO_TMUX_REEXEC=1` to skip the `tmux-host` extension's re-exec into tmux. Required in cron / CI / embedded contexts where there's no TTY for tmux to attach to. Belt-and-braces only — the extension already detects `--no-session`/`-p`/`--prompt` and skips. `scripts/news-cron.sh` exports this var by default.
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
cd .pi/server && pnpm install
```

## Layer 0 — Meta (per-domain user model)

`<vault>/.memory/profiles/` contains markdown files that build the system's understanding of *who you are* in each domain. Loaded on demand by personas (when adopted) or by reviewers (via the subagent extension's profile pre-load). Override the root via `AGENTS_TEAM_MEMORY_PATH` or move the whole vault via `AGENTS_TEAM_VAULT_PATH`.

| File | Loaded by |
|---|---|
| `_global.md` | every persona + every reviewer — interaction-style preferences |
| `product.md` | pm persona |
| `engineering.md` | engineer subagent |
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

In-repo extensions (`obsidian-vault`, `server`, `trade-journal`) auto-load `.env` from the repo root at startup via `.pi/lib/dotenv.ts`. Shell-exported values still win, so ad-hoc overrides work. `scripts/setup.sh` also sources `.env` before `pnpm build` so build-time vars (the wordmark) get baked into the Nextra production output.

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
6. **Markdown surfaces open in tmux side panes by default, and the chat reply collapses when they do.** When a persona's reply names a vault markdown file the user is meant to read, it also calls `show-md` to open the file in a tmux side pane via `leaf`. **When `show-md` returns `opened: true`, the chat reply shrinks to one line — the file path plus at most one sentence of context (next step, follow-up question, an offer to also render HTML/PDF). Do not also paste the file's tables, bullet lists, headings, key-points, or active-recall questions into chat — leaf is already rendering them in the side pane, and duplicating the body forces the user to read everything twice.** When `show-md` no-ops (`opened: false` — `not_in_tmux` / `not_found`), fall back to the persona's normal reply (which may include a short summary). Skip `show-md` entirely for agent-to-agent output (reviewers, sub-sessions), headless runs (`--no-session`, cron), and replies that don't surface a file path. The `tmux-host` extension guarantees the Pi session is inside tmux for every interactive run, so the split-pane is reliably available; on the rare headless paths the tool silently no-ops. `show-md` is independent of `render-html` and `export` — call any combination when warranted.

## Build status

| Layer | Component | Status |
|---|---|---|
| 1 | Root session (`.pi/SYSTEM.md`) | Persona-adoption model (Path B) |
| Personas | pm, educator, language, trader | Skill bodies in `.pi/skills/<name>/SKILL.md` |
| Reviewers | prd-critic, uat-tester, red-team, assessment-grader, jlpt-examiner | Spawned as sub-sessions via `subagent` |
| Sub-agents (non-reviewer) | scout | `.pi/agents/scout.md` — file finder, pinned to `openai/gpt-5-mini` (via Pi's `ELICE_GPT_5_MINI` provider), `thinking: minimal`, tools `read, bash`. Dispatched via the `scout` Layer 3 skill. |
| Inner skills | All 18 (prd, roadmap, frontend, …) | Markdown content complete |
| 3 | scout | Skill present at `.pi/skills/scout/SKILL.md`; agent at `.pi/agents/scout.md`. Persona-callable Layer 3 facade that dispatches to a sub-Pi process on `openai/gpt-5-mini` (Pi's `ELICE_GPT_5_MINI` provider — no external API key needed) to find files across repo + vault + `.pi/state/`. Returns JSON `{path, line?, preview}` array, max 20, repo-relative. Read-only by tool surface. |
| 3 | note-taker, render-html, export, news, scribe | Skills present. `note-taker` enforces Obsidian conventions (frontmatter, tags, wiki-links). `render-html` reads vault markdown and emits a markdown body that Nextra serves at `/v/<YYYY-MM-DD>-<slug>`. `export` produces Kami-styled PDFs served at `/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf` (via headless Chrome) for deliverables — resume, letter, portfolio, report, slides, etc. The `-<epoch>` suffix is appended per export to defeat CDN caching; prior PDFs for the same title — across all dates — are unlinked automatically once the new one is on disk. `fetch_topic` is live — RSS-backed via `.pi/state/news-sources.json`; topics without a registry entry fall back to `research` (search-back). |
| 3 | research | Skill present. Backed by installed npm package `@the-forge-flow/camoufox-pi` (tools: `tff-fetch_url`, `tff-search_web`). |
| ext | subagent | Pi's example, with profile pre-load + `--system-prompt` patch |
| ext | obsidian-vault | Three tools: `write_note` (markdown → vault), `write_html_render` (md → `<vault>/artifacts/renders/<date>-<slug>.mdx`), `write_export_pdf` (PDF → `<vault>/artifacts/exports/<date>-<slug>-<epoch>.pdf` via headless Chrome, served by the Next.js route handler at `app/p/[slug]/route.ts` which reads from disk at request time). |
| ext | server | Lifecycles the Next.js / Nextra server (port 8080). Spawns on session_start; kills on Pi exit. Detects an already-bound port and skips spawn. |
| ext | trade-journal | Functional (read-side accessor) |
| ext | srs | Functional SM-2 scheduler; needs deck seeding |
| ext | news-ingest | Functional. Plain-fetch RSS/Atom from feeds listed per topic in `.pi/state/news-sources.json`. Hand-rolled RSS 2.0 + Atom 1.0 parser. Persists into `.pi/state/news.json` (plain JSON file), `(topic, url)` dedup, daily-purge on next write past local-day rollover. Four tools: `fetch_topic` (single topic, live fetch + write, 1h freshness cache), `query_today` (store-only read, no network), `get_item` (lookup by id, used by bookmark flow), `refresh_all_topics` (cron-driven full sweep). Topics with no registry entry return `fallback_hint: "no_rss_source"` so the `news` skill can delegate to `research`. On `session_start` surfaces `news: last scrape <date> (<relative>), <N> items in store` (or `No news` when empty). Slash commands: `/news-refresh` (manual full sweep, in-extension, no agent turn), `/show-news` (returns the `/news` page URL — Next.js route at `app/news/page.tsx` reads `news.json` on each request and offers a Highlights / All tab toggle). |
| ext | reminders | Functional. Surfaces a numbered list from `<vault>/.memory/reminders.md` on `session_start` via `pi.sendMessage`. Registers `/clear <N>` slash command — clears reminder by index directly from the extension, no agent turn. Tools: `reminder_add`, `reminder_resolve` (fallback for natural-language resolves), `reminder_list`. |
| ext | tmux-host | Re-execs Pi as `tmux new-session -A -s pi pi <argv>` at module-load time when `$TMUX` is unset and the invocation is interactive. No tools, no session_start hook — all logic is top-level so it runs before any other extension's handlers can fire. Skip conditions: `$TMUX` set, `AGENTS_TEAM_NO_TMUX_REEXEC=1`, argv contains `--no-session`/`-p`/`--prompt`. |
| ext | show-md | Registers `show_md`. Opens a vault markdown file in a tmux side pane via `leaf` (`tmux split-window -h 'leaf <abs path>'`). The new pane takes focus; tool result text reminds the user that `q` closes leaf, `Ctrl-b x` kills the pane, `Ctrl-b o` cycles back to Pi. Returns silent no-op (`opened: false, reason: "not_in_tmux"`) when `$TMUX` is unset. Vault root resolved from `AGENTS_TEAM_VAULT_PATH` or `<repo>/vault`. |
| 3 | show-md | Skill present. Default display surface — called after `note-taker` on every reply that surfaces a vault markdown path the user is meant to read. Additive (the reply still names the path). |

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
pi --no-session -p "Adopt the pm persona and reply PI-OK."
```
