---
description: Layer 3 shared skill — build an internal-tool web page (dashboard, news feed, ops view, status page) by composing the shadcn + Tailwind v4 component kit at `.pi/server/components/ui/`. Authors a Next.js `app/<route>/page.tsx` (RSC by default, client islands when needed), reading design decisions from `<vault>/ux/<slug>/{DESIGN.md | design.md}` and copy from `<vault>/pm/content/<slug>.md` when the PM persona has prepared them. NOT for vault renders — those go through `render-html`. The live component reference lives at `http://localhost:8080/components`.
disable-model-invocation: true
---

# Internal page

Use this skill when the deliverable is a **product surface** the team interacts with — a dashboard, news feed, ops console, status page, internal admin tool. Build it by composing the kit, not by hand-rolling CSS.

> If the deliverable is a *document* (research note, post-mortem, lesson plan, spec), it is not an internal page. Send it through `render-html` and let the DocLayout render it. Documents live in `content/v/`; internal pages live in `app/`.

## Live reference

The kit gallery is at **`http://localhost:8080/components`**. Every primitive renders there with its import path. Open it before you start — agents that read the page can copy the exact import they need.

## Where pages live

```
.pi/server/
├── app/
│   ├── <route>/
│   │   ├── page.tsx           ← your page (RSC by default)
│   │   └── <Island>.tsx       ← client islands ("use client") for interactivity
│   └── …
├── components/
│   ├── ui/                    ← shadcn primitives — your toolbox
│   ├── blocks/                ← composed patterns shared across pages
│   ├── site/SiteHeader.tsx    ← page header (already in root layout)
│   └── docs/                  ← internal: MDX rendering, do not import for product pages
└── lib/utils.ts               ← cn() helper
```

The root `app/layout.tsx` already renders `<SiteHeader />` and applies the parchment background — your page just renders its own `<main>` block.

## Imports

Exact paths agents should use:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
```

For a complete list of available primitives, `ls .pi/server/components/ui/` or open `/components`.

## DESIGN-2 token rules

- **Colors via tokens only.** Use Tailwind utilities mapped to the kit slots:
  - Surfaces: `bg-background` (parchment) · `bg-card` (white) · `bg-muted` (subtle tint)
  - Text: `text-foreground` (black) · `text-muted-foreground` (slate) · `text-primary` (navy)
  - Borders: `border-border` (~black 15%)
  - Accents: `bg-primary text-primary-foreground` (navy + white) · `bg-destructive` (red)
  - Never set arbitrary hex values, never `style={{color: '#...'}}`.
- **Sharp corners.** Radius is forced to 0 globally — do NOT pass `rounded-*` utilities, they are no-ops.
- **No dark mode.** DESIGN-2 is light-only; ignore `dark:` variants in scaffolded components (they're inert).
- **Serif for editorial headings.** Use `font-serif` on page-level h1/h2 ("Copernicus" stack). Body copy stays sans (`font-sans` is the default).
- **No emoji headers, no gradients, no glass morphism.** Editorial-parchment only.

## Composing

1. **Start with the page shell.** A standard internal page is a single RSC `page.tsx` exporting a default function returning `<main className="mx-auto max-w-6xl px-4 py-10">…</main>`. `max-w-3xl` for reading-heavy, `max-w-6xl` for dashboards.

2. **Reach into `ui/` for primitives.** Don't reinvent buttons, cards, tabs, tables, dialogs — every one you'd want already exists in the kit.

3. **Promote repeated patterns to `blocks/`.** If the same composition (e.g. a stat tile, a feed-item row) shows up on three pages, write a block in `components/blocks/<Name>.tsx` and import it. The `/news` page's per-topic `<Card>` is a good candidate when a third page wants it.

4. **Client islands only when needed.** If a chunk needs `useState` / `useEffect` / event handlers, lift it to its own file with `"use client"` at the top and import it from the RSC page. Most shadcn primitives that need interactivity (Dialog, Sheet, Popover, DropdownMenu, Tabs) already declare their own client boundary — you can use them directly from an RSC page.

## PM input

Before writing UI, read what the PM persona has already decided for this product:

- `<vault>/ux/<product-slug>/DESIGN.md` (designer heavy-tier) or `<vault>/ux/<product-slug>/design.md` (PM uiux light-tier) — palette confirmation, type stack, density notes, component picks. When both exist, `DESIGN.md` wins. If neither is present, the page inherits DESIGN-2 defaults. This is the single fixed mockup location per *Strictly enforced rule 3* in `.pi/SYSTEM.md` — never search `pm/design/`.
- `<vault>/pm/content/<product-slug>.md` — copy, voice & tone, per-page register. If absent, write neutral utilitarian copy.

If neither exists and the page is non-trivial, ask the user whether PM should produce them first.

## Worked example — agent ops dashboard

```tsx
// app/ops/page.tsx
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ops · agents-team" };

export default function OpsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Agent ops</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live state of the cron, the news ingester, and outbound renders.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-base">News scraper</CardTitle>
            <CardDescription>Last scrape · 12m ago</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">42</div>
            <div className="text-xs text-muted-foreground">items this hour</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-base">Renders</CardTitle>
            <CardDescription>This week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">17</div>
            <Progress value={68} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-base">Queue</CardTitle>
            <CardDescription>Background jobs</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Badge>healthy</Badge>
            <span className="text-sm text-muted-foreground">0 stalled</span>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-8" />

      <Card>
        <CardHeader><CardTitle className="font-serif text-lg">Recent activity</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead><TableHead>Agent</TableHead><TableHead>Action</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell>12:04</TableCell><TableCell>news-cron</TableCell><TableCell>scrape</TableCell><TableCell><Badge>ok</Badge></TableCell></TableRow>
              <TableRow><TableCell>11:52</TableCell><TableCell>engineer</TableCell><TableCell>render</TableCell><TableCell><Badge>ok</Badge></TableCell></TableRow>
              <TableRow><TableCell>11:30</TableCell><TableCell>pm</TableCell><TableCell>save design</TableCell><TableCell><Badge>ok</Badge></TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
```

Notice: no inline `style=`, no arbitrary colors, no rounded utilities, no dark variants. Every visual decision rides on a token.

## Don't

- **Don't write inline `style={{…}}` for layout or color.** Use Tailwind utilities tied to kit tokens. Inline styles only for genuinely dynamic values (a CSS var driven by a number).
- **Don't pull in a second styling system.** No CSS modules, no styled-components, no emotion. Tailwind + cn() only.
- **Don't introduce new colors or radius values.** If a design genuinely needs a new accent, take it back to the PM persona — they own DESIGN-2.
- **Don't author `.mdx` for product pages.** MDX is for vault renders (`render-html`). Product pages are `.tsx`.
- **Don't import from `components/docs/`.** That namespace is internal to the MDX renderer. Use `components/ui/` and `components/blocks/`.
- **Don't replicate the kit.** If you're about to hand-roll a "card" or a "modal", check `/components` first — it's already there.
- **Don't ship a page that ignores PM artifacts.** If `<vault>/ux/<slug>/DESIGN.md` or `<vault>/ux/<slug>/design.md` exists, read it before deciding density / component picks (heavy-tier `DESIGN.md` wins when both are present).
