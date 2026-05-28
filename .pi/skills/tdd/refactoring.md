# Refactor Candidates

After TDD cycle, look for:

- **Duplication** → Extract function/class
- **Long methods** → Break into private helpers (keep tests on public interface)
- **Shallow modules** → Combine or deepen (see `improve-codebase-architecture/DEEPENING.md`)
- **Feature envy** → Move logic to where data lives
- **Primitive obsession** → Introduce value objects
- **Existing code** the new code reveals as problematic

This project also has a dedicated `refactor` skill — invoke it when the refactor is non-trivial (renames across files, module moves, public-API reshape). For the small refactor that happens at the bottom of each TDD cycle (extract a helper, rename a variable, collapse a duplicate), do it inline.
