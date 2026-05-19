---
description: Layer 3 sub-skill of [[render-html]]. Wraps the `write_html_render_multipart` tool — writes one `.mdx` per part at the slugs the planner committed to, verifies each part compiles against the local Next.js dev server, and surfaces each verified URL into the TUI the moment that part lands. Caller is expected to have run `plan_html_render` first (see [[render-html-decide-split]]) and pass its `parts` array verbatim — titles, ordering, and markdown bodies must match what the planner produced, or the URLs the user already saw will route to different files.
---

# Render HTML — Write Multi

This sub-skill is the **multi-file writer** leg of the [[render-html]] family. The planner ([[render-html-decide-split]]) has already split the body and committed slugs/URLs for every part; this tool's job is to write the `.mdx` files, verify they compile, and stream URLs into the TUI as each part lands.

## Inputs

```
write_html_render_multipart({
  title:          "<overall title>",            // required — must match the planner's title
  parts: [
    { title: "<part 1 title>", markdown: "<part 1 body>" },
    { title: "<part 2 title>", markdown: "<part 2 body>" },
    …
  ],                                            // required — pass plan.parts straight through
  source_md_path: "<vault path>",               // optional — recorded in the response
})
```

The `parts` array must match the planner's output exactly:

- Same `title` per part (in same order). Slug derivation hashes the part title into `-part-NN-<part-title-slug>`; a renamed part lands at a different URL than the planner promised.
- Same ordering. Index controls both the visible "Part N" and the slug suffix.
- Same `markdown` per part. Length determines whether `html_stripped_count` is zero and the page compiles.

If you find yourself transforming the planner's parts, you're rewriting the plan — go back and call `plan_html_render` again instead.

## What the tool does

1. Derives the base slug and part slugs from the title + part titles (the same derivation the planner used, so URLs match).
2. Cleans up any prior single-page `<base>.mdx` and any prior `<base>-part-…mdx` files under the same base slug, so re-running with a different split shape doesn't leave stale URLs.
3. For each part: prepends frontmatter (`title`, `sidebar: false`, `part_slug`, `parts` sibling list), strips raw HTML, writes the `.mdx`.
4. Verifies every part's URL in parallel — fetches against `http://localhost:8080`, checks for Next.js compile-error pages.
5. As each verification resolves (success or failure), surfaces a status line into the TUI:
   - success: `Part N — <title>: <url>`
   - failure: `Part N — <title>: FAILED (<reason>)`

   This streaming is what lets the user see URLs trickle in instead of waiting for the slowest part. The braille working indicator stays alive throughout (the surface channel is separate from the tool's working state).
6. Returns the full results after the last verification resolves.

## Returned shape

Success:

```
{
  base_slug:      "<YYYY-MM-DD>-<title-slug>",
  title:          "<overall title>",
  source_md_path: "<vault path or undefined>",
  parts: [
    {
      slug:               "<base>-part-01-<part-title-slug>",
      url:                "http://localhost:8080/v/<slug>",
      title:              "<part title>",
      path:               "<absolute path>",
      html_stripped_count: <number>,
    },
    …
  ],
  // when called via the auto-split-shaped path from the orchestrator:
  auto_split?:               true,
  auto_split_source_lines?:  <count>,
}
```

Failure (`isError: true`): same shape, plus a `failed_parts` array describing which parts didn't compile and why. One broken part fails the whole multipart write — the sibling nav makes every broken part discoverable from every other page, so partial success isn't safe.

## Re-runs and cleanup

Same overall title, same day → the entire prior set under that base slug is cleaned up before the fresh set is written. This holds whether the prior set was a single-page render or a different shape of multipart. Splitting differently on re-run is safe; stale part URLs are removed in the same pass.

That cleanup is also why you should never hand-edit the `parts` array between plan and write. If the agent's tweaked titles produce different slugs than the planner's, the cleanup pass removes the planner's URLs and writes to fresh ones — and the user has already seen the planner's URLs in their terminal.

## Don't

- **Don't transform the planner's `parts` array.** Pass it through verbatim.
- **Don't reorder parts.** Order maps to "Part N" labels and slug ordering.
- **Don't rename part titles.** Slug derivation depends on title; a rename routes the URL the user already saw to a deleted file.
- **Don't include frontmatter** in any part's `markdown`. The tool prepends per-part frontmatter (including the sibling list that drives the "Parts" sidebar nav).
- **Don't include any raw HTML / JSX** in part bodies. Same rule as single-page — one stray tag in one part crashes that part's compilation, which fails the whole batch.
- **Don't say "done" on a `failed_parts` response.** Fix the broken part's markdown and re-call from the orchestrator (re-plan + re-write).
- **Don't list the parts in your chat reply before they verify.** The planner has already surfaced predicted URLs to the TUI; your reply uses the verified URLs from this tool's success response.
- **Don't post-process URLs.** Each part URL stands alone; no tunnel suggestions, no commentary.
