# agents-team

A personal **team of AI agents** built on the [Pi coding-agent harness](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). One terminal session, many roles — product manager, engineer, educator, language coach, trading student — each with its own skills, reviewers, and memory of who you are in that domain.

The aim is a long-running personal operating layer: you talk to it from the CLI, it writes to your Obsidian vault, renders artifacts as web pages or PDFs, and learns your preferences across sessions.

## What this project is

A single Pi session that **adopts a persona** for the work in front of it instead of routing every request to a separate sub-agent. The PM persona drafts a PRD; the engineer persona picks it up from the same conversation and builds against it; the educator persona writes a lesson plan; the language persona drills you on JLPT vocab. Same session, same memory of you — different rules and skills active depending on which persona is on.

Reviewers (PRD-critic, UAT-tester, red-team, assessment-grader, JLPT-examiner) are the exception: they run as **isolated sub-sessions** so they can audit work without being contaminated by the implementer's reasoning.

Everything that matters gets written to a **markdown-first Obsidian vault**. HTML renders and PDF exports are on-demand derivatives served by a local Next.js + Nextra site on port 8080 — the URL is the access control.

## Architecture

Three layers, organised by isolation rather than capability:

```
Layer 0   META                observes & optimises the system across sessions
Layer 1   ROOT SESSION        one Pi session — adopts personas inline
          │
          ├── Personas              pm · engineer · educator · language · trader
          │   no extra model loop per turn; the root IS the persona while it's on
          │
          └── Reviewers (sub-agents)  prd-critic · uat-tester · red-team
                                      assessment-grader · jlpt-examiner
              blind by isolation — spawned only when an adversarial second
              opinion is needed
Layer 3   SHARED SERVICES     skills any persona can call inline
                              note-taker · render-html · export · research
                              scribe · summary · news · reminders
```

**The specialization rule:** sub-session when contamination would corrupt the output, inline (persona or skill) when shared context aids the work. A UAT tester *must* be blind to the implementer's reasoning, so it gets its own process. A PM and engineer working together *benefit* from continuity, so they share one session.

### Pi mapping

| Concept | Pi artifact |
|---|---|
| Root agent (Layer 0 + 1) | The Pi session itself. `.pi/SYSTEM.md` is its system prompt. |
| Personas | `.pi/skills/<name>/SKILL.md` — adopted inline by reading the file. |
| Reviewers | `.pi/agents/<name>.md` — spawned as isolated sub-Pi processes via the `subagent` extension. |
| Inner skills (prd, frontend, kanji, journal, …) | `.pi/skills/<name>/SKILL.md` — Pi auto-discovers and loads on demand. |
| Shared services | Same shape as inner skills, available under every persona. |
| Tool surfaces | TypeScript extensions under `.pi/extensions/`. |

### Per-domain memory of you

`.pi/state/profiles/` builds the system's model of who you are in each domain:

| File | Loaded by |
|---|---|
| `_global.md` | every persona + every reviewer |
| `product.md` | pm persona |
| `engineering.md` | engineer persona |
| `learning.md` | educator persona |
| `language.md` | language persona |
| `trading.md` | trader persona |

Personas read their profile at adoption time. Reviewers only get `_global.md` — domain context would compromise their blind audit. At session end the active persona can propose a `PROFILE_UPDATE` for you to approve or reject; nothing is written unsupervised.

### Vault, renders, exports

- **Vault is markdown.** PRDs, ADRs, reports, lesson plans, journal entries — everything that needs to persist goes through the `note-taker` skill and lands in the Obsidian vault as markdown with YAML frontmatter, inline `#tags`, and `[[wiki-links]]`. Graph view and backlinks depend on staying markdown-first.
- **HTML renders** are opt-in. `render-html` produces a Nextra-styled page served at `http://localhost:8080/v/<YYYY-MM-DD>-<slug>` — useful when diagrams, tabs, or callouts make on-screen reading meaningfully better.
- **PDF exports** are for deliverables. `export` produces a print-ready, Kami-styled PDF (parchment canvas, ink-blue accent, serif throughout) served at `http://localhost:8080/p/<YYYY-MM-DD>-<slug>.pdf` — for resumes, letters, portfolios, formal reports.

The URL is the access control. No auth, no listing, no search index, no sitemap. To share externally, run cloudflared yourself (see below).

### A note on Trader

Trader runs in **student mode**. It never prescribes a trade. It surfaces patterns from your journal as Socratic questions, reflects "should I do X?" back at you, and refuses to call directional decisions. The point is to sharpen your own judgement, not to outsource it.

## Direction

The current shape is the second iteration. The first ("Distributor") spawned every domain as its own Pi sub-session, paying a model loop per turn for the routing overhead. The current shape pulls domain agents **inline as personas** — the root session reads a persona's `SKILL.md` and operates under those rules. Reviewers stay isolated only because contamination would corrupt their judgement.

Where it's heading:

- **Web frontend** — not currently wired in; being rebuilt from scratch. The CLI (`pi` from the repo root) is the only entry point today.
- **Layer 0 meta-review** — surfacing cross-domain patterns and contradictions across profiles as the system accumulates a real model of you.
- **Richer service surface** — `news-ingest` is stubbed; SRS decks need seeding; the trade-journal accessor is read-only for now.

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
3. Pi project-local packages (replayed from `.pi/settings.json` — notably `@the-forge-flow/camoufox-pi` for the `research` skill)
4. Local patches against vendored npm packages (`scripts/patches/`)
5. `.env` scaffold from `.env.example` (preserves existing `.env`)
6. `exports/` directory + `.pi/server/public/p` → `exports/` symlink for PDF serving
7. Nextra server `npm install` in `.pi/server/`
8. Nextra production build (`next build`) — `.env` is sourced first so build-time vars get baked in

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
pi --no-session -p "Adopt the engineer persona and reply PI-OK."
```

### Sharing renders externally

The local server has no auth. To expose it, run cloudflared yourself:

```bash
# Quick tunnel (URL rotates on every restart):
cloudflared tunnel --url http://localhost:8080

# Named tunnel (persistent — recommended):
cloudflared tunnel create agents-team
cloudflared tunnel route dns agents-team renders.example.com
cloudflared tunnel run agents-team
```

Then point `AGENTS_TEAM_SERVER_PUBLIC_URL` at the named tunnel hostname so the URLs returned by `render-html` and `export` are share-ready across sessions.

## Environment variables

All vars are optional. Project-local secrets and overrides live in `.env` (gitignored) — copy from `.env.example` and uncomment what you want to set. The in-repo extensions auto-load `.env` at startup, and `scripts/setup.sh` sources it before the Nextra build. Shell-exported values still win, so ad-hoc overrides work:

```bash
AGENTS_TEAM_SERVER_TITLE=experimental pi
```

| Variable | Default | Purpose |
|---|---|---|
| `AGENTS_TEAM_VAULT_PATH` | `<repo>/vault/` | Path to the Obsidian vault. Point this at your real vault elsewhere on disk to have all notes land there. Used by the `obsidian-vault` and `trade-journal` extensions. |
| `AGENTS_TEAM_SERVER_PATH` | `<repo>/.pi/server/` | Location of the Next.js + Nextra app that serves renders and PDFs. |
| `AGENTS_TEAM_SERVER_PORT` | `8080` | Port the local server binds to. |
| `AGENTS_TEAM_SERVER_TITLE` | `agents-team` | Wordmark in the navbar + suffix on every page's `<title>`. **Read at build time** — re-run `bash scripts/setup.sh` (or `cd .pi/server && npm run build`) for changes to take effect. |
| `AGENTS_TEAM_SERVER_PUBLIC_URL` | `http://localhost:8080` | Base URL the `render-html` / `export` tools return. Set to your named cloudflared tunnel so URLs are share-ready across sessions. Quick-tunnel URLs rotate on every restart — use a named tunnel. Read at runtime, so a Pi restart is enough. |
| `AGENTS_TEAM_CHROME_PATH` | auto-detected | Override the Chrome binary used for PDF export. Auto-detection covers `/Applications/Google Chrome.app` on macOS plus the standard Linux and Windows locations. Set this only if Chrome lives somewhere unusual. |

## Repository layout

```
.pi/
├── SYSTEM.md            Root agent — persona-adoption rules
├── agents/              Reviewers (spawned as sub-Pi processes)
├── skills/              Personas + inner skills + shared services
├── extensions/          TypeScript tool surfaces (auto-loaded by Pi)
├── server/              Next.js 16 + Nextra 4 app on :8080
├── state/               profiles/, reminders.md, meta-logs/
├── lib/                 dotenv loader shared by extensions
└── settings.json        Declares project-local npm packages
scripts/
├── setup.sh             Idempotent bootstrap
├── apply-patches.sh     Reapply local patches after npm installs
└── patches/             Local fixes against vendored npm packages
vault/                   Obsidian vault (gitignored; override via env)
exports/                 PDF output root (served at /p/ via symlink)
data/                    Seed data (JLPT decks, etc.)
AGENTS.md                Long-form internal design doc
```

## License

Personal project — no license declared. Treat as source-available for inspection; ask before reuse.
