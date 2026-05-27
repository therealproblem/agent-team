---
description: "Layer 3 sub-skill of [[render-html]]. Wraps the `write_html_render` tool — writes one `.mdx` file at the slug the planner committed to, verifies the page actually compiles against the local Next.js dev server, and returns the verified URL. Pure single-page writer; refuses with isError if the markdown crosses the auto-split threshold without `force_single`. Caller is expected to have run `plan_html_render` first (see [[render-html-decide-split]]) and only invoke this tool when the plan returned `mode: \"single\"`."
---

# Render HTML — Write Single

This sub-skill is the **single-file writer** leg of the [[render-html]] family. The planner ([[render-html-decide-split]]) has already decided the body fits on one page; this tool's job is to write that one `.mdx`, verify it compiles, and surface the URL.

## Inputs

```
write_html_render({
  title:          "<title>",                    // required — must match the planner's title
  markdown:       "<assembled markdown body>",  // required — must match the planner's markdown
  source_md_path: "<vault path>",               // optional — recorded in the response
  force_single:   false,                         // optional — override the over-threshold guard
})
```

`title` and `markdown` must match exactly what was passed to `plan_html_render`. If they don't:
- A different `title` produces a different slug → the URL the user already saw points to nothing.
- A different `markdown` length might trip the threshold guard the planner cleared.

## The threshold guard

The tool refuses if `markdown` is ≥ 1200 lines AND `force_single` is not set. It returns `isError: true` with `guard: "over_threshold_without_force_single"` and a message that says "call plan_html_render first." This is the deliberate decoupling: a single-page render of a 5000-line doc is a broken UX, so the writer makes that hard to do by accident.

When does the guard trip even though you came from the planner?

- The planner returned `mode: "single"` with `override_reason: "force_single"`. You must pass `force_single: true` to the writer too, otherwise the guard fires.
- The planner returned `mode: "single"` with `auto_split_skipped_reason` (the body is over threshold but has no `##` boundaries). Same fix: pass `force_single: true` to acknowledge you're knowingly shipping a long single page.
- The planner returned `mode: "multipart"` and you called the wrong writer. Call `write_html_render_multipart` with `plan.parts` instead.

## What the tool does

1. Refuses early if the threshold guard fires.
2. Derives the slug as `<YYYY-MM-DD>-<slugify(title)>` — the same derivation the planner used, so the URL matches.
3. Creates `<vault>/artifacts/renders/` if missing.
4. Cleans up any stale `<base-slug>-part-N-…mdx` files left over from a prior multipart render under the same base, so a switch from multipart to single doesn't leave coexisting flavors.
5. Strips raw HTML / JSX tags from the body (defense-in-depth — MDX is fragile and a stray `<div>` crashes compilation). Reports `html_stripped_count`.
6. Prepends frontmatter (`title`, `sidebar: false`) and writes the `.mdx`.
7. Fetches the URL against `http://localhost:8080` and confirms it doesn't return a Next.js compile-error page.
8. Surfaces `Rendered (single): <url>` to the TUI on success, returns the verified URL.

## Returned shape

Success:

```
{
  slug:               "<YYYY-MM-DD>-<title-slug>",
  url:                "http://localhost:8080/v/<slug>",
  path:               "<absolute path>",
  title:              "<title>",
  source_md_path:     "<vault path or undefined>",
  html_stripped_count: <number>,
}
```

Failure (`isError: true`):

- Threshold-guard refusal: `guard: "over_threshold_without_force_single"`, plus `source_lines` and `threshold`. No file is written.
- Verification failure: same shape as success but with `verify_error: <reason>`. The file IS on disk; the page didn't compile.

## Math formulas in the body

The MDX pipeline runs `remark-math` + `rehype-katex`, so any LaTeX you embed renders at compile time:

- Inline: `$a^2 + b^2 = c^2$` mid-sentence.
- Block: a `$$…$$` fence on its own paragraph with blank lines above and below.

Escape literal dollars in prose as `\$` once the doc has math in it — otherwise the next `$` will be parsed as inline math. Full guidance and KaTeX caveats are in the [[render-html]] agent's *Math formulas* section. (Same pipeline as the multipart writer — math syntax behaves identically in either.)

## Don't

- **Don't pass a markdown body different from what the planner saw.** Slugs and URLs only line up when inputs match.
- **Don't pass `force_single: true` defensively.** If the planner said `mode: single` *without* `override_reason`, the body is naturally under threshold and the flag is noise.
- **Don't include frontmatter** in `markdown`. The tool prepends `title` + `sidebar: false`.
- **Don't include any of:** `<!doctype>`, `<html>`, `<head>`, `<style>`, `<script>`, or any raw HTML / JSX tags. The MDX compiler is permissive enough to crash on a stray `<div>`; the stripper helps but isn't a license.
- **Don't say "done" on a `verify_error` response.** The page is broken; fix the markdown and re-call the orchestrator (re-plan + re-write).
- **Don't post-process the URL.** No "wrap with cloudflared", no "you can also reach this at...". The URL stands alone.
