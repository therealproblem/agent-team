---
description: Engineer collaborative skill. Use for UI implementation — components, state management, styling, accessibility, browser performance.
disable-model-invocation: true
---

# Frontend

Use for UI implementation: components, state, styling, accessibility, browser perf.

## Defaults

- **Component model:** function components + hooks unless project uses something else. Match the project.
- **Styling:** check what the project already uses (CSS modules, Tailwind, styled-components, vanilla-extract) and stay in that lane. Don't introduce a second system.
- **State:** local first, lifted next, global last. Reach for a global store only when ≥ 3 unrelated components need the same data.
- **Forms:** controlled inputs by default; uncontrolled only when integrating with non-React libraries.
- **Tokens over magic numbers:** spacing, type, color from the design system's tokens. If a DESIGN.md is linked, those hex values / scale rungs are the source of truth — don't re-derive.
- **Motion:** purposeful, not decorative. Default 150–250ms ease-out; respect `prefers-reduced-motion`.

## Rules

- Component file structure: one default export per file, named to match the file.
- Props: explicit types; no `any`; required vs optional must be intentional.
- Side effects in `useEffect` only when there's no synchronous alternative.
- Memoization (`useMemo`, `useCallback`) only with profiler evidence — premature memoization adds noise.
- Accessibility: every interactive element gets a name, role, and keyboard reachability. Don't ship a `<div onClick>`.
- Focus states are visible — never `outline: none` without a replacement.
- Touch targets ≥ 44×44 px on mobile.
- Color is never the only signal: pair with icon, text, or shape.
- Default, hover, active, disabled, loading, error, empty, and success states are all first-class — design them, don't tack them on.
- Truncation has a recovery (tooltip, expand, click-through).
- Forms surface validation inline, not on submit-only.
- Confirmation modals are reserved for destructive or irreversible actions; everything else gets undo.

## When you receive a design handoff

If the card links a `<vault>/ux/<slug>/DESIGN.md` (designer heavy-tier) or `design.md` (PM light-tier), check before implementing:

- Is every state defined? (default, hover, active, disabled, loading, error, empty, success)
- Is mobile defined? Tablet?
- Are interactive flows specified, including failure paths?
- Is the copy real, not `Lorem ipsum`?

If any are missing, return `NEEDS_DECISION` and name what's missing — don't silently invent.

## Performance checklist for any change touching render

- Is anything new running on every keystroke?
- Is the component tree re-rendering wider than necessary?
- Are images lazy-loaded with explicit dimensions?
- Are network requests deduped / cancelable?