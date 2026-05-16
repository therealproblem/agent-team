---
description: Cross-persona inner skill (engineer, trader). Hypothesis-driven bug localisation in any deterministic system — code, scripts, configs, tooling. Invoke when something is broken and the cause isn't yet known. Forces minimum-reproducer first, then narrows by binary search rather than guessing.
disable-model-invocation: true
---

# Debugger

Localise a bug by hypothesis, not by shotgun. The cost of a wrong fix is higher than the cost of one more diagnostic step.

## When to invoke

- Something is producing wrong output, crashing, or behaving inconsistently
- The cause isn't yet localised — could be data, code, config, env, dependency
- The caller is tempted to "try something and see" — interrupt that

## The loop

1. **State the symptom.** One sentence. Observed vs. expected.
2. **Build the minimum reproducer.** Smallest input + smallest code path that triggers it. If you can't reproduce, the bug isn't real *yet* — gather more observation.
3. **Bracket the suspect surface.** What's the smallest region of the system that could plausibly contain the cause? List candidates.
4. **Form one hypothesis at a time.** Write it down: "I believe X is the cause because Y."
5. **Design a discriminating test.** What single observation would prove or disprove the hypothesis? Run it.
6. **Update or replace the hypothesis** based on the result. Don't pile hypotheses; eliminate.
7. **Loop until the cause is named with evidence.** Not "I think it's the cache" — "the cache returns stale value X when key Y is queried after step Z, here's the trace".

## Output

```
SYMPTOM: <observed vs expected, one sentence>
REPRO: <minimum input + commands, runnable>
CANDIDATES: <surfaces eliminated → surfaces remaining>
HYPOTHESIS: <single sentence: cause + mechanism>
EVIDENCE: <what proved the hypothesis — trace, diff, log excerpt>
ROOT CAUSE: <one sentence, no speculation>
FIX SUGGESTION: <one line — or "needs separate design pass">
```

The fix is intentionally separate. Localising the bug and fixing it are two different acts; conflating them produces fast bad fixes.

## Don't

- **Don't change two things at once.** If you do and the bug disappears, you don't know which fix mattered.
- **Don't trust "it works on my machine" or "it was working yesterday."** Find the delta.
- **Don't fix a symptom without naming the cause.** The bug will return.
- **Don't shotgun edits and hope.** That's not debugging; that's guessing.

## Caller notes

- **Engineer**: code/system/script bugs. Standard use.
- **Trader**: bugs in *the user's tooling* — broken backtest, journal-import script, indicator script. NOT for "this trade went wrong" — that's trade analysis, not debugging.
