# agents-team

A personal **team of AI agents** built on the [Pi coding-agent harness](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). One terminal session, many roles - product manager, engineer, educator, language coach, trading student - each with its own skills, reviewers, and memory of who you are in that domain.

The aim is a long-running personal operating layer: you talk to it from the CLI or from Telegram, it writes to your Obsidian vault, renders artifacts as web pages or PDFs, and learns your preferences across sessions.

## What this project is

A single Pi session that **adopts a persona** for the work in front of it instead of routing every request to a separate sub-agent. The PM persona drafts a PRD and hands a kanban card to the `engineer` subagent (Sonnet, isolated child process) to build against it; the educator persona writes a lesson plan; the language persona drills you on JLPT vocab. Same session, same memory of you - different rules and skills active depending on which persona is on.

Reviewers (PRD-critic, UAT-tester, red-team, assessment-grader, JLPT-examiner, steelman) and a handful of utility executors (engineer, scout, render-html, render-pdf) run as **isolated sub-sessions** - for blind audit, model isolation, context isolation, or cost.

Everything that matters gets written to a **markdown-first Obsidian vault**. HTML renders and PDF exports are on-demand derivatives served by a local Next.js + Nextra site on port 8080 - the URL is the access control.

## Architecture

Three layers, organised by isolation rather than capability:

```
Layer 0   META                observes & optimises the system across sessions
Layer 1   ROOT SESSION        one Pi session - adopts personas inline
          │                   openai/gpt-5.5 (1M ctx)
          │
          ├── Personas              pm · educator · language · trader
          │   no extra model loop per turn; the root IS the persona while it's on
          │   engineering requests route through pm, which spawns the engineer subagent
          │
          ├── Executor (sub-agent)  engineer (Sonnet 4.5)
          │   isolated child process - code, tests, kanban card updates
          │
          └── Reviewers (sub-agents)  prd-critic · uat-tester · red-team
                                      assessment-grader · jlpt-examiner · steelman
              blind by isolation - adversarial second opinion
Layer 3   SHARED SERVICES     skills any persona can call inline
                              note-taker · show-md · render-html · export
                              research (9-skill orchestrator) · scout
                              scribe · summary · news · reminders
```

**The specialization rule:** sub-session when keeping context separate is worth the round-trip - either because contamination would corrupt the output (blind reviewers), because the work needs a different model (engineer on Sonnet, renderers on Gemini), or because the exploration is high-token but low-reasoning and shouldn't bloat root context (scout, render planners). Inline (persona or skill) when shared context aids the work. A UAT tester *must* be blind to the implementer's reasoning, so it gets its own process. PM drafting a PRD benefits from continuity with the user's prior turns, so it stays inline.

### Model fleet

Per-agent models are pinned via the subagent extension's frontmatter `model:` field - three vendors active across the team:

| Role | Model | Why |
|---|---|---|
| Root session | `openai/gpt-5.5` (1M ctx) | Long-running session needs the context window |
| `engineer`, `uat-tester` | `anthropic/claude-sonnet-4-5` | Tool-heavy code work + multi-step interpretation |
| `prd-critic`, `assessment-grader` | `openai/gpt-5.4` | Cross-vendor PRD audit + grading |
| `red-team` | `openai/gpt-5.5` | Adversarial review on the 1M-ctx model - same vendor as root |
| `jlpt-examiner`, `render-html`, `render-pdf` | `google/gemini-3.1-pro-preview` | Mermaid/SVG quality + JLPT linguistics |
| `scout`, `steelman` | `openai/gpt-5-mini` | Cheap models for high-token, low-reasoning sub-tasks |

Reviewers all run through Pi's `openai-completions` / `openai-responses` shim but stay tool-light (read-only) so shim risk stays low.

### Pi mapping

| Concept | Pi artifact |
|---|---|
| Root agent (Layer 0 + 1) | The Pi session itself. `.pi/SYSTEM.md` is its system prompt. |
| Personas | `.pi/skills/<name>/SKILL.md` - adopted inline by reading the file. (No `engineer` persona - engineering routes through `pm`, which spawns the `engineer` subagent.) |
| Executor + reviewer subagents | `.pi/agents/<name>.md` - spawned as isolated sub-Pi processes via the `subagent` extension. Per-agent model pinned in frontmatter. |
| Inner skills (prd, frontend, kanji, journal, ...) | `.pi/skills/<name>/SKILL.md` - Pi auto-discovers and loads on demand. |
| Shared services | Same shape as inner skills, available under every persona. |
| Tool surfaces | TypeScript extensions under `.pi/extensions/` (server, telegram-bot, working-mood, obsidian-vault, news-ingest, reminders, ...). |

### Per-domain memory of you

`.pi/state/profiles/` builds the system's model of who you are in each domain:

| File | Loaded by |
|---|---|
| `_global.md` | every persona + every reviewer |
| `product.md` | pm persona |
| `engineering.md` | engineer subagent |
| `learning.md` | educator persona |
| `language.md` | language persona |
| `trading.md` | trader persona |

Personas read their profile at adoption time; the engineer subagent reads `engineering.md` at spawn time. Reviewers only get `_global.md` - domain context would compromise their blind audit. At session end the active persona can propose a `PROFILE_UPDATE` for you to approve or reject; nothing is written unsupervised.

### Vault, renders, exports

Everything that persists is markdown in the vault. Three display surfaces sit on top of it - orthogonal, not alternatives:

| Surface | Skill | Where |
|---|---|---|
| Terminal, next to Pi | `show-md` | tmux split-pane, rendered by `leaf` |
| Web browser | `render-html` | Nextra HTML at `http://localhost:8080/v/<YYYY-MM-DD>-<slug>` |
| PDF (printable / sendable) | `export` | Kami-styled PDF at `http://localhost:8080/p/<YYYY-MM-DD>-<slug>.pdf` |

- **Vault is markdown.** PRDs, ADRs, reports, lesson plans, journal entries - everything that needs to persist goes through the `note-taker` skill and lands in the Obsidian vault as markdown with YAML frontmatter, inline `#tags`, and `[[wiki-links]]`. Graph view and backlinks depend on staying markdown-first.
- **`show-md` is the default.** Whenever a reply names a vault file the user is meant to open, `show-md` calls `leaf` in a tmux split so the markdown renders next to the Pi pane. The chat reply collapses to a one-line pointer - no body recap - because the side pane is the visible signal.
- **HTML renders** are opt-in. `render-html` produces a Nextra-styled page — useful when diagrams, tabs, or callouts make on-screen reading meaningfully better. Now dispatched via an isolated `render-html` subagent (Gemini 3.1 Pro for Mermaid/SVG quality), with a planner-first split: large outputs become multi-part renders with a sidebar parts nav, streamed per-part URLs as each part verifies. Generated MDX sources live at `renders/` (a real directory at project root for easy editing access). Mermaid charts are numbered (“Chart N”), show a `lucide` spinner + “Rendering chart N…” caption while `mermaid.render()` is in flight (120 px min-height so the article column doesn’t reflow when the SVG arrives), and broken charts surface an in-page **Fix syntax** button that repairs the source via `pi --mode json -p` and dual-writes the page + vault note. Every chart is also click-to-expand into a fullscreen lightbox with vector-crisp pinch/wheel zoom and drag pan (mobile + desktop, mouse + touch). LaTeX math renders via KaTeX (`$x^2$` inline, `$$\int…$$` block, pre-rendered at compile time so no client-side math layout cost). The on-page TOC tracks scroll position with a continuous left rail behind every item and a burnt-umber progress fill from the top down to the active section’s centre; the active row gets a cloud-fog chip and 4px bar in both the desktop sidebar and the mobile sheet. In dark mode, Mermaid edge strokes and arrowheads repaint to a warm beige so the connecting lines stay legible against the near-black page.
- **PDF exports** are for deliverables. `export` produces a print-ready, Kami-styled PDF (parchment canvas, ink-blue accent, serif throughout) - for resumes, letters, portfolios, formal reports. Dispatched via the `render-pdf` subagent on the same Gemini model. Exported PDFs live under `exports/` at the project root. When the Telegram bot sees a `/p/<file>.pdf` URL in a reply, it uploads the on-disk file as a real Telegram document instead of just linking.

The URL is the access control. No auth, no listing, no search index, no sitemap. To share externally, run cloudflared yourself (see below).

### Research orchestrator

`research` is a 9-skill pipeline over stealth web fetch + search (`camoufox-pi`), with tree-shaped state per run:

```
research-frame → research-tree.start_run → research-survey → source-rank
  → fetch loop (research-branch · triangulate · steelman)
  → synthesize → research-stop-check → note-taker → render-html / export
```

State moves through `.pi/state/research/<run>/research-tree.json` rather than a flat history - the last 10 finished runs stay queryable so "what did I research recently?" returns real answers. `steelman` runs as a blind reviewer for disconfirming evidence; `triangulate` enforces a common-origin check (5 tertiaries citing one primary = 1 data point, not 5). `synthesize` is reusable outside research - any structured deliverable with TL;DR + claim-level citations + a mandatory "What's contested" section.

### Project board

Each project under `<vault>/projects/<slug>/` has a kanban board served at `http://localhost:8080/projects/<slug>`. Seven columns - **Request → Triage → Backlog → Blocked → In Progress → In Review → Done** - read top-to-bottom as a card's life cycle. The project header shows the short `description:` from `project.md` frontmatter; a **Details** button opens a dialog with the full markdown body compiled through the existing MDX pipeline.

The page header also carries a **Submit request** form - the only sanctioned UI → vault write path in the whole system. Submissions write a card immediately into the Request column with a placeholder title (first eight words of the description) and `title_pending: true`, then fire Pi in the background to generate a real title; `CardItem` shows an italicised placeholder + spinner while pending and the board polls every 3s (capped at 90s) until everything settles. PM picks up requests via a triage workflow: pick-up → triage → blocked-on-user → engineer feasibility → decide → handoff to engineer to break the request down into Backlog cards.

Cards open into a detail dialog with the body rendered through a CommonMark/GFM pipeline (not MDX - chokes on user text like `**<1s**`), tags pinned right under the status pills so they're visible without scrolling, and `max-h` + `overflow-y-auto` so tall cards don't fall off the viewport. `[[wiki-links]]` in the body are resolved to `/v/<slug>` for any matching vault note and rendered as clickable links (with an "unrendered" affordance when the target hasn't been published yet). The kanban view also polls every 3s so cards that agents edit in the background appear without a manual refresh.

Cards carry:

- **Unique ID + short link.** Every card has a UUID `id:` stamped at creation. The dialog header carries a *copy link* chip that yields `http://localhost:8080/c/<id>` — the resolver scans every project's `board/` for the matching id and redirects to `/projects/<slug>?card=<cardSlug>`, opening the dialog deep-linked. Closing the dialog strips the `card` query param so a refresh doesn't re-open it. Shared links survive project/card renames; only deletion breaks them.
- **`board_create_card` Pi tool.** Card creation goes through a typed extension tool, not raw markdown edits. Agents pass `{project_slug, title, persona, body, status?, priority?, ...}`; the tool stamps the UUID, slugifies the title for the filename (collision suffix on dupes), writes the frontmatter + body atomically, and returns `{id, projectSlug, cardSlug, url, vaultPath}`. PM's rule is to **surface the returned `url` in its reply** so a click takes you straight to the card.
- **Comments + PM auto-reply.** Comments are a structured frontmatter array `{author, role, ts, body}`. You post via the dialog form; the server appends `role: user`, flips `pm_reply_pending: true`, and starts a per-card debounce (default 30s, `AGENTS_TEAM_PM_REPLY_DEBOUNCE_MS`). New comments on the same card reset the timer so PM addresses the whole burst in one reply. When the timer fires, the server spawns `pi --no-session` with a prompt that adopts PM, reads the thread, optionally spawns engineer for feasibility, and posts a `role: pm` comment via the **`board_add_comment`** Pi tool. That clears the spinner and (if Telegram is wired) PM also sends a one-line notice with the card title + `/c/<id>` link via `telegram_send`. The dialog shows a "PM is drafting a reply…" row with a spinner while pending, and `BoardView` polls every 3s (10-min cap for replies) until it lands. A `sweepStalePendings()` self-heal walks the vault on the next user comment after a server restart and re-fires any leftover `pm_reply_pending` flags.
- **Mark as Done / Reopen.** Buttons in the dialog footer flip `status: done` or move a done card back to `status: backlog` (not `in_progress` — coming off a done streak feels more like backlog than picking up halfway). Atomic write + `updated:` bump in one shot.
- **Priority + filter.** `p0`..`p3` chip on every column card; `?priority=p0..p3` URL filter in the Filters bar alongside persona.
- **Unblock flow.** Button only when `status: blocked`; opens a dialog that requires a comment explaining the unblock, then writes the comment and sets `status: backlog` in one atomic write.
- **Soft delete.** Cards move to `board/_archive/<slug>.md`, whole projects move to `projects/_archive/<slug>/` with `status: archived` stamped on the moved `project.md`. The loader skips `_archive` dirs so deleted cards/projects fall off the board.

### scout - file finder on a cheap sub-agent

`scout` is a Layer 3 skill that delegates file/path/symbol lookup to an isolated sub-Pi process pinned to `openai/gpt-5-mini`. Read-only (read + bash), returns `{path, line?, preview}` across repo + vault + `.pi/state/`. The "ls 50 dirs, grep 30 files, return 3 matches" exploration stays out of root context and off the root model's token bill.

### Telegram channel

The same Pi session is reachable from a Telegram bot. The extension runs a `getUpdates` long-poll loop inside Pi - no public URL needed; works from a laptop with no inbound networking.

**When Pi exits the bot goes offline** - the long-poll loop stops, and every allowed chat receives a final `(pi shut down)` message so users know the agent went away (only fires on a real quit, not on a session swap; bounded by a 4s timeout so a hung network can't block exit). If the long-poll loop errors mid-session — auth revoked, network gone, Telegram side rejecting — the bot broadcasts `(pi disconnected)` instead so users aren't left wondering. There's exactly one Pi session backing all chats - DMs and groups share context. Each turn arrives in Pi prefixed `[From Telegram @<username>] ...` so the agent knows the origin; replies route back to the originating chat automatically. A single-instance polling lock prevents a second Pi session (or a fresh `/reload`) from racing the first for `getUpdates`; the new module waits until the previous lock is released before taking over.

Setup is a single slash command inside Pi: `/telegram-connect`. The first invocation prompts for a bot token from `@BotFather` (or accepts it as `/telegram-connect <token>`), registers slash commands + the Menu button with Telegram, brings the bot online, and - if the allowlist is empty - opens a prompt for the chat id(s) you want to allow. To discover a chat id, DM the bot `/start`: it replies with the chat's id even when not allowlisted (the only message it sends to non-allowlisted chats).

The bot listens "always" in groups (every message enters the context as steering) but only triggers a turn when `@<persona>` is mentioned, `/<persona>` is used, or a user replies to one of the bot's own messages. In DMs every message triggers a turn - no `@` needed. `/stop` cancels the in-flight agent turn from any chat. Long replies are converted from markdown to Telegram-flavored HTML (`<b>`, `<i>`, `<code>`, `<pre>`, `<a>`) and chunked at the 4096-char limit. Inline keyboards attach only when the reply contains an artifact URL or a `PROFILE_UPDATE:` proposal - no default persona switcher.

Telegram chats can also send `/new` (start a fresh Pi conversation) and `/compact` (compact the current context) - both are routed via `tmux send-keys` to the running Pi pane, and `/start` lists them in the onboarding reply so new chats discover them.

The footer in Pi grows a `| TG ●` cell next to `| SRV ...` when the bot is online. See `.pi/SYSTEM.md` § "Telegram channel" for the rules the agent follows on Telegram-originated turns.

**Outbound `telegram_send` tool.** A Pi-callable tool lets any persona push a proactive message to allowed chats — used by PM to announce comment replies (with the card title + `/c/<id>` deep link), and by `news-cron.sh` to deliver a top-3-per-topic digest to your Telegram after each 07:00 refresh. The server doesn't push directly any more; everything outbound goes through this tool so message formatting, allowlist enforcement, and rate-limit handling live in one place.

### Working-mood indicator

Pi's default braille spinner is overridden by the in-repo `working-mood` extension - 28 kaomoji-verb frames rotate every 5s with an elapsed-time counter (`Ns / Mm Ss / Hh Mm`) ticking in muted color every 1s. Reliable in any terminal locale, no font dependency.

### A note on Trader

Trader runs in **student mode**. It never prescribes a trade. It surfaces patterns from your journal as Socratic questions, reflects "should I do X?" back at you, and refuses to call directional decisions. The point is to sharpen your own judgement, not to outsource it.

## Direction

The current shape is the second iteration. The first ("Distributor") spawned every domain as its own Pi sub-session, paying a model loop per turn for the routing overhead. The current shape pulls domain agents **inline as personas** - the root session reads a persona's `SKILL.md` and operates under those rules.

Sub-sessions have come back selectively, with a sharper rationale than "blind review." Three additional reasons now justify a child process: **model isolation** (engineer needs Sonnet, renderers need Gemini), **context isolation** (a 50-grep file hunt shouldn't bloat root), and **cost** (cheap models for high-token, low-reasoning sub-tasks). Engineer, scout, render-html, render-pdf, and steelman are recent expressions of this.

Where it's heading:

- **Web frontend** - not currently wired in; being rebuilt from scratch. Entry points today are the CLI (`pi` from the repo root) and the Telegram bot (see § Telegram channel above).
- **Layer 0 meta-review** - surfacing cross-domain patterns and contradictions across profiles as the system accumulates a real model of you.
- **Richer service surface** - `news-ingest` is wired with a daily 07:00 cron refresh + Telegram digest push; the `srs` extension grew a `srs.import_csv` tool for batch JLPT vocab seeding (so you can import a CSV deck in one call instead of card-by-card); the trade-journal accessor is read-only for now.

See `AGENTS.md` for the long-form internal design doc, including current build status per component.

## Setup

Prerequisites: macOS or Linux, Node ≥ 20, Homebrew (macOS) or apt/dnf/pacman (Linux), and Google Chrome for PDF export.

```bash
git clone <this-repo>
cd agents-team
bash scripts/setup.sh
```

The bootstrap script is idempotent and handles:

1. tmux install + Pi-friendly key config (`extended-keys`, csi-u modifier encoding)
2. Pi runtime install (`@earendil-works/pi-coding-agent`)
3. Pi project-local packages (replayed from `.pi/settings.json` - notably `@the-forge-flow/camoufox-pi` for the `research` skill)
4. Local patches against vendored npm packages (`scripts/patches/`)
5. `.env` scaffold from `.env.example` (preserves existing `.env`)
6. `exports/` directory + `.pi/server/public/p` → `exports/` symlink for PDF serving
7. Nextra server `npm install` in `.pi/server/`
8. Stops only the process bound to `AGENTS_TEAM_SERVER_PORT` (default 8080) so the rebuild doesn't fight a stale server - unrelated Node servers and Pi sessions on the same machine are left alone, and the script won't suicide when launched from inside a Pi session
9. Nextra production build (`next build`) - `.env` is sourced first so build-time vars get baked in
10. Chrome auto-install via `@puppeteer/browsers` when no system Chrome is found, pinned into `.env` as `AGENTS_TEAM_CHROME_PATH` (path is quoted because Chrome-for-Testing's path contains spaces)
11. Python research deps (`beautifulsoup4` + `requests`) installed to `--user` via `python3 -m pip` so the `research` skill's batch URL-fetch heredoc doesn't die with `ModuleNotFoundError`. Retries with `--break-system-packages` on PEP 668 systems.
12. `news-cron` crontab entry (`0 7 * * * scripts/news-cron.sh`) installed idempotently. Soft-fails with a Full Disk Access hint when macOS TCC denies the spool write so the rest of setup still completes.

Then start the agent:

```bash
pi
```

The Nextra server boots automatically on `:8080` at session start.

### Smoke tests

```bash
# Pi loads and discovers everything
pi --no-session -p "List your tools, skills, and agents."

# Subagent spawn works
pi --no-session -p "Use subagent with agentScope:'project', agent:'prd-critic', task:'Reply with PI-OK only.'"

# Persona adoption (inline)
pi --no-session -p "Adopt the pm persona and reply PI-OK."
```

### Sharing renders externally

The local server has no auth. To expose it, run cloudflared yourself:

```bash
# Quick tunnel (URL rotates on every restart):
cloudflared tunnel --url http://localhost:8080

# Named tunnel (persistent - recommended):
cloudflared tunnel create agents-team
cloudflared tunnel route dns agents-team renders.example.com
cloudflared tunnel run agents-team
```

Then point `AGENTS_TEAM_SERVER_PUBLIC_URL` at the named tunnel hostname so the URLs returned by `render-html` and `export` are share-ready across sessions.

## Environment variables

All vars are optional. Project-local secrets and overrides live in `.env` (gitignored) - copy from `.env.example` and uncomment what you want to set. The in-repo extensions auto-load `.env` at startup, and `scripts/setup.sh` sources it before the Nextra build. Shell-exported values still win, so ad-hoc overrides work:

```bash
AGENTS_TEAM_SERVER_TITLE=experimental pi
```

| Variable | Default | Purpose |
|---|---|---|
| `AGENTS_TEAM_VAULT_PATH` | `<repo>/vault/` | Path to the Obsidian vault. Point this at your real vault elsewhere on disk to have all notes land there. Used by the `obsidian-vault` and `trade-journal` extensions. |
| `AGENTS_TEAM_SERVER_PATH` | `<repo>/.pi/server/` | Location of the Next.js + Nextra app that serves renders and PDFs. |
| `AGENTS_TEAM_SERVER_PORT` | `8080` | Port the local server binds to. |
| `AGENTS_TEAM_SERVER_MODE` | `production` | Set to `dev` (or `development`) to spawn `next dev --webpack` with hot reload instead of serving the pre-built `.next/`. Skips the build-dir check; first request compiles on demand. |
| `AGENTS_TEAM_SERVER_TITLE` | `agents-team` | Wordmark in the navbar + suffix on every page's `<title>`. **Read at build time** - re-run `bash scripts/setup.sh` (or `cd .pi/server && npm run build`) for changes to take effect. |
| `AGENTS_TEAM_SERVER_PUBLIC_URL` | `http://localhost:8080` | Base URL the `render-html` / `export` tools return. Set to your named cloudflared tunnel so URLs are share-ready across sessions. Quick-tunnel URLs rotate on every restart - use a named tunnel. Read at runtime, so a Pi restart is enough. |
| `AGENTS_TEAM_CHROME_PATH` | auto-detected | Override the Chrome binary used for PDF export. Auto-detection covers `/Applications/Google Chrome.app` on macOS plus the standard Linux and Windows locations. Set this only if Chrome lives somewhere unusual. |
| `AGENTS_TEAM_PM_REPLY_DEBOUNCE_MS` | `30000` | Coalesce window between a user comment landing on a card and the PM-reply Pi spawn. New comments on the same card reset the timer. Set lower for faster replies, higher to batch more aggressively. `0` fires synchronously (mainly a test hook). |
| `TELEGRAM_BOT_TOKEN` | _unset_ | Bot token from `@BotFather`. Unset → the `telegram-bot` extension stays dormant (no footer cell, no surfaces). Set by `/telegram-connect <token>` in Pi, or pasted into `.env` directly. |
| `TELEGRAM_ALLOWED_CHATS` | _unset_ | Comma-separated chat ids the bot will respond in. Hard allowlist; anything else is silently dropped. `/start` from any chat bypasses the allowlist to reply with that chat's id. Populated via the interactive prompt that follows `/telegram-connect` when empty. |
| `TELEGRAM_LONG_POLL_TIMEOUT` | `50` | Seconds to hold each `getUpdates` call open; Telegram caps at 50. |
| `TELEGRAM_INLINE_KEYBOARDS` | `on` | Set to `off` to disable inline keyboards (artifact actions, profile-update approve/reject). |

## Repository layout

```
.pi/
├── SYSTEM.md            Root agent - persona-adoption + Telegram rules
├── agents/              Executor + reviewer subagents (spawned as sub-Pi processes)
├── skills/              Personas + inner skills + shared services
├── extensions/          TypeScript tool surfaces (auto-loaded by Pi)
│   ├── server/             Lifecycle for the Next.js server
│   ├── telegram-bot/       Telegram bridge (long-poll + telegram_send tool)
│   ├── working-mood/       Kaomoji + elapsed-counter working indicator
│   ├── obsidian-vault/     Vault I/O + render-html / export tool surface
│   ├── board/              board_create_card + board_add_comment tools
│   ├── env-guard/          Strips .env values from assistant messages + tool args
│   └── ...                   battery, news-ingest, reminders, srs, etc.
├── server/              Next.js 16 + Nextra 4 app on :8080 - full-height scrollable TOC sidebar (capped at h3); in-page Fix-syntax for broken Mermaid; PM-reply coordinator at lib/pm-reply-coordinator.ts
├── state/               profiles/, reminders.md, telegram/, meta-logs/, research/<run>/research-tree.json
├── lib/                 dotenv loader + shared TUI primitives
└── settings.json        Declares project-local npm packages
renders/                 MDX sources for HTML renders (root real dir; was a symlink under .pi/server/)
scripts/
├── setup.sh             Idempotent bootstrap (orchestrates phases/)
├── phases/              Modular setup phases (stop-server, install-tmux, etc.)
├── lib/                 Shared helpers (common.sh)
├── news-cron.sh         Daily 07:00 news refresh (installed by setup)
├── apply-patches.sh     Reapply local patches after npm installs
└── patches/             Local fixes against vendored npm packages
vault/                   Obsidian vault (gitignored; override via env)
exports/                 PDF output root (served at /p/ via symlink)
data/                    Seed data (JLPT decks, etc.)
AGENTS.md                Long-form internal design doc
```

## License

Personal project - no license declared. Treat as source-available for inspection; ask before reuse.
