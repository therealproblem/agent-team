# agents-team

A personal **team of AI agents** built on the [Pi coding-agent harness](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). One terminal session, many roles - product manager, educator, language coach, trading student - each with its own skills, reviewers, and memory of who you are in that domain. Engineering work routes through the PM persona, which spawns an isolated `engineer` subagent to execute code tasks.

The aim is a long-running personal operating layer: you talk to it from the CLI or from Telegram, it writes to your Obsidian vault, renders artifacts as web pages or PDFs, and learns your preferences across sessions.

## What this project is

A single Pi session that **adopts a persona** for the work in front of it instead of routing every request to a separate sub-agent. The PM persona drafts a PRD and hands a kanban card to the `engineer` subagent (Sonnet, isolated child process) to build against it; the educator persona writes a lesson plan; the language persona drills you on JLPT vocab. Same session, same memory of you - different rules and skills active depending on which persona is on.

Reviewers (PRD-critic, opportunity-critic, UAT-tester, red-team, assessment-grader, JLPT-examiner, steelman, design-critic, marketing-critic) and executor sub-agents (`engineer`, `designer`, `marketer`, `scout`, `render-html`, `render-pdf`) run as **isolated sub-sessions** - for blind audit, model isolation, context isolation, or cost. `engineer`, `designer`, and `marketer` are executor subagents spawned by PM, not inline personas.

Everything that matters gets written to a **markdown-first Obsidian vault**. HTML renders and PDF exports are on-demand derivatives served by a local Next.js + Nextra site on port 8080. Application pages (board, projects, news) sit behind a token gate; published artifacts (`/v/*`, `/p/*`) stay public so a shared URL just works.

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
          ├── Executors (sub-agents)  engineer (Sonnet 4.5) · designer (GPT-5.5) · marketer (GPT-5.5)
          │   isolated child processes — code, tests, kanban cards · design bundles · marketing bundles
          │
          └── Reviewers (sub-agents)  prd-critic · opportunity-critic · uat-tester · red-team
                                      assessment-grader · jlpt-examiner · steelman
                                      design-critic · marketing-critic
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
| `designer` | `openai/gpt-5.5` (thinking: high) | Long-form design bundles — needs context + reasoning to compose `DESIGN.md` + `storyboard.html` + `prompts/` from the open-design skill library |
| `marketer` | `openai/gpt-5.5` (thinking: high) | Long-form marketing bundles — same shape as designer; composes `MARKETING.md` + `plan.md` + optional `drafts/` + `audit/` from the 141-skill marketing library |
| `design-critic`, `marketing-critic`, `prd-critic`, `opportunity-critic`, `assessment-grader` | `openai/gpt-5.4` | Cross-vendor artifact audit + grading |
| `red-team` | `openai/gpt-5.5` | Adversarial review on the 1M-ctx model - same vendor as root |
| `jlpt-examiner`, `render-html` | `google/gemini-3.1-pro-preview` | Mermaid/SVG quality + JLPT linguistics |
| `render-pdf` | `openai/gpt-5.5` | PDF body conversion + Kami-token fidelity (swapped off Gemini after layout drift) |
| `scout`, `steelman` | `openai/gpt-5-mini` | Cheap models for high-token, low-reasoning sub-tasks |

Reviewers all run through Pi's `openai-completions` / `openai-responses` shim but stay tool-light (read-only) so shim risk stays low.

#### Renaming the model providers to match your Pi login

The `model:` strings in this repo are pinned to **my** Pi-configured provider aliases — prefixed `ELICE_*` (e.g. `ELICE_GPT_5_5/openai/gpt-5.5`, `ELICE_SONNET_4_5/anthropic/claude-sonnet-4-5`). The `ELICE_` half is the provider alias I set up with `pi login` / `pi provider`; the half after the slash is the upstream model id. **These aliases will not exist on your machine.** Pi will fail to spawn the subagent with an unknown-provider error until you swap them for aliases that match your own login.

Where to rename:

| File | What to change |
|---|---|
| `.pi/agents/engineer.md` | `model:` frontmatter — currently `ELICE_SONNET_4_5/anthropic/claude-sonnet-4-5` |
| `.pi/agents/uat-tester.md` | same as engineer |
| `.pi/agents/designer.md` | `ELICE_GPT_5_5/openai/gpt-5.5` (also has `thinking: high`) |
| `.pi/agents/marketer.md` | same as designer |
| `.pi/agents/prd-critic.md` | `ELICE_GPT_5_4/openai/gpt-5.4` |
| `.pi/agents/opportunity-critic.md` | same as prd-critic |
| `.pi/agents/assessment-grader.md` | same as prd-critic |
| `.pi/agents/design-critic.md` | same as prd-critic |
| `.pi/agents/marketing-critic.md` | same as prd-critic |
| `.pi/agents/red-team.md` | `ELICE_GPT_5_5/openai/gpt-5.5` |
| `.pi/agents/render-pdf.md` | same as red-team |
| `.pi/agents/render-html.md` | `ELICE_GEMINI_3_1_PRO/google/gemini-3.1-pro-preview` |
| `.pi/agents/jlpt-examiner.md` | same as render-html |
| `.pi/agents/scout.md` | `ELICE_GPT_5_MINI/openai/gpt-5-mini` |
| `.pi/agents/steelman.md` | same as scout |
| `.pi/SYSTEM.md` | Root-session model hint, if you've pinned one for `pi` itself (default config picks this up from your `pi login`, but search for `gpt-5.5` if you've customised it) |

To list the provider aliases you actually have logged in:

```bash
pi provider list
```

The fastest swap is a project-wide find-replace from `ELICE_<TIER>/` to your matching alias prefix (e.g. `MY_OPENAI/`, `ANTHROPIC/`, etc.) — keep the upstream model id after the slash intact unless you also want to swap models. If your provider only exposes one model, you can drop the slash form and use the bare alias.

### Pi mapping

| Concept | Pi artifact |
|---|---|
| Root agent (Layer 0 + 1) | The Pi session itself. `.pi/SYSTEM.md` is its system prompt. |
| Personas | `.pi/skills/<name>/SKILL.md` - adopted inline by reading the file. Four personas: `pm`, `educator`, `language`, `trader`. Engineering routes through `pm`, which spawns the `engineer` subagent. |
| Executor + reviewer subagents | `.pi/agents/<name>.md` - spawned as isolated sub-Pi processes via the `subagent` extension. Per-agent model pinned in frontmatter. |
| Inner skills (prd, frontend, kanji, journal, ...) | `.pi/skills/<name>/SKILL.md` - Pi auto-discovers and loads on demand. |
| Shared services | Same shape as inner skills, available under every persona. |
| Tool surfaces | TypeScript extensions under `.pi/extensions/` (server, telegram-bot, working-mood, obsidian-vault, news-ingest, reminders, ...). |

### Per-domain memory of you

`<vault>/.memory/profiles/` builds the system's model of who you are in each domain (override the root with `AGENTS_TEAM_MEMORY_PATH`):

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
- **HTML renders** are opt-in. `render-html` produces a Nextra-styled page — useful when diagrams, tabs, or callouts make on-screen reading meaningfully better. Now dispatched via an isolated `render-html` subagent (Gemini 3.1 Pro for Mermaid/SVG quality), with a planner-first split: large outputs become multi-part renders with a sidebar parts nav, streamed per-part URLs as each part verifies. Generated MDX sources live at `<vault>/artifacts/renders/` (inside the vault, alongside source notes, so artifacts travel with their source; override via `AGENTS_TEAM_RENDERS_PATH`). Mermaid charts are numbered (“Chart N”), show a `lucide` spinner + “Rendering chart N…” caption while `mermaid.render()` is in flight (120 px min-height so the article column doesn’t reflow when the SVG arrives), and broken charts surface an in-page **Fix syntax** button that repairs the source via `pi --mode json -p` and dual-writes the page + vault note. Every chart is also click-to-expand into a fullscreen lightbox with vector-crisp pinch/wheel zoom and drag pan (mobile + desktop, mouse + touch). LaTeX math renders via KaTeX (`$x^2$` inline, `$$\int…$$` block, pre-rendered at compile time so no client-side math layout cost). The on-page TOC tracks scroll position with a continuous left rail behind every item and a burnt-umber progress fill from the top down to the active section’s centre; the active row gets a cloud-fog chip and 4px bar in both the desktop sidebar and the mobile sheet. In dark mode, Mermaid edge strokes and arrowheads repaint to a warm beige so the connecting lines stay legible against the near-black page.
- **PDF exports** are for deliverables. `export` produces a print-ready, Kami-styled PDF (parchment canvas, ink-blue accent, serif throughout) - for resumes, letters, portfolios, formal reports. Dispatched via the `render-pdf` subagent, now pinned to `openai/gpt-5.5` after Gemini repeatedly drifted on layout fidelity. The agent prompt enforces a markdown → structured-HTML body conversion (h2/h3/h4, lists, GFM tables, blockquote, `> [!NOTE]` callouts) and bans the whole-body-callout anti-pattern; defense-in-depth lints at the tool boundary reject invented SVG labels and snap any LLM-drifted parchment hex back to canonical Kami tokens. The parchment canvas itself is painted via a Chrome flag so there's no white frame on the printed page. Exported PDFs live under `<vault>/artifacts/exports/` (inside the vault, override via `AGENTS_TEAM_EXPORT_PATH`). When the Telegram bot sees a `/p/<file>.pdf` URL in a reply, it uploads the on-disk file as a real Telegram document instead of just linking.

**Two access tiers.** Published artifacts (`/v/*` HTML, `/p/*` PDFs) stay public — URL possession is the only gate, so a `cloudflared` tunnel + a copied link works for any recipient. Application pages (`/`, `/projects`, `/projects/<slug>`, `/news`, `/c/<id>`) sit behind the `proxy.ts` auth gate when `AGENTS_TEAM_AUTH_TOKEN` is set: browsers get redirected to `/login`, API clients use `Authorization: Bearer <token>` or `?auth=<token>`. With the token unset (default), everything is wide open — fine for localhost-only use. See `.pi/server/AUTH.md` for the full flow. (The file used to be called `middleware.ts`; Next.js 16 added a deprecation warning for that name, so it was renamed to silence the noise.)

### Research orchestrator

`research` is a 10-skill pipeline over stealth web fetch + search (`camoufox-pi`), with tree-shaped state per run plus a cross-run logbook:

```
research-frame (emits weighted success_rubric)
  → research-tree.find_overlap + log_summary (cross-run priors)
  → research-tree.start_run
  → research-survey (runs 2–3 competing strategies; winner feeds downstream)
  → source-rank → fetch loop (research-branch · triangulate)
  → research-interrogate (mechanism check on load-bearing claims)
  → steelman
  → research-corpus-check (fitness gate; 1-loop bounce back to source-rank)
  → synthesize → research-stop-check (grades rubric → 0..1 score; loops while climbing)
  → note-taker → render-html / export
  → research-tree.complete_run (appends row to research-log.jsonl)
```

State moves through `.pi/state/research-tree.json` rather than a flat history - the last 10 finished runs stay queryable so "what did I research recently?" returns real answers. `steelman` runs as a blind reviewer for disconfirming evidence; `triangulate` enforces a common-origin check (5 tertiaries citing one primary = 1 data point, not 5).

**Corpus-readiness gate.** `research-survey` emits `corpus_diagnostics` (domain/voice/date/stance spread + a warning flag) and runs a **classics round** on deep+settled runs to surface canonical sources before the fetch loop spends budget — gracefully degrades when no canon exists. After fetching, `research-corpus-check` audits the assembled corpus and can loop back to `source-rank` (cheap) once before `synthesize` burns its budget on a lopsided pool; if the gate is bypassed, the gap surfaces as a `## Known corpus gaps` section in the synthesis. `synthesize`'s landscape-map shape also requires a "What's unexplored" section (concept × method grid, naming empty cells with reason). Reusable outside research — any structured deliverable with TL;DR + claim-level citations + mandatory "What's contested" and "What's unexplored" sections.

**Score-driven stop-check + strategy competition + cross-run logbook.** Three borrowings from [jailbreak-autoresearch](https://github.com/davidondrej/jailbreak-autoresearch) (Karpathy's AutoResearch pattern applied to prompt harnesses) make the pipeline measurable and self-improving:

- **Weighted rubric on every run.** `research-frame` now emits a `success_rubric` alongside `success_criteria` — 3–5 weighted criteria (`shape_fit`, `coverage`, `source_diversity`, `triangulation`, `disconfirm_pass`, etc.) with per-shape defaults and weights summing to 1.0. The rubric is the contract `research-stop-check` grades against.
- **Score, not pass/fail.** `research-stop-check` grades each criterion 0 / 0.5 / 1, returns a weighted `score ∈ [0, 1]` plus `verdict ∈ {ship, ship_with_gaps, loop}`. The orchestrator tracks the score across iterations: it loops while score is climbing ≥ 0.05/iter, ships at ≥ 0.85, and ships-with-gaps on plateau or after 3 iterations. Structural hard fails (single-source load-bearing claim, dangling branches, new claims contradicting synthesis) override score and force a loop.
- **Competing survey strategies.** `research-survey` runs 2–3 named strategies in parallel — `vocabulary-expansion`, `canonical-voice`, `counter-position`, `recency-first`, `cross-discipline` — each issuing its own 3–5 queries. Each strategy's snippet pool is scored by coverage breadth (unique_domains + unique_voices + stance_balance + recency_match); the winner's terrain map feeds `source-rank`. Loser diagnostics travel to the logbook so the orchestrator can pre-pick winning strategies on future runs.
- **Cross-run logbook.** `<vault>/.memory/research-log.jsonl` (append-only, one row per completed run) records `{persona, shape, depth_budget, question, survey_strategies, stop_score, iterations, verdict, artifact}`; `<vault>/.memory/research-log.md` is the regenerated newest-100 markdown table for human reading. At frame time the orchestrator calls `research-tree.log_summary({ persona, shape })` for cross-run priors — once ≥ 3 rows exist for a persona+shape pair, the logbook recommends the strategy set that has won most often on similar questions. With `confidence: high` the orchestrator trusts the recommendation; with `low`/`none` it falls back to the shape's default menu. The logbook is the long-term memory the per-run tree can't provide.

**Agent-side learning-technique passes.** Three further additions borrow from learning-science (elaborative interrogation, Feynman gap-test, worked examples) — picked to lift artifact quality without making the run interactive. The interactive techniques (pre-test, self-explanation, SRS auto-seed) deliberately do NOT live in `research`; they belong in a future `teach-me` skill, and SRS card seeding is opt-in only.

- **`research-interrogate` — mechanism check on load-bearing claims.** New sub-skill between `triangulate` and `steelman`. For each load-bearing claim the orchestrator marks, the skill asks "why is this true?" — first checking the source the claim came from, then running ONE capped follow-up search if absent. Claims without a discoverable mechanism are explicitly tagged `unclear` and surface in the synthesis under "Mechanism unclear" rather than being silently omitted. Different failure mode from `triangulate` (which checks IF a claim is true): a claim can be well-cited and still mechanism-opaque, which makes the synthesis sound authoritative while skipping the part the reader needs to understand. Only runs when the rubric includes `mechanism_clarity` (default for `decision` and `fact-check`; opt-in elsewhere via request wording like "how does X work" / "why does Y happen").
- **`feynman_clarity` rubric criterion in `research-stop-check`.** Adds a new criterion to most shapes (`summary`, `comparison`, `decision`, `landscape-map`): the load-bearing claim must survive a 3–5 sentence plain-language re-write with no corpus jargon and no "essentially…" hand-waves. Stop-check produces the re-write internally and grades the result — `1.0` clean, `0.5` if one borrowed term needed an unpack, `0.0` if jargon leaks back in or the claim has to be weakened to land plainly. The re-write becomes the loop-back anchor: if the score is low, the synthesize step gets a concrete plain-language target to re-draft against.
- **`worked_example` rubric criterion for `how-to` shape.** A how-to without one concrete instance walked through end-to-end (steps with annotated reasoning, not just actions) is a how-to-fragment. The criterion forces synthesize to include exactly one — drawn from the corpus where possible, or a clearly-flagged constructed example otherwise.

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

### PM upstream — opportunity discovery + validation

Before PM drafts a PRD, two inline skills + one blind critic pressure-test the idea upstream — for when the user shows up with a rough hunch instead of a sharp problem. The PRD skill assumes the problem and target user are already pinned down; this pipeline is what pins them down.

- **`founder-discovery`** — inline PM skill. Walks the user through a Branch A (business) / Branch B (expertise) / Both intake with one question at a time, suggestions starting at Q3, and a five-axis traffic-light scorecard over 3–5 candidate directions. Output is a `pm/discovery/<slug>.md` one-pager (target user, specific problem, MVP shape, why-you, top-3 risky assumptions, candidates considered).
- **`opportunity-scorecard`** — inline PM skill. Appends a six-axis 1–5 stress-test to the discovery doc (pain intensity · buyer clarity · urgency · differentiation · speed to validate · founder advantage). No averaging — the *shape* of the scorecard is the signal.
- **`opportunity-critic`** — blind reviewer subagent (mirrors `prd-critic`'s shape, same model). Receives only the discovery doc path + the original problem statement. Returns core assumption, fatal-flaws table, problem-reality check, competition map ("we have no competition is always wrong"), 2-week behavioral test design, and a **Strong / Weak / Pivot** verdict. Strong → hand to the `prd` skill. Pivot → re-enter discovery at Step 4 with the suggested direction. Weak → more discovery before any PRD.

The three are adapted from [BuildGreatProducts/plaid](https://github.com/BuildGreatProducts/plaid) (MIT) — Idea + Validate capabilities. The question banks, the "suggestions start at Q3" rule, the six-axis stress-test scorecard, the fatal-flaws table, and the Strong/Weak/Pivot verdict are lifted verbatim where the wording is the value.

### engineer — code execution subagent

PM spawns `engineer` to execute kanban cards — one card per spawn, isolated child process on Sonnet 4.5. Inner skills it auto-discovers under `.pi/skills/`: `frontend`, `backend`, `db-mysql`, `db-postgres`, `uiux`, `devops`, `debugger`, `refactor`, `review-artifact`, `corpus-learning`, `planning`, `research`, `commit-and-push`. After build it spawns `uat-tester` (user-facing features) and `red-team` (anything touching auth, user input, or external network I/O); their findings land on the card body, not in chat.

The engineer also has the `codegraph_*` MCP tools (`search`, `context`, `callers`, `callees`, `impact`, `node`, `explore`, `status`, `files`, `trace`) wired in via [`.pi/mcp.json`](.pi/mcp.json). They query a local SQLite knowledge graph of every symbol, edge, and file under `.pi/server/`, `.pi/extensions/`, `.pi/lib/`, and `scripts/`, built by [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) — a single tool call answers "who calls X / what does X impact / show me the context around Y" in sub-millisecond DB reads instead of a grep+read loop. 100% local (tree-sitter parsing, no network). The engineer's playbook (`.pi/agents/engineer.md`) tells it to prefer codegraph for symbol/call questions and fall back to grep only to confirm specifics.

`db-mysql` and `db-postgres` are vendored from [planetscale/database-skills](https://github.com/planetscale/database-skills) (MIT) — 2 SKILL.md + 40 references covering schema, indexing, EXPLAIN, isolation, deadlocks, online DDL, replication, MVCC/VACUUM, WAL, PgBouncer. The PlanetScale hosting-recommendation blockquote is stripped from each SKILL.md and reference links are rewritten to local paths so the skills work offline. The `ps-*` Postgres reference files (pscale CLI, PgBouncer config) are kept as operational depth — useful even off-PlanetScale, ignorable when not relevant. Auto-loaded when card text mentions MySQL or Postgres.

### designer — heavy-tier design bundles

PM has two design escalation tiers:

- **Light** — the `uiux` inner skill runs inline under the PM persona for sketches, mood boards, copy-on-image trial balloons. Output lands in `vault/pm/design/`.
- **Heavy** — when the design is committed work (full screen flow, brand artifact, slide deck for an external recipient), PM spawns the `designer` subagent. Designer reads `.pi/design-systems/INDEX.md` to pick one or two system candidates, applies the vendored open-design skill library, and produces a `vault/ux/<slug>/` bundle: `DESIGN.md` (spec + decisions), `storyboard.html` (interactive walkthrough), and `prompts/` (LLM prompts for external image / video / 3D generation tools). Returns a one-line outcome + the bundle path. Engineer reads the linked `DESIGN.md` when picking up implementation cards.

Designer runs on `openai/gpt-5.5` with `thinking: high` — the artifact is long-form, multi-section, and references skill-library conventions that need the larger context window. `design-critic` (mirroring `prd-critic`) is the blind reviewer PM spawns after the bundle lands.

The library itself is vendored: **95 skills** in `.pi/skills/` (24 paid-API wrappers + 12 hard skips omitted) and **150 design systems** under `.pi/design-systems/`. **57 of the 95 vendored skills are catalog-only stubs** that point at the upstream repo — see `.pi/STUBS.md` for the catalog + upstream URLs if you want to wire any of them in.

### marketer — heavy-tier marketing bundles

PM has two marketing escalation tiers:

- **Light** — the `copywriter` inner skill runs inline under the PM persona for single-page copy (landing hero, pricing table, CTA voice). Output lands in `vault/pm/content/`.
- **Heavy** — when the brief spans multiple tracks (SEO audit + GTM plan, channel mix + paid-ads, cold-start strategy + content calendar) or requires the breadth of the marketing library, PM spawns the `marketer` subagent. Marketer reads `.pi/skills/marketing/INDEX.md`, picks two or three skills by brief match, and produces a `vault/marketing/<slug>/` bundle: `MARKETING.md` (top-level synthesis), `plan.md` (engineer-actionable priorities), optional `drafts/` (landing copy, ad copy, email sequences, social posts), optional `audit/` (SEO findings, competitor analysis, conversion gaps), and `README.md` (transparency receipt). Returns a one-line outcome + the bundle path. PM passes P0/P1 plan items to engineer as implementation cards; strategy items go to the project's decisions log.

Marketer runs on `openai/gpt-5.5` with `thinking: high` — same model and shape as designer because marketing artifacts are long-form synthesis pulling from a large skill library. `marketing-critic` (mirroring `design-critic`) is the blind reviewer PM spawns on customer-facing or launch-impact bundles.

The library is vendored from [kostja94/marketing-skills](https://github.com/kostja94/marketing-skills) (MIT): **141 of 172 skills** under `.pi/skills/marketing/<category>/<skill>/SKILL.md` across SEO (33), strategies (27), channels (12), platforms (9), paid-ads (11), content (5), pages (40), and analytics (4). Nested under `marketing/` rather than flat in `.pi/skills/` so they stay scoped to the marketer subagent and don't pollute root pi auto-discovery; every frontmatter is patched with `disable-model-invocation: true` as belt+suspenders, and the marketer routes discovery through `INDEX.md` before reading any `SKILL.md` body. Skipped 31: `components/*` (designer's turf), `content/copywriting` (pi's `copywriter` is more opinionated), three pure-UX `pages/utility/*` (404, signup-login, status), `analytics/tracking` (needs runtime GA wiring), and the `legal/legal` meta page-generator. See `.pi/SOURCE.md` for the full provenance ledger.

### scout - file finder on a cheap sub-agent

`scout` is a Layer 3 skill that delegates file/path/symbol lookup to an isolated sub-Pi process pinned to `openai/gpt-5-mini`. Read-only (read + bash), returns `{path, line?, preview}` across repo + vault + `.pi/state/`. The "ls 50 dirs, grep 30 files, return 3 matches" exploration stays out of root context and off the root model's token bill.

### Telegram channel

The same Pi session is reachable from a Telegram bot. The extension runs a `getUpdates` long-poll loop inside Pi - no public URL needed; works from a laptop with no inbound networking.

**When Pi exits the bot goes offline** - the long-poll loop stops, and every allowed chat receives a final `(pi shut down)` message so users know the agent went away (only fires on a real quit, not on a session swap; bounded by a 4s timeout so a hung network can't block exit). If the long-poll loop errors mid-session — auth revoked, network gone, Telegram side rejecting — the bot broadcasts `(pi disconnected)` instead so users aren't left wondering. There's exactly one Pi session backing all chats - DMs and groups share context. Each turn arrives in Pi prefixed `[From Telegram @<username>] ...` so the agent knows the origin; replies route back to the originating chat automatically. A single-instance polling lock prevents a second Pi session (or a fresh `/reload`) from racing the first for `getUpdates`; the new module waits until the previous lock is released before taking over.

Setup is a single slash command inside Pi: `/telegram-connect`. The first invocation prompts for a bot token from `@BotFather` (or accepts it as `/telegram-connect <token>`), registers slash commands + the Menu button with Telegram, brings the bot online, and - if the allowlist is empty - opens a prompt for the chat id(s) you want to allow. To discover a chat id, DM the bot `/start`: it replies with the chat's id even when not allowlisted (the only message it sends to non-allowlisted chats).

The bot listens "always" in groups (every message enters the context as steering) but only triggers a turn when `@<persona>` is mentioned, `/<persona>` is used, or a user replies to one of the bot's own messages. In DMs every message triggers a turn - no `@` needed. Photos, image documents, and static stickers flow through as multimodal `ImageContent` on the user message (captions act as the text body, so `/persona`, `@persona`, and `/stop` still route correctly on captioned images); in groups, an image without a trigger invokes by default rather than buffering silently, since "look at this" is rarely meant as steering. `/stop` cancels the in-flight agent turn from any chat. Long replies are converted from markdown to Telegram-flavored HTML (`<b>`, `<i>`, `<code>`, `<pre>`, `<a>`) and chunked at the 4096-char limit. Inline keyboards attach only when the reply contains an artifact URL or a `PROFILE_UPDATE:` proposal - no default persona switcher.

Telegram chats can also send `/new` (start a fresh Pi conversation) and `/compact` (compact the current context) - both are routed via `tmux send-keys` to the running Pi pane, and `/start` lists them in the onboarding reply so new chats discover them.

The footer in Pi grows a `| TG ●` cell next to `| SRV ...` when the bot is online. See `.pi/SYSTEM.md` § "Telegram channel" for the rules the agent follows on Telegram-originated turns.

**Outbound `telegram_send` tool.** A Pi-callable tool lets any persona push a proactive message to allowed chats — used by PM to announce comment replies (with the card title + `/c/<id>` deep link), and by `news-cron.sh` to deliver a top-3-per-topic digest to your Telegram after each 07:00 refresh. The server doesn't push directly any more; everything outbound goes through this tool so message formatting, allowlist enforcement, and rate-limit handling live in one place.

### Working-mood indicator

Pi's default braille spinner is overridden by the in-repo `working-mood` extension - 28 kaomoji-verb frames rotate every 5s with an elapsed-time counter (`Ns / Mm Ss / Hh Mm`) ticking in muted color every 1s. Reliable in any terminal locale, no font dependency.

### Env-guard — secrets backstop

The `env-guard` extension hooks `message_end` and `tool_call` to scrub any literal `.env` value out of assistant text, thinking blocks, and outbound tool arguments — replacing each occurrence with `[REDACTED]` before it leaves Pi. The primary contract lives as SYSTEM.md working rule #8 ("never echo `.env` values"); this extension is the safety net.

Precedence when deciding what counts as a secret:

1. **`ALWAYS_REDACT_PATTERNS`** — keys matching `TOKEN`, `KEY`, `SECRET`, `PASS`, `CREDENTIAL` are always redacted, even short ones. Wins over everything else (a `PUBLIC_TOKEN` is still a token).
2. **`SAFE_KEYS`** — explicit allowlist for infra keys whose values are safe to mention: paths (`AGENTS_TEAM_VAULT_PATH`, `_SERVER_PATH`, `_CHROME_PATH`, `_EXPORT_PATH`, `_STATE_PATH`), ports, modes, titles, `AGENTS_TEAM_SERVER_PUBLIC_URL`, common shell vars (`PATH`, `HOME`, `SHELL`, …).
3. **`SAFE_KEY_PATTERNS`** — convention-based allowlist; any key containing `PUBLIC` (e.g. `NEXT_PUBLIC_*`, `MY_PUBLIC_HOST`) is non-secret by design.
4. **Length heuristic** — anything left, redact if `value.length >= 8`. Short values like `true` / `dev` / `8080` pass through.

Secrets are rebuilt on every `session_start`, so a `.env` edit + `/reload` takes effect without restarting Pi. Shell-exported vars that aren't in `.env` are NOT scanned (add their key names to `ALWAYS_REDACT_PATTERNS` or move them into `.env` if you want them scrubbed too).

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
5. `codegraph` CLI install (`@colbymchenry/codegraph`) + initial index of this repo's TS/JS/Python under `.codegraph/codegraph.db` (gitignored, per-developer). Re-runs are incremental via `codegraph sync`. The Pi-side wiring lives in `.pi/mcp.json` (checked in).
6. `.env` scaffold from `.env.example` (preserves existing `.env`)
7. Vault artifact roots (`<vault>/artifacts/{renders,exports}/`) created; PDFs are served by the runtime route at `app/p/[slug]/route.ts` reading straight from disk (no symlink needed)
8. Nextra server `npm install` in `.pi/server/`
9. Stops only the process bound to `AGENTS_TEAM_SERVER_PORT` (default 8080) so the rebuild doesn't fight a stale server - unrelated Node servers and Pi sessions on the same machine are left alone, and the script won't suicide when launched from inside a Pi session
10. Nextra production build (`next build`) - `.env` is sourced first so build-time vars get baked in
11. Chrome auto-install via `@puppeteer/browsers` when no system Chrome is found, pinned into `.env` as `AGENTS_TEAM_CHROME_PATH` (path is quoted because Chrome-for-Testing's path contains spaces)
12. Python research deps (`beautifulsoup4` + `requests`) installed to `--user` via `python3 -m pip` so the `research` skill's batch URL-fetch heredoc doesn't die with `ModuleNotFoundError`. Retries with `--break-system-packages` on PEP 668 systems.
13. `news-cron` crontab entry (`0 7 * * * scripts/news-cron.sh`) installed idempotently. Soft-fails with a Full Disk Access hint when macOS TCC denies the spool write so the rest of setup still completes.

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

Two pieces: expose the port, optionally gate the app pages.

```bash
# Quick tunnel (URL rotates on every restart):
cloudflared tunnel --url http://localhost:8080

# Named tunnel (persistent - recommended):
cloudflared tunnel create agents-team
cloudflared tunnel route dns agents-team renders.example.com
cloudflared tunnel run agents-team
```

Then point `AGENTS_TEAM_SERVER_PUBLIC_URL` at the named tunnel hostname so the URLs returned by `render-html` and `export` are share-ready across sessions.

If you don't want the whole world poking at your board / projects / news pages, set `AGENTS_TEAM_AUTH_TOKEN` to a strong value (`openssl rand -hex 32`) and restart the server. The `proxy.ts` gate then 302-redirects unauthenticated browser hits to `/login` where a single password field exchanges the token for an httpOnly session cookie; bearer auth via `Authorization: Bearer <token>` or `?auth=<token>` keeps API clients and bookmarks working. Artifact paths (`/v/*` and `/p/*`) skip the gate so shared HTML pages and PDFs stay open to recipients. Full details in `.pi/server/AUTH.md`.

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
| `TELEGRAM_WEBHOOK_URL` | falls back to `AGENTS_TEAM_SERVER_PUBLIC_URL` | Public HTTPS base URL Telegram should call for webhook delivery. Set to your Cloudflare Tunnel URL when it differs from the artifact/public server URL; the bot appends `/api/telegram/webhook/<secret>` automatically. Use a real public HTTPS host with no placeholder, literal quotes, or duplicated scheme. Normal startup stays quiet on success; run `node scripts/diagnostics/telegram-webhook-url.mjs` for explicit redacted URL/DNS diagnostics without exposing the URL. |
| `AGENTS_TEAM_CHROME_PATH` | auto-detected | Override the Chrome binary used for PDF export. Auto-detection covers `/Applications/Google Chrome.app` on macOS plus the standard Linux and Windows locations. Set this only if Chrome lives somewhere unusual. |
| `AGENTS_TEAM_PM_REPLY_DEBOUNCE_MS` | `30000` | Coalesce window between a user comment landing on a card and the PM-reply Pi spawn. New comments on the same card reset the timer. Set lower for faster replies, higher to batch more aggressively. `0` fires synchronously (mainly a test hook). |
| `AGENTS_TEAM_AUTH_TOKEN` | _unset_ | Token gate for the Nextra server's app pages (board, projects, news, card resolver). When set, browsers are redirected to `/login` until they authenticate; API clients can pass `Authorization: Bearer <token>` or `?auth=<token>`. Artifact paths (`/v/*`, `/p/*`) bypass the gate. Unset → no auth (default; safe for localhost). Generate with `openssl rand -hex 32`. See `.pi/server/AUTH.md`. |
| `TELEGRAM_BOT_TOKEN` | _unset_ | Bot token from `@BotFather`. Unset → the `telegram-bot` extension stays dormant (no footer cell, no surfaces). Set by `/telegram-connect <token>` in Pi, or pasted into `.env` directly. |
| `TELEGRAM_ALLOWED_CHATS` | _unset_ | Comma-separated chat ids the bot will respond in. Hard allowlist; anything else is silently dropped. `/start` from any chat bypasses the allowlist to reply with that chat's id. Populated via the interactive prompt that follows `/telegram-connect` when empty. |
| `TELEGRAM_LONG_POLL_TIMEOUT` | `50` | Seconds to hold each `getUpdates` call open; Telegram caps at 50. |
| `TELEGRAM_INLINE_KEYBOARDS` | `on` | Set to `off` to disable inline keyboards (artifact actions, profile-update approve/reject). |

## Repository layout

```
.pi/
├── SYSTEM.md            Root agent - persona-adoption + Telegram rules
├── agents/              Executor + reviewer subagents (engineer, designer, prd-critic, design-critic, …)
├── skills/              Personas + inner skills + shared services + 95 vendored open-design skills (57 of those are catalog stubs — see STUBS.md)
├── design-systems/      150 vendored design systems + _schema/ + INDEX.md picker the `designer` subagent reads
├── STUBS.md             Catalog of vendored open-design skill stubs + upstream URLs
├── extensions/          TypeScript tool surfaces (auto-loaded by Pi)
│   ├── server/             Lifecycle for the Next.js server
│   ├── telegram-bot/       Telegram bridge (long-poll + telegram_send tool)
│   ├── working-mood/       Kaomoji + elapsed-counter working indicator
│   ├── obsidian-vault/     Vault I/O + render-html / export tool surface
│   ├── board/              board_create_card + board_add_comment tools
│   ├── env-guard/          Strips .env values from assistant messages + tool args
│   └── ...                   battery, news-ingest, reminders, srs, etc.
├── server/              Next.js 16 + Nextra 4 app on :8080 — full-height scrollable TOC sidebar (capped at h3); in-page Fix-syntax for broken Mermaid; PM-reply coordinator at lib/pm-reply-coordinator.ts; proxy.ts auth gate (formerly middleware.ts)
├── state/               telegram/, meta-logs/, research-tree.json (per-run state; logbook lives in vault/.memory/), news.json + news-sources.json (RSS cache + config), persona-registry.json, srs.json, migration-map.json, server.log
├── lib/                 dotenv loader + shared TUI primitives
├── mcp.json             MCP server registration — wires codegraph_* tools into Pi
└── settings.json        Declares project-local npm packages
.codegraph/              Local code knowledge graph DB (gitignored; built by scripts/phases/install-codegraph.sh)
scripts/
├── setup.sh             Idempotent bootstrap (orchestrates phases/)
├── phases/              Modular setup phases (stop-server, install-tmux, etc.)
├── lib/                 Shared helpers (common.sh)
├── news-cron.sh         Daily 07:00 news refresh (installed by setup)
├── apply-patches.sh     Reapply local patches after npm installs
└── patches/             Local fixes against vendored npm packages
vault/                   Obsidian vault (gitignored; override via AGENTS_TEAM_VAULT_PATH)
├── artifacts/           Derivative outputs
│   ├── renders/         MDX sources for HTML renders (served at /v/<slug>)
│   └── exports/         PDF outputs (served at /p/<slug>.pdf via route handler)
└── .memory/             User-curated memory — hidden from Obsidian's file list (override root via AGENTS_TEAM_MEMORY_PATH)
    ├── profiles/        Per-domain user model loaded by personas/reviewers (_global.md + product/engineering/learning/language/trading.md)
    ├── reminders.md     Open todos surfaced at session_start
    ├── news-bookmarks.json   User-saved news items (URL-keyed index)
    └── research-log.{jsonl,md}   Cross-run research logbook (append-only JSONL + regenerated md view)
data/                    Seed data (JLPT decks, etc.)
AGENTS.md                Long-form internal design doc
```

## License

Personal project - no license declared. Treat as source-available for inspection; ask before reuse.
