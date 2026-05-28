---
description: Cross-persona inner skill (engineer, trader). Hypothesis-driven bug localisation in any deterministic system — code, scripts, configs, tooling. Invoke when something is broken and the cause isn't yet known. Forces a feedback loop and minimum reproducer first, then narrows by ranked falsifiable hypotheses rather than guessing. Absorbs Matt Pocock's `diagnose` discipline.
disable-model-invocation: true
---

# Debugger

Localise a bug by hypothesis, not by shotgun. The cost of a wrong fix is higher than the cost of one more diagnostic step.

## When to invoke

- Something is producing wrong output, crashing, or behaving inconsistently
- The cause isn't yet localised — could be data, code, config, env, dependency
- The caller is tempted to "try something and see" — interrupt that

## Phase 1 — Build a feedback loop

**This is the skill.** Everything else is mechanical. If you have a fast, deterministic, agent-runnable pass/fail signal for the bug, you will find the cause — bisection, hypothesis-testing, and instrumentation all just consume that signal. If you don't have one, no amount of staring at code will save you.

Spend disproportionate effort here. **Be aggressive. Be creative. Refuse to give up.**

### Ways to construct one — try them in roughly this order

1. **Failing test** at whatever seam reaches the bug — unit, integration, e2e.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **Headless browser script** (Playwright / Puppeteer) — drives the UI, asserts on DOM/console/network.
5. **Replay a captured trace.** Save a real network request / payload / event log to disk; replay it through the code path in isolation.
6. **Throwaway harness.** Spin up a minimal subset of the system (one service, mocked deps) that exercises the bug code path with a single function call.
7. **Property / fuzz loop.** If the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode.
8. **Bisection harness.** If the bug appeared between two known states (commit, dataset, version), automate "boot at state X, check, repeat" so you can `git bisect run` it.
9. **Differential loop.** Run the same input through old-version vs new-version (or two configs) and diff outputs.
10. **HITL bash script.** Last resort. If a human must click, drive *them* with a structured loop (prompt → wait for input → record outcome → loop) so the loop is still mechanical.

Build the right feedback loop, and the bug is 90% fixed.

### Iterate on the loop itself

Treat the loop as a product. Once you have *a* loop, ask:

- Can I make it faster? (Cache setup, skip unrelated init, narrow the test scope.)
- Can I make the signal sharper? (Assert on the specific symptom, not "didn't crash".)
- Can I make it more deterministic? (Pin time, seed RNG, isolate filesystem, freeze network.)

A 30-second flaky loop is barely better than no loop. A 2-second deterministic loop is a debugging superpower.

### Non-deterministic bugs

The goal is not a clean repro but a **higher reproduction rate**. Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A 50%-flake bug is debuggable; 1% is not — keep raising the rate until it's debuggable.

### When you genuinely cannot build a loop

Stop and say so explicitly. List what you tried. Ask the user for: (a) access to whatever environment reproduces it, (b) a captured artifact (HAR file, log dump, core dump, screen recording with timestamps), or (c) permission to add temporary production instrumentation. Do **not** proceed to hypothesise without a loop.

## Phase 2 — Reproduce

Run the loop. Watch the bug appear.

Confirm:

- [ ] The loop produces the failure mode the **user** described — not a different failure that happens to be nearby. Wrong bug = wrong fix.
- [ ] The failure is reproducible across multiple runs (or, for non-deterministic bugs, reproducible at a high enough rate to debug against).
- [ ] You have captured the exact symptom (error message, wrong output, slow timing) so later phases can verify the fix actually addresses it.

Do not proceed until you reproduce the bug.

## Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses** before testing any of them. Single-hypothesis generation anchors on the first plausible idea — that's what produces wrong-fix-wearing-confidence.

Each hypothesis must be **falsifiable**: state the prediction it makes.

> Format: *"If `X` is the cause, then changing `Y` will make the bug disappear / changing `Z` will make it worse."*

If you cannot state the prediction, the hypothesis is a vibe — discard or sharpen it.

**Show the ranked list to the user before testing.** They often have domain knowledge that re-ranks instantly (*"we just deployed a change to #3"*), or know hypotheses they've already ruled out. Cheap checkpoint, big time saver. Don't block on it — proceed with your ranking if the user is AFK.

## Phase 4 — Instrument

Each probe must map to a specific prediction from Phase 3. **Change one variable at a time.**

Tool preference:

1. **Debugger / REPL inspection** if the env supports it. One breakpoint beats ten logs.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never *"log everything and grep"*.

**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup at the end becomes a single grep. Untagged logs survive; tagged logs die.

**Perf branch.** For performance regressions, logs are usually wrong. Instead: establish a baseline measurement (timing harness, `performance.now()`, profiler, query plan), then bisect. Measure first, fix second.

## Phase 5 — Fix + regression test

Write the regression test **before the fix** — but only if there is a **correct seam** for it.

A correct seam is one where the test exercises the **real bug pattern** as it occurs at the call site. If the only available seam is too shallow (single-caller test when the bug needs multiple callers, unit test that can't replicate the chain that triggered the bug), a regression test there gives false confidence.

**If no correct seam exists, that itself is the finding.** Note it. The codebase architecture is preventing the bug from being locked down. Flag this for Phase 6.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 feedback loop against the original (un-minimised) scenario.

The fix is intentionally separate from localisation. Localising the bug and fixing it are two different acts; conflating them produces fast bad fixes.

## Phase 6 — Cleanup + post-mortem

Required before declaring done:

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
- [ ] Regression test passes (or absence of seam is documented)
- [ ] All `[DEBUG-...]` instrumentation removed (`grep` the prefix)
- [ ] Throwaway prototypes deleted (or moved to a clearly-marked debug location)
- [ ] The hypothesis that turned out correct is stated in the commit / PR message — so the next debugger learns

**Then ask: what would have prevented this bug?** If the answer involves architectural change (no good test seam, tangled callers, hidden coupling), hand off to the `improve-codebase-architecture` skill with the specifics. Make the recommendation **after** the fix is in, not before — you have more information now than when you started.

## Output

```
SYMPTOM: <observed vs expected, one sentence>
LOOP: <how you reproduce it — command + expected pass/fail signal>
REPRO: <minimum input + commands, runnable>
HYPOTHESES (ranked):
  1. <falsifiable: cause + mechanism + prediction>
  2. <falsifiable: cause + mechanism + prediction>
  3. <falsifiable: cause + mechanism + prediction>
EVIDENCE: <what proved the winning hypothesis — trace, diff, log excerpt>
ROOT CAUSE: <one sentence, no speculation>
FIX SUGGESTION: <one line — or "needs separate design pass">
REGRESSION TEST: <path:line of the test that now locks this down — or "no correct seam; flagged for improve-codebase-architecture">
```

## Don't

- **Don't change two things at once.** If you do and the bug disappears, you don't know which fix mattered.
- **Don't trust "it works on my machine" or "it was working yesterday."** Find the delta.
- **Don't fix a symptom without naming the cause.** The bug will return.
- **Don't shotgun edits and hope.** That's not debugging; that's guessing.
- **Don't proceed to Phase 3 without a feedback loop.** Hypotheses with no loop to consume them are just opinions.
- **Don't ship untagged debug logs.** Tag with `[DEBUG-<hex>]` so cleanup is a single grep.

## Caller notes

- **Engineer**: code/system/script bugs. Standard use. For performance regressions, take the perf branch in Phase 4 (measure first, log second).
- **Trader**: bugs in *the user's tooling* — broken backtest, journal-import script, indicator script. NOT for "this trade went wrong" — that's trade analysis, not debugging.

## Source

The hypothesis-loop framing is original to this skill. The feedback-loop discipline (Phase 1 — 10 techniques, iterate-the-loop, non-deterministic handling, escape hatch), the ranked-falsifiable-hypotheses pattern (Phase 3), the tagged-instrumentation rule (Phase 4), the correct-seam regression-test insight (Phase 5), and the post-mortem hand-off to `improve-codebase-architecture` (Phase 6) are absorbed from [mattpocock/skills/engineering/diagnose](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnose/SKILL.md).
