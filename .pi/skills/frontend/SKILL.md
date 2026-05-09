# Frontend

Use for UI implementation: components, state, styling, accessibility, browser perf.

## Defaults

- **Component model:** function components + hooks unless project uses something else. Match the project.
- **Styling:** check what the project already uses (CSS modules, Tailwind, styled-components, vanilla-extract) and stay in that lane. Don't introduce a second system.
- **State:** local first, lifted next, global last. Reach for a global store only when ≥ 3 unrelated components need the same data.
- **Forms:** controlled inputs by default; uncontrolled only when integrating with non-React libraries.

## Rules

- Component file structure: one default export per file, named to match the file.
- Props: explicit types; no `any`; required vs optional must be intentional.
- Side effects in `useEffect` only when there's no synchronous alternative.
- Memoization (`useMemo`, `useCallback`) only with profiler evidence — premature memoization adds noise.
- Accessibility: every interactive element gets a name, role, and keyboard reachability. Don't ship a `<div onClick>`.
- Loading and error states are first-class — design them, don't tack them on.

## Performance checklist for any change touching render

- Is anything new running on every keystroke?
- Is the component tree re-rendering wider than necessary?
- Are images lazy-loaded with explicit dimensions?
- Are network requests deduped / cancelable?
