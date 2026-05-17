---
description: Engineer collaborative skill. Use when implementing or evaluating UI behaviour with design intent in mind.
disable-model-invocation: true
---

# UI/UX

Use when implementing or evaluating UI behavior with design intent in mind. You implement; you don't design from scratch.

## Defaults

- **Component reuse:** before building, check the project's component library. Adding a new variant of an existing component beats inventing a new one.
- **Spacing / type / color:** use the design system's tokens. No magic numbers.
- **Motion:** purposeful, not decorative. Default 150–250ms ease-out; reduce-motion respected.
- **Empty / loading / error / success states:** all four exist for any user-facing flow.

## Rules

- Touch targets: ≥ 44×44 px on mobile.
- Focus states are visible — never `outline: none` without a replacement.
- Color is never the only signal: pair with icon, text, or shape.
- Truncation has a recovery (tooltip, expand, click-through).
- Forms surface validation inline, not on submit-only.
- Confirmation modals are reserved for destructive or irreversible actions; everything else gets undo.

## Hand-off checklist (when receiving designs)

- Is every state defined? (default, hover, active, disabled, loading, error, empty)
- Is mobile defined? Tablet?
- Are interactive flows specified, including failure paths?
- What's the copy? (Don't ship `Lorem ipsum`.)

If any of these are missing, name them in the response before implementing.

## Design language evaluation (called by PM)

When the PM persona is establishing the design language for a new product, it fetches candidate references from `https://styles.refero.design/?q=<search-query>` and hands you the candidates + the product brief. Your job: pick one, justify it, and produce the body of a `design.md` the engineer will implement against.

### Inputs you'll receive

- Product brief: audience, tone, content shape, must-have components
- 3–5 candidates from refero.design: name, URL, one-line description, palette/type/density notes the PM extracted

### Evaluation rubric (score each candidate 1–5 per dimension)

| Dimension | What you're checking |
|---|---|
| **Audience fit** | Does the visual register match the target user's expectations and context of use? |
| **Information density** | Does the layout vocabulary match how much content this product surfaces per screen? |
| **Component coverage** | Does the reference demonstrate the components this product actually needs (tables, charts, forms, nav patterns)? |
| **Tone match** | Does the visual mood support the product's promise (serious/playful, dense/spacious, technical/consumer)? |
| **Accessibility** | Color contrast, hierarchy legibility, focus affordance, motion restraint |

A candidate with any single dimension scoring ≤ 2 is disqualified unless the PM brief explicitly overrides that dimension.

### Output

A markdown block the PM will save to the vault. Structure:

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

### Don't

- Don't pick on aesthetics alone. The rubric is the gate — if a prettier candidate fails component coverage, the uglier candidate wins.
- Don't invent tokens the reference doesn't actually demonstrate. If the reference doesn't show error states, say so under *Open questions* rather than fabricating an error color.
- Don't recommend a design language without naming the components needed. Without that list, the engineer has nothing to implement against.