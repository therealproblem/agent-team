# Vendoring provenance

## Open Design

- **Upstream:** https://github.com/nexu-io/open-design
- **Commit:** `d28acdc87956bd9d2edda91b48e8ccfed2d5f2dd`
- **Imported:** 2026-05-24
- **License:** Apache 2.0

## What was imported

- 95 skills into `.pi/skills/` (selected from 132 upstream; 36 skipped — 24 paid-API wrappers + 12 hard skips)
- 150 design systems + `_schema/` (file contract) + upstream `README.md` into `.pi/design-systems/`
- See `STUBS.md` for the 57 imported skills that are catalog-only pointers to further-upstream repos

## Re-syncing

To pull updates from open-design later:

```bash
git clone --depth=1 --filter=blob:none --no-checkout https://github.com/nexu-io/open-design.git /tmp/od-resync
cd /tmp/od-resync && git sparse-checkout init --cone && git sparse-checkout set skills design-systems && git checkout main
# Then rsync into .pi/skills/ and .pi/design-systems/ as needed
```
