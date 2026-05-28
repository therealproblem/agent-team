---
description: PM collaborative skill. Use when picking a design language for a new product from `styles.refero.design` candidates and emitting a light-tier `design.md` for engineer to implement against. The engineer-side UX hygiene rules that used to live here now live in the `frontend` skill.
disable-model-invocation: true
---

# UI/UX — PM design-language evaluation

This is the **light tier** of the design pipeline. PM uses it to pick a design language for a new UI product without spinning up the full `designer` subagent. Output is a `design.md` saved to `<vault>/ux/<slug>/design.md` — the single fixed mockup location (per *Strictly enforced rule 3* in `.pi/SYSTEM.md`).

When the brief needs mockups, a storyboard, or generative-media prompts, use the `designer` subagent instead — see `.pi/agents/designer.md` and the pipeline overview in `.pi/SYSTEM.md`.

## Inputs you'll receive

- Product brief: audience, tone, content shape, must-have components
- 3–5 candidates from `https://styles.refero.design/?q=<search-query>`: name, URL, one-line description, palette/type/density notes the PM extracted

## Evaluation rubric (score each candidate 1–5 per dimension)

| Dimension | What you're checking |
|---|---|
| **Audience fit** | Does the visual register match the target user's expectations and context of use? |
| **Information density** | Does the layout vocabulary match how much content this product surfaces per screen? |
| **Component coverage** | Does the reference demonstrate the components this product actually needs (tables, charts, forms, nav patterns)? |
| **Tone match** | Does the visual mood support the product's promise (serious/playful, dense/spacious, technical/consumer)? |
| **Accessibility** | Color contrast, hierarchy legibility, focus affordance, motion restraint |

A candidate with any single dimension scoring ≤ 2 is disqualified unless the PM brief explicitly overrides that dimension.

## Output

A markdown block PM saves to `<vault>/ux/<slug>/design.md` via `note-taker`. Structure:

```markdown
## Decision

**Chosen:** <candidate name> — <refero URL>

**Why:** <2–3 sentences tying audience + tone + component coverage to the brief>

## Considered

| Candidate | Audience | Density | Components | Tone | A11y | Verdict |
|---|---|---|---|---|---|---|
| <name> | 4 | 3 | 5 | 4 | 5 | runner-up — <reason> |
| <name> | 3 | 5 | 2 | 3 | 4 | rejected — insufficient component coverage |

## Design tokens

- **Palette:** primary `#xxxxxx`, surface `#xxxxxx`, accent `#xxxxxx`, text-primary `#xxxxxx`, text-secondary `#xxxxxx`, border `#xxxxxx`
- **Type stack:** display, body, mono — name actual families
- **Type scale:** xs / sm / base / lg / xl / 2xl (with px or rem values)
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
- **Radius:** sm / md / lg
- **Motion:** default 200ms ease-out; reduce-motion: respected

## Components needed (from the brief)

- <component> — variant notes
- …

## Reference

- Primary: <refero URL>
- Secondary: <any supporting links the PM provided>
```

## Don't

- Don't pick on aesthetics alone. The rubric is the gate — if a prettier candidate fails component coverage, the uglier candidate wins.
- Don't invent tokens the reference doesn't actually demonstrate. If the reference doesn't show error states, say so under *Open questions* rather than fabricating an error color.
- Don't recommend a design language without naming the components needed. Without that list, the engineer has nothing to implement against.
- Don't propose an alternate save location. `<vault>/ux/<slug>/design.md` is the single fixed path.
