---
description: Layer 3 shared service — read/write contract for `.pi/state/research-tree.json`, the tree-shaped state replacing the flat research-history.json. Each research run is a tree of nodes (root question + prereq/parent/sibling branches), each node carrying its own claims, sources, status. Used by the `research` orchestrator, `research-branch` (which spawns nodes), `synthesize` (which walks the tree), and the "what did I research recently?" query path.
---

# Research-tree

The state file shape and access patterns for `.pi/state/research-tree.json`. Replaces the older flat `.pi/state/research-history.json` (which can be archived but should not be deleted — back-compat for any persona still reading it).

## File location

```
.pi/state/research-tree.json
```

Owned by this skill. Other skills (`research`, `research-branch`, `synthesize`, `research-stop-check`) read/write through the operations below. Direct file access from outside this skill is forbidden.

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

### `complete_run({ run_id, deliverable_artifact })`

Sets `completed: now`, `status: "completed"`, and the artifact URL/path on the run.

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

Keeps the most recent `limit` completed runs; archives older runs (and their nodes) to `.pi/state/research-tree.archive.json`. Active runs are never trimmed.

## Write discipline

1. **Read before write.** Every mutation re-reads the file first to avoid clobbering concurrent updates.
2. **Pretty-print JSON.** 2-space indent, trailing newline. Matches the project convention (`news-bookmarks.json` etc).
3. **Atomic via temp-file swap.** Write to `.tmp`, fsync, rename. Avoids torn files if the process dies mid-write.
4. **No partial nodes.** A node must be appended fully-formed; never write a node with `id` set and other fields TBD.

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

These queries do NOT create new nodes.

## Don't

- **Don't read or write the file from outside this skill.** Other skills call the operations above; they never touch the JSON directly.
- **Don't mutate completed runs.** Once `status: completed`, the run and its nodes are immutable. Follow-up research starts a new run (the orchestrator may add a `prior_run_id` reference in the new run's `notes` for the link).
- **Don't store synthesis output here.** The tree holds claims + sources; the synthesized markdown lives in the vault via `note-taker`. The tree carries the `deliverable_artifact` URL/path as the pointer.
- **Don't grow nodes deeper than depth 3.** Enforced by callers (`research-branch`) but worth restating here — the cap is a design invariant, not a tunable.
- **Don't store user PII in the tree.** `user_request` may include personal context the user mentioned; if so, redact before persisting (the orchestrator handles this — this skill trusts what it's given).
