---
description: Layer 3 shared service — read/write contract for `.pi/state/research-tree.json` (the per-run tree state) PLUS the cross-run logbook at `<vault>/.memory/research-log.jsonl` (append-only, one row per completed run) and its human-readable view `<vault>/.memory/research-log.md`. Each research run is a tree of nodes (root question + prereq/parent/sibling branches), each node carrying its own claims, sources, status. On `complete_run`, an aggregate row gets appended to the logbook so future runs can learn which survey strategies and stop-check scores worked on similar questions. Used by the `research` orchestrator, `research-branch` (which spawns nodes), `synthesize` (which walks the tree), `research-stop-check` (which pushes scores), and the "what did I research recently?" / "what's worked before?" query paths.
---

# Research-tree

The state file shape and access patterns for `.pi/state/research-tree.json` (per-run tree) AND `<vault>/.memory/research-log.jsonl` + `<vault>/.memory/research-log.md` (cross-run logbook). Replaces the older flat `.pi/state/research-history.json` (which can be archived but should not be deleted — back-compat for any persona still reading it). The per-run tree is operational state (resets per run) so it stays in `.pi/state/`; the logbook is long-term memory and lives in the vault so it travels with the user's notes.

## File locations

```
.pi/state/research-tree.json           # per-run trees: runs[] + nodes[] (operational state)
<vault>/.memory/research-log.jsonl     # append-only logbook, one JSON object per line per completed run
<vault>/.memory/research-log.md        # human-readable view, regenerated from the JSONL on each append
```

Override the vault root with `AGENTS_TEAM_VAULT_PATH` or the memory root with `AGENTS_TEAM_MEMORY_PATH`.

All three are owned by this skill. Other skills (`research`, `research-branch`, `synthesize`, `research-stop-check`) read/write through the operations below. Direct file access from outside this skill is forbidden.

## Shape

A JSON object with two top-level keys:

```json
{
  "runs": [
    {
      "run_id": "uuid",
      "started": "ISO timestamp",
      "completed": "ISO timestamp | null",
      "user_request": "<verbatim user ask>",
      "frame": { /* output of research-frame */ },
      "root_node_id": "uuid",
      "deliverable_artifact": "<vault path | render URL | null>",
      "status": "active | completed | abandoned"
    }
  ],
  "nodes": [
    {
      "id": "uuid",
      "run_id": "uuid",
      "parent_id": "uuid | null",
      "discovery_type": "root | prerequisite | parent | sibling | pivot | citation | disqualifier",
      "question": "<one sentence>",
      "depth": 0,
      "budget_allocated": 0.0,
      "budget_used": 0.0,
      "status": "active | paused | done | abandoned",
      "claims": [
        {
          "statement": "<one sentence>",
          "confidence": "high | medium | low",
          "sources": ["url", "..."],
          "verification_status": "confirmed | contested | unverified",
          "added": "ISO timestamp"
        }
      ],
      "sources": [
        { "url": "...", "title": "...", "fetched": "ISO timestamp", "type": "primary | secondary | tertiary" }
      ],
      "children": ["uuid", "..."],
      "notes": "<one-line, optional — why this node was spawned>"
    }
  ]
}
```

Keeping `runs` and `nodes` separate (rather than nesting children) makes it easy to (a) query "all my recent research runs," (b) walk a single tree by `run_id`, (c) find claims across all runs without recursive traversal.

## Operations

### `read_tree()`

Returns the full file contents as parsed JSON. If file doesn't exist, return `{ "runs": [], "nodes": [] }`.

### `start_run({ user_request, frame })`

Creates a new run + root node. Returns `{ run_id, root_node_id }`.

```
run_id = uuid()
root_node_id = uuid()
runs.push({ run_id, started: now, completed: null, user_request, frame, root_node_id, deliverable_artifact: null, status: "active" })
nodes.push({ id: root_node_id, run_id, parent_id: null, discovery_type: "root", question: frame.question, depth: 0, budget_allocated: 1.0, budget_used: 0, status: "active", claims: [], sources: [], children: [], notes: null })
```

### `spawn_node({ parent_id, discovery_type, question, budget_fraction, notes })`

Adds a child node under `parent_id`. Returns `{ node_id }`.

- `budget_fraction` is the fraction of `parent.budget_allocated` to give the child. Capped at 0.5 (no child eats more than half the parent's budget; siblings split the rest).
- `depth = parent.depth + 1`. Caller must check against the hard cap (3) before calling — this op trusts the caller.
- Appends `node_id` to `parent.children`.

### `add_claim({ node_id, statement, confidence, sources, verification_status })`

Appends a claim to the node. Returns the claim shape with `added: now`.

### `add_source({ node_id, url, title, type })`

Appends a source to the node. Returns the source shape with `fetched: now`. Deduplicates by URL within the node.

### `update_node_status({ node_id, status })`

Sets the node's status. When set to `done`, no-ops if any child is still `active` — caller must close children first (or explicitly `abandoned` them) before marking the parent done.

### `update_budget_used({ node_id, used })`

Sets `budget_used`. Caller computes the fraction (search calls + fetches + synthesis tokens normalised by depth_budget cap).

### `complete_run({ run_id, deliverable_artifact, stop_score, survey_competition, persona, iterations })`

Sets `completed: now`, `status: "completed"`, and the artifact URL/path on the run. Then **appends a logbook row** via `log_append` with the run's aggregates (see "Logbook" below). The orchestrator passes:

- `stop_score` — final score from `research-stop-check` (0..1).
- `survey_competition` — the `strategy_competition` object from `research-survey`.
- `persona` — the calling persona key (`trader`, `engineer`, `pm`, etc.) or `null`.
- `iterations` — how many stop-check loops the run took (1 = passed on first try).

If `stop_score` or `survey_competition` is missing (e.g. one-shot fetches, or a run that was abandoned), `complete_run` still updates the tree but skips the logbook append. The logbook only stores runs that completed a full pipeline.

### `walk_tree({ run_id })`

Returns the nodes in a tree-friendly shape:

```json
{
  "run": {...},
  "root": {
    ...root_node...,
    "children": [
      { ...child..., "children": [...] }
    ]
  }
}
```

Used by `synthesize` to render structured output.

### `find_overlap({ user_request })`

Searches `runs` for prior requests with text overlap on `user_request`. Returns `{ matches: [{ run_id, similarity_score, summary, artifact }], best_match }`.

Used at `research` orchestrator Step 1 (dedup check). Similarity: lowercase tokenize, jaccard over content words (drop stopwords). Threshold for "near-duplicate" is ~0.6.

### `trim_runs(limit=20)`

Keeps the most recent `limit` completed runs; archives older runs (and their nodes) to `.pi/state/research-tree.archive.json`. Active runs are never trimmed. The logbook is NOT trimmed by this op — it's append-only and is the long-term memory; trim it separately (see `log_trim` below) only if it grows past ~10k rows.

### `log_append({ entry })`

Appends one row to `<vault>/.memory/research-log.jsonl` and regenerates `<vault>/.memory/research-log.md`. Used internally by `complete_run`; callable directly by the orchestrator only if needed (e.g. logging a run that bypassed normal completion).

Each row's shape:

```json
{
  "ts": "<ISO timestamp of completion>",
  "run_id": "<uuid>",
  "persona": "trader | engineer | pm | educator | language | news | designer | marketer | null",
  "shape": "summary | comparison | how-to | timeline | decision | fact-check | landscape-map",
  "depth_budget": "fast | standard | deep",
  "question": "<frame.question, truncated to 200 chars>",
  "survey_strategies": {
    "winner": "<strategy name>",
    "winner_score": <float 0..1>,
    "ran": ["<strategy>", "..."]
  },
  "stop_score": <float 0..1>,
  "iterations": <int>,
  "verdict": "ship | ship_with_gaps",
  "artifact": "<vault path | render URL | null>"
}
```

**Write discipline:** open in append mode (`a`), write `JSON.stringify(entry) + "\n"`, fsync, close. Never rewrite existing rows — JSONL is immutable history.

After appending, regenerate `research-log.md` by reading the last 100 rows and producing a markdown table (newest first) with columns: `ts`, `persona`, `shape`, `winner strategy`, `score`, `iters`, `question`. This is the human-readable view; the JSONL is the source of truth.

### `log_summary({ filter })`

Reads `research-log.jsonl` and returns aggregates for the orchestrator's frame-time consultation. `filter` is an object:

```json
{
  "persona": "<persona | null = any>",
  "shape": "<shape | null = any>",
  "min_rows": 3
}
```

Returns:

```json
{
  "matched_rows": <int>,
  "by_strategy": [
    {
      "strategy": "<name>",
      "appearances_as_winner": <int>,
      "appearances_total": <int>,
      "win_rate": <float>,
      "mean_stop_score_when_winner": <float>,
      "median_iterations_when_winner": <number>
    }
  ],
  "recommended_strategy_set": ["<name>", "..."],
  "confidence": "high | medium | low | none"
}
```

`recommended_strategy_set` is `null` if `matched_rows < min_rows` (default 3) — not enough signal. Otherwise it's the top-K (K = 2 for `fast`, 3 for `standard`/`deep`) strategies by `mean_stop_score_when_winner * sqrt(win_rate)`. The orchestrator uses this as a soft prior — it can override based on shape-mandatory strategies (e.g. `decision` shape always needs `counter-position`).

`confidence`:

- `none` if `matched_rows == 0`
- `low` if `matched_rows < min_rows`
- `medium` if `min_rows ≤ matched_rows < 10`
- `high` if `matched_rows ≥ 10`

### `log_trim(keep=2000)`

Optional housekeeping. Truncates the JSONL to the most recent `keep` rows. Skip unless the file exceeds ~10k rows; the file is small (each row is ~400 bytes) and the value of long history is "what worked 6 months ago on this shape".

## Logbook semantics

The logbook is **cross-run memory** — separate from the per-run tree because:

1. The tree is large (claims, sources, branches); the log is one row per run.
2. The tree is mutable during a run; the log is immutable after the run completes.
3. The tree answers "what did this run find?"; the log answers "what works on questions like this one?"

Treat the logbook as evidence about which survey strategies + framings produce high-scoring outputs over time. It is not a substitute for `find_overlap` (which catches near-duplicate questions). Both queries happen at frame time: `find_overlap` first ("have I done THIS exact thing?"), then `log_summary` ("for questions of this shape and persona, what's worked?").

## Write discipline

1. **Read before write.** Every mutation re-reads the file first to avoid clobbering concurrent updates.
2. **Pretty-print JSON.** 2-space indent, trailing newline. Matches the project convention (`news-bookmarks.json` etc).
3. **Atomic via temp-file swap.** Write to `.tmp`, fsync, rename. Avoids torn files if the process dies mid-write.
4. **No partial nodes.** A node must be appended fully-formed; never write a node with `id` set and other fields TBD.
5. **JSONL is append-only.** The logbook uses POSIX append mode and does not get rewritten in place. `log_trim` is the only op that rewrites it.
6. **research-log.md is regenerated, not edited.** Treat it as a derived view. Never hand-edit; it gets overwritten on the next `log_append`.

## Migration from research-history.json

On first read, if `research-tree.json` doesn't exist but `research-history.json` does:

1. Read `research-history.json`.
2. For each entry, create a fully-formed completed run with a single root node:
   - `run.user_request` = `request`
   - `run.completed` = `timestamp`
   - `run.deliverable_artifact` = `artifact`
   - `root.claims` = `[{ statement: summary, confidence: "medium", sources: [], verification_status: "unverified", added: timestamp }]`
3. Write `research-tree.json`.
4. Rename `research-history.json` → `research-history.legacy.json` (don't delete — back-compat).

This is a one-time migration on first orchestrator invocation post-deployment.

## On-demand queries

When the user asks "what did I research recently?" / "have I researched X before?", the orchestrator:

1. Calls `find_overlap({ user_request })` if a topic was named, OR walks `runs` reverse-chronologically for "recently."
2. Returns the matching run(s) — `user_request`, `started`, `deliverable_artifact`, and the root node's TL;DR claim.
3. Offers to open the artifact for any selected run.

When the user asks "what's been working in research lately?" / "show me research scores" / "which strategies work best?", the orchestrator reads `research-log.md` directly (cheap) or calls `log_summary({})` with an empty filter for the aggregate view.

These queries do NOT create new nodes.

## Don't

- **Don't read or write the file from outside this skill.** Other skills call the operations above; they never touch the JSON directly.
- **Don't mutate completed runs.** Once `status: completed`, the run and its nodes are immutable. Follow-up research starts a new run (the orchestrator may add a `prior_run_id` reference in the new run's `notes` for the link).
- **Don't store synthesis output here.** The tree holds claims + sources; the synthesized markdown lives in the vault via `note-taker`. The tree carries the `deliverable_artifact` URL/path as the pointer.
- **Don't grow nodes deeper than depth 3.** Enforced by callers (`research-branch`) but worth restating here — the cap is a design invariant, not a tunable.
- **Don't store user PII in the tree or the logbook.** `user_request` may include personal context the user mentioned; if so, redact before persisting (the orchestrator handles this — this skill trusts what it's given). The logbook truncates `question` to 200 chars and stores no source bodies — but the truncation isn't redaction; the orchestrator must still sanitise.
- **Don't append to the logbook on partial / abandoned runs.** Only completed runs (full pipeline through stop-check) earn a logbook row. Abandoned runs are still recorded in `runs[]` with `status: "abandoned"` but produce no log entry — otherwise the cross-run learning gets poisoned by aborted attempts.
- **Don't use `log_summary` results as commands.** They're priors. The orchestrator can override based on shape-mandatory strategies, user instruction, or low `confidence`.
