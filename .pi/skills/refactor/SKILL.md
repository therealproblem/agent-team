---
description: Engineer inner skill. Plan and execute structural code changes WITHOUT altering observable behaviour. Invoke for rename, extract, inline, move, split-module, collapse-duplication, change-data-shape, etc. Test-anchored, diff-aware, minimum-step. Refusing-to-fix-bugs-and-add-features-in-the-same-diff is the point.
disable-model-invocation: true
---

# Refactor

Restructure without changing behaviour. If observable output changes, it's not a refactor — it's a behaviour change wearing the wrong label.

## When to invoke

- Code structure is in the way of the next change (the *whole* point of refactoring is usually "to make adding feature X easier")
- Duplication has crossed a threshold and the abstraction is now clear (not before)
- A function/module has grown past comprehension
- A rename or move would meaningfully reduce reader confusion

## The pre-check

Before touching anything:

1. **Is there test coverage** for the affected behaviour? If no → write tests first. Without tests, you have no contract to preserve.
2. **What change are you about to enable?** "Refactoring for cleanliness" is rarely worth it on its own. Tie the refactor to a concrete next step.
3. **Is the diff going to be reviewable?** A 2000-line move/rename is a code-review nightmare. Plan it as multiple smaller commits.

## The loop

1. **Run existing tests. Green.** This is the contract.
2. **Pick the smallest mechanical transform** that moves you toward the goal — extract function, inline variable, rename, move file, change parameter order, etc.
3. **Apply it. Run tests. Green.**
4. **Commit** (or stage as a clearly-named diff).
5. Repeat until the structure is in the shape you wanted.
6. **Never combine a refactor with a behaviour change.** If you spot a bug mid-refactor, write it down and fix it *separately*.

## Output

```
INTENT: <one sentence — what shape are you moving toward, and why>
ENABLES: <the next concrete change this unblocks>
STEPS:
  1. <mechanical transform — verb + object>
  2. <mechanical transform>
  3. ...
TESTS: <which tests anchor this — green before AND after each step>
RISKS: <anything that might surprise — generated code, reflection, dynamic dispatch>
```

## Don't

- **Don't refactor and add features in the same diff.** Ever. Separate commits, separate PRs.
- **Don't refactor without tests.** Write them first, even if cheap.
- **Don't refactor for "cleanliness" alone.** Refactoring earns its cost by enabling the next change.
- **Don't over-abstract on the first duplication.** Wait for the third. Two cases is a coincidence; three is a pattern.
- **Don't change public APIs as part of "an internal refactor."** That's a versioned breaking change with its own process.
