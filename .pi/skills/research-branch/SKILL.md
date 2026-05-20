---
description: Layer 3 shared service — discovery-driven branching loop for in-flight research. Detects mid-research scope changes (prerequisite / parent / sibling / pivot / citation / disqualifier), applies per-type policy (auto-pursue / escalate / branch / stop), enforces depth + budget guardrails, and spawns nodes on `.pi/state/research-tree.json` via the `research-tree` skill. Called from `research-survey`, deep-read, `triangulate`, and `steelman` — anywhere a discovery can fire.
---

# Research-branch

The mid-research loop. When a research run discovers a new topic that changes scope, this skill decides what to do: pursue silently, escalate to the user, queue as a parallel branch, or stop the run.

## When to call

- A snippet, fetched page, triangulate result, or steelman result surfaced a discovery that fits one of the 6 types (below).
- NEVER on hunches — only on concrete evidence (a source quote, a contradiction, a 404, a "deprecated" notice, a citation chain). The contract: discoveries require evidence, not vibes.

## The 6 discovery types

| Type | Trigger | Default policy |
|---|---|---|
| `prerequisite` | A source repeatedly assumes knowledge of Y; understanding the question requires Y first | Auto-pursue as child node (silent) if budget allows |
| `parent` | The question turns out to be a sub-case of a larger question the user probably wanted | Escalate to user — "expand scope?" |
| `sibling` | Practitioners have moved from X to Y; or Y is a credible alternative the question implicitly excludes | Queue as parallel branch, time-capped |
| `pivot` | The user's real decision is a different question than the one asked | **Always** escalate — never silently re-frame |
| `citation` | 3+ sources point at the same paper/post you haven't read | Silent add to source plan; no new node |
| `disqualifier` | The subject is deprecated, the claim is debunked, the API was removed | Stop the run, escalate immediately with evidence |

## Inputs

```json
{
  "current_node_id": "uuid",
  "discovery": {
    "type": "prerequisite | parent | sibling | pivot | citation | disqualifier",
    "evidence": [{ "url": "...", "exact_quote": "..." }],
    "suggested_question": "<one sentence — the new question>",
    "reasoning": "<one sentence — why this is the type you picked>"
  }
}
```

`evidence` must have ≥1 item. No evidence, no action.

## Output

```json
{
  "action_taken": "spawned_child | spawned_sibling | added_to_sources | escalated_to_user | stopped_run | noop",
  "new_node_id": "uuid | null",
  "escalation_message": "<text for the user, if action requires escalation>",
  "tree_state_after": <updated tree snapshot summary>
}
```

## Steps

1. **Validate evidence.** `evidence` must have ≥1 item with a real URL and a quote. If empty, return `noop` — discoveries without evidence don't get acted on.

2. **Load tree state.** Call `research-tree.read_tree()`. Find the current node and its run.

3. **Check guardrails:**
   - **Depth cap:** if `current_node.depth >= 3`, do NOT spawn a deeper child. For `prerequisite` or `sibling`, downgrade to `escalated_to_user` ("this discovery would exceed depth cap — spawn as separate research run?"). For `parent` and `pivot`, escalation is already the policy.
   - **Budget cap:** compute proposed child budget. If `current_node.budget_used + proposed >= current_node.budget_allocated * 1.25`, escalate ("this branch would exceed budget — continue, abandon, or surface as is?").
   - **Sibling fan-out cap:** if the current node already has 3+ siblings at the same depth, escalate. Wide branching at one level means the scope was wrong; better to re-frame than to add a 4th sibling.
   - **Per-run discovery cap:** if this is the 5th+ discovery acted on in the current run, return `noop` with reason "discovery cap hit — finish current branches before adding more."

4. **Apply per-type policy:**

   - **`prerequisite`** — `spawn_node({ parent_id: current_node_id, discovery_type: "prerequisite", question: suggested_question, budget_fraction: 0.25, notes: <reasoning> })`. Action = `spawned_child`. The orchestrator pauses the current node and runs the new one to completion before resuming. The prereq's TL;DR claim gets added as context to the parent on resume.

   - **`parent`** — Compose an escalation: "While researching '<current question>', I noticed this looks like a sub-case of '<suggested_question>'. Want me to expand scope to the parent, or stay narrow?" Action = `escalated_to_user`. Do NOT spawn anything until the user answers.

   - **`sibling`** — `spawn_node({ parent_id: current_node.parent_id, discovery_type: "sibling", question: suggested_question, budget_fraction: 0.30, notes: <reasoning> })` (sibling is a child of the *parent*, not the current node — same depth). Action = `spawned_sibling`. Tag the sibling node with `status: "active"` and let the orchestrator run it in parallel (or sequentially if parallel isn't available).

   - **`pivot`** — Escalation only: "You asked about '<current question>', but the evidence suggests your actual decision is '<suggested_question>'. Pivot the run, or stay with the original question?" Action = `escalated_to_user`. Never silently re-frame the user's question.

   - **`citation`** — Add the cited URL to `current_node.sources` via `research-tree.add_source(...)`. No new node. Note in the source's `notes`: "cited by N sources during run." Action = `added_to_sources`. The orchestrator will pick it up on the next deep-read pass via `source-rank`.

   - **`disqualifier`** — Set `current_node.status = "abandoned"`. Surface escalation: "Stopping research on '<question>' — <evidence>. The subject is deprecated/debunked/removed. Want me to research the current replacement instead, or stop entirely?" Action = `stopped_run`. The run's `status` stays `active` until the user responds; the orchestrator marks it `abandoned` only on user confirmation.

5. **Update tree state** via `research-tree` operations.

6. **Return JSON.** Orchestrator handles the escalation (if any) and either waits for user input or continues.

## Escalation message rules

- One sentence describing the discovery, with the evidence quote.
- One sentence offering 2–3 explicit options.
- Default option highlighted ("If you don't reply, I'll <default>.").

Example for `pivot`:

> While researching "should we adopt Redis Streams," I noticed three of your last messages suggest your real question is "what's the right pub-sub for our event-bus rewrite" — Streams is one of several options (NATS, Kafka, Redpanda also fit). Pivot to the broader comparison, stay with Redis Streams specifically, or branch into both? If you don't reply, I'll stay with Redis Streams.

## Frequency limits

- Max **5 discoveries acted on per run** (across all types). After the 5th, return `noop` for further discoveries with reason "discovery cap hit — finish current branches before adding more." Prevents discovery-cascade where every fetch spawns three new branches.
- Max **1 `pivot`** per run. The user re-framing once is normal; re-framing twice means the orchestrator is drifting and should surface to the user instead.
- Max **1 `disqualifier`** per run (it stops the run anyway).
- Max **2 `parent`** escalations per run. If the user keeps wanting to expand scope, the original question was too narrow — the orchestrator should suggest restarting with a broader frame.

## Interaction with research-stop-check

`research-stop-check` runs at the end and verifies every spawned branch is either `done` or `abandoned`. A dangling `active` or `paused` child branch is a fail — caller must finish or abandon before the run can complete.

## Don't

- **Don't fire on hunches.** Evidence-required is the contract. "I have a feeling Y might be related" is not a discovery; "this RFC explicitly says X depends on Y" is.
- **Don't auto-pursue parents or pivots.** Scope expansion is the user's decision. Even when the parent question is "obviously" what they wanted, ask.
- **Don't grow trees deeper than 3.** The cap exists because branching cost compounds. Deep-depth discoveries become "spawn as a separate research run" suggestions.
- **Don't spawn a child for every interesting tangent.** If a discovery wouldn't have fit one of the 6 types cleanly, it's noise — skip it and continue the current node.
- **Don't return prose to the orchestrator.** Return the JSON action shape. Escalations are strings inside the JSON, not freeform replies.
- **Don't escalate without a default.** Every escalation message must include what the orchestrator will do if the user doesn't reply. Otherwise the run hangs.
