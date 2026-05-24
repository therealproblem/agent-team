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

## Marketing skills (kostja94/marketing-skills)

- **Upstream:** https://github.com/kostja94/marketing-skills
- **Commit:** `c099845a705007570285766ff22f6a3b920154b6`
- **Imported:** 2026-05-24
- **License:** MIT
- **Powers:** the `marketer` executor subagent (and `marketing-critic` blind reviewer) — spawned by the `pm` persona for SEO audits, GTM plans, launch checklists, channel strategy, page briefs, paid-ads plans, content calendars.

## What was imported

- 141 of 172 upstream skills into `.pi/skills/marketing/<category>/<skill>/SKILL.md`, nested by category to keep them scoped to the marketer subagent (not auto-discovered by root pi).
- `disable-model-invocation: true` added to every frontmatter as belt+suspenders — marketer reads `.pi/skills/marketing/INDEX.md` to discover, then explicitly reads SKILL.md by path.
- `.pi/skills/marketing/INDEX.md` — one-line-per-skill discovery layer the marketer scans before loading.

## What was skipped (31 of 172)

- **`components/*` (25 skills)** — cta, popup, hero, footer, breadcrumb, favicon, etc. Owned by `designer` via the open-design library.
- **`content/copywriting` (1)** — pi already has the more opinionated [`copywriter`](.pi/skills/copywriter/SKILL.md) skill (author-not-rephraser, voice + per-page register, stop-slop integrated). Marketer uses pi's `copywriter` for drafts; kostja's PAS/AIDA/BAB framework is referenced only by name.
- **`pages/utility/{404,signup-login,status}` (3)** — pure UX / engineering / SRE surfaces. 404 and signup-login are designer + engineer territory; status pages are devops.
- **`analytics/tracking` (1)** — assumes runtime GA/Plausible event-API wiring pi doesn't have.
- **`legal/legal` + `pages/content/legal` page generators (1)** — meta-skills that point at the individual legal page skills above; we vendor the individual page skills directly.

### Originally skipped, then re-vendored (9)

On second read, these were over-skipped — the page skills are about page structure, SEO, schema, and conversion role, not about drafting legal/HR text:

- `pages/legal/{privacy,cookie-policy,terms,refund,shipping}` — page-structure / schema / GDPR-CCPA signaling. Marketer handles "where it sits in the footer, what schema, what the hero says" — not the legal text itself.
- `pages/utility/careers` — employer brand / recruitment funnel.
- `pages/utility/disclosure` — affiliate / FTC / sponsored disclosure (direct overlap with `channels/partnerships/affiliate-marketing`).
- `pages/utility/changelog` — "what's new" / release notes as a product-marketing surface.
- `pages/utility/feedback` — public roadmap / Canny-style feature-request pages.

## Architectural notes

- Skills are nested under `.pi/skills/marketing/<category>/<skill>/SKILL.md` rather than flat under `.pi/skills/`. This keeps them out of pi's root auto-discovery and scopes them to the `marketer` subagent (mirrors how design-systems are kept in `.pi/design-systems/`).
- kostja skills look for `.claude/project-context.md` or `.cursor/project-context.md`. In this project, the equivalent is `vault/projects/<slug>/project.md`. The `marketer.md` agent prompt bridges this redirect for any skill that references project-context.
- Skills versioned with `metadata: version: X.Y.Z` — semver-tracked. Preserve on re-sync.

## Re-syncing

To pull updates from kostja94/marketing-skills later:

```bash
git clone --depth=1 https://github.com/kostja94/marketing-skills.git /tmp/marketing-skills-vendor
# Then re-rsync the categories below from /tmp/marketing-skills-vendor/skills/ into .pi/skills/marketing/,
# and re-run the disable-model-invocation patch script (see git log for vendoring commit).
```

Categories to sync (exclude the skip-list above): `seo/`, `strategies/`, `channels/`, `platforms/`, `paid-ads/`, `content/{article,podcast,video,visual-content,translation}`, `pages/{brand,content,marketing}`, `pages/legal/{privacy,cookie-policy,terms,refund,shipping}`, `pages/utility/{careers,disclosure,changelog,feedback}`, `analytics/{sources,seo}`.
