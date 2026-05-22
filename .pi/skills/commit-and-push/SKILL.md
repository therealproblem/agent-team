---
description: Engineer inner skill. Commit and push changes as the final step of completing work. Commit/push is NEVER its own card — it's part of finishing the card you're already executing.
disable-model-invocation: true
---

# Commit and Push

Commit and push completed work. This is NOT a separate card — it's the final step of executing an implementation card.

## When to invoke

- You've completed an implementation card and tests are green
- You've completed a refactor and the existing test suite is still green
- You've finished a bug fix and verified the fix
- You're closing out any engineering work that should be version-controlled

**Never create a kanban card just for committing/pushing.** If the only work is "commit and push changes," you're treating the final step of an implementation as if it were standalone work. Committing is part of the *previous* card, not a new card.

## Pre-commit check

Before committing:

1. **Inspect status.** `git status` — what files are staged/unstaged/untracked?
2. **Review the diff.** `git diff --cached` (staged) and `git diff` (unstaged). Does every changed line belong to this card's scope?
3. **Separate unrelated changes.** If the diff includes changes from a different concern (e.g. you fixed a typo while implementing a feature), return `NEEDS_DECISION` and ask PM whether to split the commit or punt the unrelated change.
4. **Run tests.** The card's acceptance criteria should already specify which tests to run. If tests fail, don't commit.

## Commit message format

```
<type>(<scope>): <subject>

<body — optional, explains why if it's not obvious from the diff>

Card: <vault-relative card path>
```

**Type**: `feat` | `fix` | `refactor` | `test` | `docs` | `chore` | `perf`

**Scope**: the module/feature/component affected (e.g. `auth`, `board`, `server`, `pm-skill`)

**Subject**: imperative mood, lowercase, no trailing period, ≤72 chars

**Examples:**

```
feat(board): add commit-and-push engineer inner skill

Card: vault/projects/pi-improvements/board/add-engineer-commit-and-push-skill.md
```

```
fix(render-html): verify .mdx compiles before returning URL

Card: vault/projects/agents-team/board/fix-render-html-verification.md
```

```
refactor(pm): extract request-triage logic to separate function

Enables easier unit testing of triage decisions.

Card: vault/projects/pm-improvements/board/refactor-triage.md
```

## The commit sequence

```bash
# 1. Stage only the files in scope
git add <file1> <file2> ...

# 2. Review staged changes
git diff --cached

# 3. Commit with a clear message
git commit -m "feat(scope): subject" -m "" -m "Card: <vault-relative path>"

# 4. Push to remote
git push origin <branch>
```

If you're on a feature branch, push to that branch. If you're on `main`, push to `main` (assuming the project's workflow allows direct commits to `main` — if not, return `NEEDS_DECISION`).

## Don't

- **Don't create a separate card for "commit and push."** It's the final step of the card you're already working on.
- **Don't commit unrelated changes together.** If you touched 3 files but only 2 belong to this card, stage those 2, commit, then decide separately what to do with the third.
- **Don't push without inspecting the diff.** You're accountable for what you ship.
- **Don't commit commented-out code, debug prints, or "TODO" markers** unless they're intentional and documented.
- **Don't commit broken tests.** If a test needs to change because behaviour changed, update the test in the same commit and explain why in the body.

## When to ask for a decision

Return `NEEDS_DECISION` if:

- The diff contains unrelated changes that can't be easily unstaged
- You're unsure whether to squash multiple incremental commits into one
- The project uses a PR-based workflow and you don't have merge permissions
- The commit crosses a subsystem boundary and you're unsure what scope to use
- Tests are red and you can't determine if it's a test bug or a code bug within the card's time budget

## Output

When you commit and push, append to the card body:

```markdown
## Outcome

Committed and pushed:
- `<commit hash>` — <type>(<scope>): <subject>
- Files: `<file1>`, `<file2>`, ...
- Branch: `<branch name>`
```

Then update the card's `status:` to `done` (or `in_review` if the card calls for review before done).
