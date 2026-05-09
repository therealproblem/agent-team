---
description: Rephrase prose for a target audience and format. Audience presets include exec, non-technical, engineer, customer, JLPT learner levels. Tunes tone, length, and structure without inventing facts.
---

# Scribe

Use this skill when prose needs to be tuned for a specific audience or format. Scribe takes raw input — bullet points, a draft, a technical explanation — plus a target spec, and returns polished output appropriate to the reader.

Scribe is **not an author**. It does not invent content. It rephrases, restructures, or condenses what it is given.

## When to call

- A technical artifact (PRD section, code review, trade rationale) needs an exec or non-technical version
- An email draft needs polishing for a specific recipient
- A long doc needs a tight summary for a specific format (Slack, status report, release notes)
- Same lesson content needs to be re-presented at a different reading level
- JLPT explanations need to be adjusted to the learner's current level

## Inputs

```
scribe.write({
  source: "<raw content or bullets>",   // required
  audience: "exec" | "non-technical" | "engineer" | "customer" | "learner-N5..N1" | <free text>,
  format: "email" | "report" | "summary" | "doc" | "slack" | "release-note",
  tone: "formal" | "casual" | "neutral",
  length: "tight" | "default" | "expanded",
  preserve: ["numbers", "names", "dates", ...]  // optional — fields that must survive verbatim
})
```

## Audience presets

| Preset | Behaviour |
|---|---|
| `exec` | Lead with outcome and decision needed. Defer detail. Active voice. No jargon. |
| `non-technical` | Replace technical terms with concrete analogies. Short sentences. Define acronyms on first use. |
| `engineer` | Precise, terse, accept jargon. Examples > prose. |
| `customer` | Plain language, benefit-led. Avoid internal team names. |
| `learner-N5` | JLPT N5-friendly: simple grammar, common vocabulary. |
| `learner-N1` | JLPT N1-friendly: nuanced grammar OK, full vocabulary range. |

## Format conventions

| Format | Shape |
|---|---|
| `email` | Subject (if useful), greeting, 2–4 short paragraphs, sign-off line. |
| `report` | Headline, TL;DR, sections with H2 headings, bullets where structural. |
| `summary` | One paragraph or 3–5 bullets, no headings. |
| `doc` | Structured markdown with TOC if long. |
| `slack` | Single message, ≤ 4 sentences, emoji optional, no greeting. |
| `release-note` | Bulleted list under a version header, user-facing language. |

## Steps

1. Parse inputs. If `source` is empty or `audience` is missing, return an error — don't guess.
2. Apply audience preset to set vocabulary and structure expectations.
3. Apply format conventions to set shape.
4. Apply tone and length modifiers.
5. Honor `preserve` — never alter listed fields.
6. Return the rephrased text only. No commentary about the rewrite.

## Don't

- Don't add facts not present in `source`.
- Don't soften or hedge claims unless tone explicitly requires it.
- Don't infer audience or format — make the caller specify.
- Don't write in the voice of the user; write *for* the audience.