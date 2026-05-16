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