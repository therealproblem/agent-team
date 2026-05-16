---
description: PM collaborative skill. Use when building a quarterly or themed roadmap with measurable success signals.
disable-model-invocation: true
---

# Roadmap Construction

Use when building a quarterly or themed roadmap.

## Structure

```
THEME: <one-line strategic bet>
HORIZON: <quarter or timeframe>

For each initiative:
  - Outcome: what changes for users / the business
  - Confidence: high / medium / low
  - Size: S / M / L
  - Dependencies: other initiatives, teams, external
  - Success signal: how we'll know it worked
```

## Rules

- Group by **outcome theme**, not by team or feature area. Themes survive reorgs; teams don't.
- Cap initiatives per quarter. If the list runs past ~5 mediums or 3 larges, you've over-committed.
- Confidence ≠ priority. A high-confidence small win can outrank a low-confidence big bet.
- Every initiative names a measurable success signal. "Ship the redesign" is not a signal; "task completion rate +10%" is.
- Dependencies are explicit. If A blocks B, label B as blocked until A ships.

## After drafting

- Save to `pm/roadmaps/<period>-<theme>.md` via `note-taker`.
- For exec-facing version: pass through `scribe` with audience `exec`, format `report`.