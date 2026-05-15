---
description: Layer 3 shared service — fast inline summarisation for URLs or pasted text. Companion to `research`. Invoke when the user wants to quickly understand what a link or block of text is *about* without committing to a saved note, an interactive page, or a printed deliverable. Triggers on "what's this about", "TL;DR this", "summarise this article", "give me the gist", "what does this say". Returns a tight inline summary (1-line gist + 3–5 bullet takeaways + open questions) — does NOT save to the vault, does NOT render HTML, does NOT produce a PDF. **Suppressed** when the user is asking for `export` (PDF) or `render-html` (HTML) or `note-taker` (save) — those are the destinations, not a summary. If the user later wants the summary kept, hand off to `note-taker`; if they want it shared as a page, `render-html`; if they want a printable brief, `export`.
---

# Summary

Quick read-side service: the user hands you a URL or a block of text and wants to know what it's about *right now*, in chat. No vault write. No HTML page. No PDF. Just a tight inline summary the user can read in 20 seconds.

> If the user says "save this" → `note-taker`. "Render this" / "make a page" → `render-html`. "Make a PDF" / "export this" → `export`. **Anything else where the goal is *understanding* the content** → this skill.

## When to call

Call `summary` when the user wants to *understand* a piece of content quickly:

- "What's this link about?" / "TL;DR this URL" / "give me the gist"
- "Summarise this article / thread / paper / README"
- Pastes a block of text and asks "what does this say?" / "what's the point of this?"
- Drops a URL with no further instruction — they want orientation, not archival
- After `research` has fetched a page, the caller persona wants a compact synthesis to reason over before deciding next steps

## When NOT to call

Suppress this skill when any of the following is in the request — the user has named a *destination* skill, and summary would duplicate or pre-empt the work:

- "Make this a **PDF**" / "**export** this" / "give me a printable / printed version" → `export`
- "Render this as a **page**" / "make it an **interactive** document" / "show it on the server" → `render-html`
- "**Save** this" / "**note** this down" / "write this up to the vault" → `note-taker`
- The user wants the **full content quoted verbatim** (changelog, release notes, a specific paragraph) — summary paraphrases; if they need the original text, hand back the fetch from `research` directly
- The content is **already short** (a tweet, a 2-paragraph blog post the user already pasted in full) — summarising 200 words into 5 bullets is friction, not value. Just answer the question they're asking about it.
- The user is doing a **structured task** (coding, debugging, PRD-writing) and references a URL only as a citation — fetch via `research` and use the content; don't insert a TL;DR they didn't ask for.

If the user names a destination AND wants a summary too ("summarise this and save it to the vault"), run summary first, then hand the produced summary text to `note-taker` as the body. Same pattern for `render-html` and `export`.

## Inputs

```
summary({
  // Source — exactly ONE of these is required.
  url:       "<absolute URL>",            // fetched via `research`
  text:      "<inline text the user pasted>",

  // Optional shaping
  focus:     "<what the user cares about>",   // e.g. "the API change", "the author's argument"
  length:    "tight" | "standard" | "deep",   // default "standard"
  language:  "en" | "cn" | "ja"               // default match the source language
})
```

`length` controls the bullet budget:

| Length | Gist | Bullets | Open questions |
|---|---|---|---|
| `tight` | 1 sentence | 2–3 | 0 |
| `standard` (default) | 1 sentence | 3–5 | up to 2 |
| `deep` | 1 short paragraph | 5–8, grouped by theme | 2–4 |

## Steps

1. **Resolve the source.**
   - If `url`, call `research` (`tff-fetch_url` with `format: "markdown"`). If the fetch returns garbage (auth wall, SPA shell, paywall teaser, anti-bot puzzle), walk the `research` fallback ladder — pivot render mode, try a canonical mirror, try a web archive — **before** falling back to summarising the fragment you got. Don't summarise a login-wall as if it were the article.
   - If `text`, use it as-is. Don't re-fetch anything the user already pasted.
2. **Read for the spine, not every word.** Skim `details.markdown` (or the inline text) for: the central claim, the supporting structure (sections, named arguments, data points), the conclusion, anything explicitly framed as "the takeaway". Ignore nav chrome, related-posts blocks, comment threads, and footer boilerplate.
3. **Apply `focus`** if provided. The user said "summarise this *for the API change*" — promote anything about the API change, demote everything else. If `focus` is absent, the summary covers the piece's own emphasis.
4. **Compose to length.** Hit the bullet budget for the requested `length`. Don't pad to fill it. If the source genuinely only has 2 takeaways, ship 2 bullets — don't fabricate a third.
5. **Surface open questions** (when `length` is `standard` or `deep`). These are questions the piece *raises but doesn't answer* — not your own curiosity. Useful prompts for follow-up: "what does the author cite for X?", "is the 40% figure from a primary or secondary source?".
6. **Cite the source.** Inline summary ends with a one-line attribution: `Source: <title> · <url>` (for a URL) or `Source: pasted text` (for inline). Don't quote-paste paragraphs back at the user — they have the link.
7. **Return inline.** This skill writes to chat. It does NOT call `write_note`, `write_html_render`, or `write_export_pdf`. If the user wants the summary persisted, that's a follow-up via `note-taker` (with the produced summary as the body).

## Output shape

The format is rigid so users can scan it in seconds.

```
**Gist** — <one-line synthesis of what this is about>

**Takeaways**
- <takeaway 1>
- <takeaway 2>
- <takeaway 3>
  …

**Open questions** *(omit when length=tight, or when the piece leaves nothing genuinely open)*
- <question 1>
- <question 2>

Source: <title> · <url>
```

For `length: "deep"`, group takeaways under sub-headers (`**Argument**`, `**Evidence**`, `**Caveats**`, etc.) when the piece naturally splits. For `length: "tight"`, drop the "Open questions" block and keep the whole thing under ~80 words.

## Reading the `research` result

If you called `tff-fetch_url`, read from **`details.markdown`** — the actual page body. The `content` field is a one-line TUI status (e.g. `200 (15942 markdown bytes)`) and is **not** the payload. Don't summarise the status line and claim the page was empty.

If `details.markdown` is present but is mostly login walls, sign-in CTAs, or paywall teasers, that's not "the article". Walk the `research` fallback ladder (render-mode pivot, canonical mirror, web archive) before producing a summary, or escalate to the user with what you actually got and why it's not summarisable.

## Caller patterns

| Caller / scenario | Use |
|---|---|
| User drops a URL in chat with no instruction | Default-summarise (`length: "standard"`) so they know what they're looking at |
| Engineer reviewing a library README before deciding adoption | `focus: "what this library does and how it differs from alternatives"` |
| PM scanning a competitor blog post | `focus: "any announced features, pricing, or roadmap signals"` |
| Educator pre-reading a paper for `corpus-learning` | `length: "deep"` — they need structure to build the lesson from |
| Trader looking at a macro release | `length: "tight"`, `focus: "the numbers vs. expectations"` |
| News skill (when fleshed out) | Delegates per-item summarisation here |

## Don't

- **Don't save to the vault.** Summary is ephemeral chat output. If the user wants it kept, they (or the persona) call `note-taker` next with the summary as the body.
- **Don't render HTML or PDF.** Those are `render-html` and `export`. A summary in chat is a summary in chat.
- **Don't editorialise.** State what the piece says; don't add "I think this is overblown" or "the author is wrong here". The user reads the source themselves to form a view.
- **Don't fabricate.** If the fetched page is a login wall or you only have a partial body, say so explicitly. Producing 5 plausible-sounding bullets from training data when the actual content is missing is the worst failure mode of this skill.
- **Don't paste long quotes.** If the user wants the original wording, they open the link or re-fetch via `research`. Summary paraphrases.
- **Don't auto-summarise everything.** If the user is in the middle of a task and references a URL as a citation (not as the topic), fetch via `research` and use it — don't insert an unprompted TL;DR.
- **Don't summarise content the user already pasted in full** and is asking a specific question about. Just answer the question.
- **Don't pre-empt a named destination.** If the user said "make a PDF of this article", they want the PDF, not a summary first. Call `export`. Same for `render-html` and `note-taker`.
- **Don't pad to length.** If the piece has 3 real takeaways, ship 3. The bullet budget is a ceiling, not a quota.

## Limits

- For URLs: bound by `research` / Camoufox limits. A 5-15s render delay on JS-heavy pages is normal; use `wait_for_selector` via `research` for those.
- For very long sources (>50KB markdown), the summary is necessarily lossy. If the user needs full coverage, hand off to `note-taker` for a structured write-up after the summary.
- Summary doesn't translate. If the source is in a language the user doesn't read, set `language` to the desired output and the summary will be in that language — but the source text isn't translated wholesale, only paraphrased into the target.
