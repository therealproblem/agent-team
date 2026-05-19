---
description: Layer 3 sub-skill of [[render-html]]. Wraps the `plan_html_render` tool — given a title + assembled markdown body, decides whether the render should land as a single page or a multi-part set, and returns a deterministic plan with predetermined slugs and URLs. No files are written. The plan is the source of truth for filenames; both writer tools agree with it because slug derivation is pure on (date, title, parts ordering, parts titles). The plan is also surfaced to the user's terminal the instant it's computed, so URLs appear before any I/O.
---

# Render HTML — Decide Split

This sub-skill is the **decider** step of the [[render-html]] family. It's just a thin wrapper around the `plan_html_render` tool; if you're authoring the markdown body, the orchestrator skill calls the tool for you. This file documents the contract so callers know what to pass and what to expect back.

## Why a separate step exists

The renderer used to auto-split inside the writer. That hid the decision: the agent passed the body in and got either one URL or N URLs back, depending on length. Two problems:

1. **URLs surfaced late.** The user saw the URL only after the file had been written and verified — for a multi-part curriculum that's seconds of "what is happening".
2. **Slug + URL determination was opaque.** Callers couldn't know the filenames until the writer was done, so they couldn't pre-announce, log, or share URLs before the write completed.

Pulling the decision out of the writer fixes both. The planner is pure: it slugs everything, splits if needed, surfaces the URLs to the TUI, and hands the plan back. The writer is then a mechanical filler — it can't reach a different URL than the plan claimed.

## Inputs

```
plan_html_render({
  title:           "<overall title>",          // required — used to derive base slug
  markdown:        "<assembled markdown body>", // required — the body to plan over
  source_md_path:  "<vault path>",              // optional — informational
  force_single:    false,                       // optional — force single even if oversize
})
```

`title` must match the title later passed to the writer tools. Slug derivation is `<YYYY-MM-DD>-<slugify(title)>`, so a mismatched title produces a different URL than the plan claimed.

`markdown` must be the exact body the writer will receive. The planner walks it to count lines and to split along `##` headings; passing a near-but-not-identical body breaks the URL ↔ file mapping.

## Decision logic

1. If `force_single` is true → `mode: "single"` with `override_reason: "force_single"`.
2. Else count lines. If `< 1200` (the auto-split threshold) → `mode: "single"`.
3. Else walk top-level `##` headings (fence-aware: `##` inside ``` and ~~~ doesn't count). Bucket sections greedily into parts of ≤ 600 lines each (`MAX_LINES_PER_PART`). A `##` section larger than 600 on its own becomes a single-section part — the planner never splits mid-section, because that breaks the "self-contained part" guarantee. A final part smaller than 100 lines is merged back into its predecessor when there's headroom.
4. If the splitter produces ≥ 2 buckets → `mode: "multipart"` with the parts array.
5. Else (no `##` headings to split along, or everything fits in one bucket despite the line count) → `mode: "single"` with `auto_split_skipped_reason` set so the orchestrator can see why.

## Returned plan

### Single mode

```
{
  mode: "single",
  base_slug:     "<YYYY-MM-DD>-<title-slug>",
  source_lines:  <count>,
  slug:          "<same as base_slug>",
  url:           "http://localhost:8080/v/<slug>",
  path:          "<absolute path to the .mdx the writer will create>",
  title:         "<title>",
  source_md_path: "<vault path or undefined>",
  // present only when applicable:
  override_reason?:         "force_single",
  auto_split_skipped_reason?: "no top-level `##` headings to split along"
                            | "all sections fit within MAX_LINES_PER_PART",
}
```

### Multipart mode

```
{
  mode: "multipart",
  base_slug:     "<YYYY-MM-DD>-<title-slug>",
  source_lines:  <count>,
  title:         "<overall title>",
  source_md_path: "<vault path or undefined>",
  parts: [
    {
      index:    1,                  // 1-based, matches the visible "Part N"
      slug:     "<base-slug>-part-01-<part-title-slug>",
      url:      "http://localhost:8080/v/<slug>",
      path:     "<absolute path>",
      title:    "<part title — derived from the first `##` heading in this bucket>",
      markdown: "<this part's markdown body, exactly as the writer will receive it>",
      lines:    <count>,
    },
    …
  ],
}
```

The `parts` array is what `write_html_render_multipart` consumes. Hand it through verbatim — don't re-derive titles, re-split, or otherwise transform.

## URL surfacing

The planner pushes the plan into the TUI via a boxed `render-html` status message the moment it returns:

- single: `Planned (single): <url>`
- multipart: `Planned (multipart, N parts):` followed by one `Part N — <title>: <url>` line per part.

The user sees these URLs immediately, without waiting for any writes. The orchestrator skill should *not* echo the same URLs back in its own user-facing reply — wait until the writes verify (the writers each emit their own `Rendered:` / per-part status), then summarize in the orchestrator's reply pattern.

## When to call

- The orchestrator always calls this before either writer tool.
- A persona that's hand-running the flow (rare — usually the orchestrator handles it) calls it explicitly when it wants the URLs in advance for logging or pre-announcement.

## When NOT to call

- Not for re-writes when the source title hasn't changed and you already have a plan from this turn. The plan is pure on inputs; recomputing burns tokens.
- Not as a "does this need rendering at all?" check. That decision is upstream (see [[render-html]] § *When to call*). The planner assumes you've already committed to rendering.

## Don't

- **Don't construct slugs / URLs yourself.** The planner is the only authority. If you compute a slug in the agent and pass it as part of the title, you'll desync with the writer.
- **Don't modify the `parts` array** before handing it to `write_html_render_multipart`. The titles, ordering, and markdown bodies must match what the planner produced, or the URLs the user already saw will go to different files than what gets written.
- **Don't surface the planned URLs in your chat reply.** The planner already surfaced them to the TUI. Your reply uses the verified URLs the writers return after compilation succeeds.
