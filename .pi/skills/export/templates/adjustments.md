# Per-template adjustments

Apply these on top of [base.html](base.html). Each template overrides `@page`, body line-height, and a few structural conventions.

## one-pager
- `@page { size: A4; margin: 18mm 18mm 18mm 18mm; }`
- Headline + subtitle, then either `.grid-3` or three `<section>` blocks.
- No page break — content must fit on one A4 page.

## long-doc
- `@page { size: A4; margin: 22mm 20mm 22mm 20mm; }`
- Optional title page (`<section class="page-break">` with just `h1` + `.meta`).
- Optional TOC: `<nav class="toc"><ol>…</ol></nav>` directly after the title page. No sidebar TOC (this is print).
- Sections with `h2` — let pagination flow naturally; only force `page-break-before` for major parts.

## letter
- `@page { size: A4; margin: 28mm 24mm 28mm 24mm; }`
- Sender block (right-aligned): name, address, email, date.
- Recipient block (left-aligned), 1 line break below sender.
- Salutation, body paragraphs (reading line-height 1.55), closing ("Sincerely,"), signature line, typed name.
- No header band; the letter starts directly with sender/recipient.
- No footer (a letter doesn't carry meta about its production).

## portfolio
- `@page { size: A4; margin: 22mm 20mm 22mm 20mm; }`
- Cover page: `<section class="page-break">` with `h1` (name) + `.doc-sub` (positioning line) + accent rule.
- One `<section class="page-break">` per project. Inside: project title (h2), `.meta` row (role · dates · stack), 2–3 paragraphs of narrative, optional `.callout` for a pull-quote, optional inline SVG visual.

## resume
- `@page { size: A4; margin: 16mm 18mm 18mm 18mm; }`
- Tight, single-column or two-column (`.grid-resume`: sidebar 30% / main 70%).
- Header: `<h1>` name, `.meta` strip with contact details (email · phone · location · links).
- Sections (h2): Experience · Projects · Education · Skills. Dense line-height (`<main class="dense">`).
- Each experience entry: `<h3>` role · company, `.meta` dates/location, 2–4 bullet outcomes.

## slides
- `@page { size: 297mm 210mm landscape; margin: 0; }`
- One `<section class="slide">` per slide.
- h1 as title slide; h2 as section slides. Body text is short — slides are landing-pad markers, not paragraphs.
- Add page number in bottom-right via `<footer>` inside each `.slide` (no `position: fixed`).

## equity-report
- `@page { size: A4; margin: 20mm 20mm 22mm 20mm; }`
- Header band: ticker · price · rating · target (use `.doc-header` with `.doc-meta` right-aligned).
- Executive summary `<div class="callout">` directly under the header.
- Sections: Thesis · Numbers · Risks · Catalysts. Heavy use of `<table>` for the Numbers section.
- Optional inline SVG sparkline next to key metrics.

## changelog
- `@page { size: A4; margin: 18mm 20mm 18mm 20mm; }`
- `h2` per version with `.meta` strip (date · type [major/minor/patch] · tags).
- `h3` per category: Added · Changed · Fixed · Removed.
- Dense bullet lists, no paragraphs.
