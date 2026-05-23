/**
 * obsidian-vault — write interface to the user's Obsidian vault and to the
 * local Next.js / Nextra server that serves derivative artifacts over HTTP.
 *
 * Three tools:
 *   - `write_note`       — markdown-only, into the Obsidian vault. Owns
 *                          frontmatter, tags, wiki-link footers. The vault is
 *                          markdown-first so the Obsidian graph view,
 *                          backlinks, and tag search work. Called by the
 *                          `note-taker` skill (Layer 3).
 *   - `write_html_render` — markdown body, written as `.mdx` into the
 *                            root `renders/` directory.
 *                            Nextra serves it at `/v/<YYYY-MM-DD>-<slug>`.
 *                            Re-running the same title on the same day
 *                            overwrites the file; the URL stays stable.
 *                            Used by the `render-html` skill
 *                            (Layer 3).
 *   - `write_html_render_multipart` — multi-part variant of
 *                            `write_html_render`. Takes a `parts` array
 *                            and writes one `.mdx` per part under
 *                            `<base>-part-<N>-<part-slug>.mdx`. Each
 *                            part's frontmatter carries the sibling list,
 *                            which the DocLayout renders as a "Parts"
 *                            nav block in the sidebar so readers can jump
 *                            between pages. Used by the `render-html`
 *                            skill when the source markdown is too large
 *                            for a single HTML page (~2000+ lines).
 *   - `write_export_pdf` — PDF, written into the canonical export root
 *                          at `<repo>/exports/`. The Next.js server reads
 *                          from this directory at request time via a route
 *                          handler at `app/p/[slug]/route.ts` and serves
 *                          the PDF at
 *                          `/p/<YYYY-MM-DD>-<slug>-<epoch>.pdf`. Each
 *                          regeneration appends a fresh Unix-epoch suffix
 *                          rather than overwriting the prior file, so a
 *                          CDN (Cloudflare) can't serve a stale cached
 *                          copy under the URL it just served. After a
 *                          successful write, prior PDFs for the SAME
 *                          title (across all dates) are unlinked so only
 *                          the latest version of any given title stays
 *                          on disk. Used by the `export` skill
 *                          (Layer 3) to produce print-ready deliverables
 *                          (resumes, letters, reports, slides) styled by the
 *                          Kami design system. The caller provides
 *                          Kami-styled HTML; this tool writes a transient
 *                          HTML, shells out to headless Chrome to render the
 *                          PDF, then deletes the intermediate HTML once
 *                          Chrome confirms the PDF was produced. The HTML is
 *                          retained only when Chrome fails (no binary, render
 *                          error) so the caller has a recovery path.
 *
 * Configure paths via env vars:
 *   AGENTS_TEAM_VAULT_PATH        — default: <cwd>/vault
 *   AGENTS_TEAM_SERVER_PATH       — default: <cwd>/.pi/server
 *   AGENTS_TEAM_EXPORT_PATH       — default: <cwd>/exports
 *   AGENTS_TEAM_RENDERS_PATH      — default: <cwd>/renders
 *   AGENTS_TEAM_SERVER_PUBLIC_URL — default: http://localhost:8080. If the
 *                                   user has set this (typically to a tunnel
 *                                   hostname), returned URLs use it
 *                                   automatically.
 *   AGENTS_TEAM_CHROME_PATH       — default: platform auto-detect (macOS:
 *                                   /Applications/Google Chrome.app/Contents/MacOS/Google Chrome)
 *
 * Agents should NOT call these tools directly — they go through `note-taker`,
 * `render-html`, and `export` skills so naming, folder, and design
 * conventions stay consistent.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadDotenv, reloadDotenv } from "../../lib/dotenv";
import { createBoxRenderer, surface as surfaceShared } from "../../lib/tui";

// Captured at extension boot (see the default export). The render tools
// need `pi` to surface per-part completion messages into the TUI without
// touching the tool's working indicator — `onUpdate` would, because pi
// renders streamed tool content in place of the spinner. Module-scoped
// `let` is fine: pi re-imports this module on session swaps and
// re-invokes the default export, which refreshes the reference.
let piRef: ExtensionAPI | null = null;

const RENDER_HTML_CUSTOM_TYPE = "render-html";

function surfaceRenderProgress(text: string): void {
	if (!piRef) return;
	surfaceShared(piRef, RENDER_HTML_CUSTOM_TYPE, text);
}

loadDotenv();

const execFileP = promisify(execFile);

const VAULT_ROOT = resolve(
	process.env.AGENTS_TEAM_VAULT_PATH ?? join(process.cwd(), "vault"),
);
const SERVER_ROOT = resolve(
	process.env.AGENTS_TEAM_SERVER_PATH ?? join(process.cwd(), ".pi", "server"),
);
const EXPORT_ROOT = resolve(
	process.env.AGENTS_TEAM_EXPORT_PATH ?? join(process.cwd(), "exports"),
);
const RENDERS_ROOT = resolve(
	process.env.AGENTS_TEAM_RENDERS_PATH ?? join(process.cwd(), "renders"),
);

// Resolve fresh per call so a `.env` edit after pi launches is picked up
// without a restart. Shell-exported values still win (reloadDotenv won't
// clobber keys it didn't originally source from `.env`).
function serverPublicUrl(): string {
	reloadDotenv();
	return process.env.AGENTS_TEAM_SERVER_PUBLIC_URL ?? "http://localhost:8080";
}

function resolveChromeBinary(): string | null {
	if (process.env.AGENTS_TEAM_CHROME_PATH) return process.env.AGENTS_TEAM_CHROME_PATH;
	const candidates =
		process.platform === "darwin"
			? [
					"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
					"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
					"/Applications/Chromium.app/Contents/MacOS/Chromium",
				]
			: process.platform === "win32"
				? [
						"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
						"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
					]
				: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
	return candidates.find((p) => existsSync(p)) ?? null;
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function todayIso(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

/*
 * Strip raw HTML / JSX tags from a markdown body while preserving fenced
 * code blocks (``` and ~~~) and inline code (backticks). MDX is permissive
 * about HTML, but a stray `<div>` or unclosed `<br>` is enough to crash
 * compilation, and the agent runtime can't always detect the failure —
 * `write_html_render` returns the URL successfully, the agent says "done",
 * and the user opens a broken page. Stripping is defense-in-depth on top
 * of the SKILL.md "markdown only" rule.
 *
 * What we strip:
 *   - HTML/JSX opening, closing, self-closing tags: <div>, </div>, <br/>
 *   - HTML comments and processing instructions: <!--…-->, <!DOCTYPE …>
 *
 * What we preserve:
 *   - Anything inside ``` or ~~~ fences (Mermaid, code samples — `<` is
 *     legal in code).
 *   - Inline code spans `like <this>`.
 *   - GFM autolinks: <https://example.com>, <mailto:a@b.com> — the body
 *     contains `://` or `@` so it doesn't match the tag regex.
 *   - Bare `<` / `>` punctuation (e.g. inequalities in prose).
 */
function stripMdxHtml(markdown: string): { cleaned: string; strippedCount: number } {
	let result = "";
	let i = 0;
	let strippedCount = 0;
	const tagBodyRe = /^\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^>]*?)?\/?$/;

	while (i < markdown.length) {
		const atLineStart = i === 0 || markdown[i - 1] === "\n";

		// Fenced code block — copy through verbatim until the closing fence.
		if (
			atLineStart &&
			(markdown.startsWith("```", i) || markdown.startsWith("~~~", i))
		) {
			const fence = markdown.startsWith("```", i) ? "```" : "~~~";
			const close = markdown.indexOf(`\n${fence}`, i + fence.length);
			if (close === -1) {
				result += markdown.slice(i);
				i = markdown.length;
				continue;
			}
			const eol = markdown.indexOf("\n", close + 1 + fence.length);
			const segmentEnd = eol === -1 ? markdown.length : eol;
			result += markdown.slice(i, segmentEnd);
			i = segmentEnd;
			continue;
		}

		// Inline code span — copy through to the matching backtick run.
		if (markdown[i] === "`") {
			const runStart = i;
			while (i < markdown.length && markdown[i] === "`") i++;
			const runLen = i - runStart;
			const tick = "`".repeat(runLen);
			const close = markdown.indexOf(tick, i);
			if (close === -1) {
				result += markdown.slice(runStart, i);
				continue;
			}
			result += markdown.slice(runStart, close + runLen);
			i = close + runLen;
			continue;
		}

		// Prose: a `<` that looks like a tag gets stripped. We only consider
		// it a tag candidate if the `>` is on the same line — that excludes
		// stray inequalities in prose ("if a < b, then ... > 0") from
		// triggering a cross-paragraph strip, while still catching every
		// real HTML/JSX tag (which by convention fits on one line).
		if (markdown[i] === "<") {
			const close = markdown.indexOf(">", i + 1);
			if (close !== -1) {
				const body = markdown.slice(i + 1, close);
				if (!body.includes("\n")) {
					const looksLikeTag = body.startsWith("!") || tagBodyRe.test(body);
					if (looksLikeTag) {
						strippedCount++;
						i = close + 1;
						continue;
					}
				}
			}
		}

		result += markdown[i];
		i++;
	}

	return { cleaned: result, strippedCount };
}

/*
 * Confirm a rendered .mdx URL actually compiles and serves. After writing
 * the file we hit the URL locally — if MDX compilation crashes, Next.js
 * returns 500 with an error page. Returning isError from the tool means
 * the agent can't accidentally tell the user "done" on a broken page.
 *
 * Always targets `http://localhost:8080` (not `serverPublicUrl()`) because
 * the file write is local; verification doesn't need the tunnel hop, and
 * checking locally avoids spurious failures when the tunnel itself is
 * down but the page is fine.
 */
async function verifyRender(slug: string): Promise<
	{ ok: true } | { ok: false; reason: string }
> {
	const url = `http://localhost:8080/v/${slug}`;
	const fetchOnce = async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 30_000);
			const res = await fetch(url, { signal: controller.signal });
			clearTimeout(timer);
			const body = await res.text();
			if (!res.ok) {
				return { ok: false, reason: `HTTP ${res.status}` };
			}
			if (
				/Failed to compile|Unhandled Runtime Error|Build Error|Server Error/i.test(
					body,
				)
			) {
				return { ok: false, reason: "page rendered with compile/runtime error markers" };
			}
			return { ok: true };
		} catch (e) {
			const msg = (e as Error).message;
			if (/ECONNREFUSED|fetch failed/i.test(msg)) {
				return {
					ok: false,
					reason:
						"local Next.js dev server not reachable at http://localhost:8080 — start it with `npm run dev` in .pi/server before re-running the render",
				};
			}
			return { ok: false, reason: msg };
		}
	};

	const first = await fetchOnce();
	if (first.ok) return first;
	// Next.js's file watcher can briefly miss a just-written file; one
	// retry after a short pause catches that case without masking real
	// failures (compile errors will still fail on the retry).
	if (first.reason.startsWith("HTTP 404")) {
		await new Promise((r) => setTimeout(r, 1000));
		return fetchOnce();
	}
	return first;
}

/*
 * Auto-split policy for `write_html_render`.
 *
 *   AUTO_SPLIT_THRESHOLD — at or above this line count, the renderer tries
 *                          to chop the markdown along top-level `##`
 *                          headings into multi-part pages. 1200 is the
 *                          floor — below it the browser handles a single
 *                          page fine; above it diagrams pile up and first
 *                          paint stalls. With MAX_LINES_PER_PART = 600,
 *                          1200 is also the smallest source that can yield
 *                          at least two balanced parts, so the threshold
 *                          isn't an arbitrary line in the sand — it's the
 *                          smallest source the policy can actually act on.
 *   MAX_LINES_PER_PART   — hard cap per part. The bucketer flushes the
 *                          current bucket before adding a section that
 *                          would push past this. A single `##` section
 *                          larger than the cap still becomes its own part
 *                          (we never split mid-section — that breaks the
 *                          "self-contained part" guarantee callers expect).
 *   MIN_LAST_PART_LINES  — protects against a tiny dangling final part.
 *                          If the tail bucket is shorter than this and the
 *                          previous bucket has room, they get merged.
 */
const AUTO_SPLIT_THRESHOLD = 1200;
const MAX_LINES_PER_PART = 600;
const MIN_LAST_PART_LINES = 100;

interface MarkdownSection {
	headingText: string | null; // null = preamble (content before the first `##`)
	body: string;
	lineCount: number;
}

/*
 * Walk a markdown body and split it into top-level `##` sections, returning
 * an ordered list. Tracks fenced code blocks (``` and ~~~) so a `##` inside
 * a code sample doesn't split prose. Preamble (anything before the first
 * `##`) becomes a section with `headingText: null`. `###` and deeper
 * headings stay inside their parent `##` section.
 */
function parseTopLevelSections(markdown: string): MarkdownSection[] {
	const lines = markdown.split("\n");
	const sections: MarkdownSection[] = [];
	let curHeading: string | null = null;
	let curStart = 0;
	let fenceChar: string | null = null;
	let fenceLen = 0;

	const flush = (endExclusive: number) => {
		const lineCount = endExclusive - curStart;
		if (lineCount <= 0) return;
		const body = lines.slice(curStart, endExclusive).join("\n");
		sections.push({ headingText: curHeading, body, lineCount });
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (fenceChar === null) {
			const open = line.match(/^([`~])\1{2,}/);
			if (open) {
				fenceChar = open[1];
				fenceLen = open[0].length;
				continue;
			}
		} else {
			const close = line.match(/^([`~])\1{2,}\s*$/);
			if (close && close[1] === fenceChar && close[0].trimEnd().length >= fenceLen) {
				fenceChar = null;
				fenceLen = 0;
			}
			continue;
		}

		const h2 = line.match(/^##(?!#)\s+(.+?)\s*$/);
		if (h2) {
			flush(i);
			curHeading = h2[1].trim();
			curStart = i;
		}
	}
	flush(lines.length);

	if (
		sections.length > 0 &&
		sections[0].headingText === null &&
		sections[0].body.trim() === ""
	) {
		sections.shift();
	}
	return sections;
}

/*
 * Bucket an ordered list of `##` sections into balanced parts. Greedy: keep
 * accumulating into the current bucket until adding the next section would
 * cross MAX_LINES_PER_PART; then flush. A section larger than the cap on
 * its own becomes a single-section bucket. Merges a tiny final bucket back
 * into the previous one when there's headroom.
 */
function bucketSections(sections: MarkdownSection[]): MarkdownSection[][] {
	const buckets: MarkdownSection[][] = [];
	let cur: MarkdownSection[] = [];
	let curLines = 0;

	for (const s of sections) {
		if (cur.length > 0 && curLines + s.lineCount > MAX_LINES_PER_PART) {
			buckets.push(cur);
			cur = [];
			curLines = 0;
		}
		cur.push(s);
		curLines += s.lineCount;
	}
	if (cur.length > 0) buckets.push(cur);

	if (buckets.length >= 2) {
		const last = buckets[buckets.length - 1];
		const lastLines = last.reduce((a, s) => a + s.lineCount, 0);
		const prev = buckets[buckets.length - 2];
		const prevLines = prev.reduce((a, s) => a + s.lineCount, 0);
		if (
			lastLines < MIN_LAST_PART_LINES &&
			prevLines + lastLines <= MAX_LINES_PER_PART
		) {
			buckets[buckets.length - 2] = prev.concat(last);
			buckets.pop();
		}
	}
	return buckets;
}

/*
 * Returns >=2 parts when the markdown can be split sensibly along `##`
 * headings, or [] when it can't (no headings, or everything fits in one
 * bucket). Each part's title is the first `##` heading inside it.
 */
function splitMarkdownAlongHeadings(
	markdown: string,
): Array<{ title: string; markdown: string }> {
	const sections = parseTopLevelSections(markdown);
	if (sections.length < 2) return [];
	const buckets = bucketSections(sections);
	if (buckets.length < 2) return [];

	return buckets.map((bucket, i) => {
		const firstHeading = bucket.find((s) => s.headingText !== null);
		const title = firstHeading?.headingText ?? `Part ${i + 1}`;
		const body = bucket.map((s) => s.body).join("\n");
		return { title, markdown: body };
	});
}

function countLines(s: string): number {
	if (!s) return 0;
	let n = 1;
	for (let i = 0; i < s.length; i++) if (s[i] === "\n") n++;
	return n;
}

interface MultipartWriteParams {
	title: string;
	parts: Array<{ title: string; markdown: string }>;
	source_md_path?: string;
	extraDetails?: Record<string, unknown>;
}

/*
 * Slug derivation for multipart parts. Both `plan_html_render` (planning
 * pass) and `writeMultipartRender` (write pass) call this so the URLs
 * surfaced at plan time match the files actually written. Slugs are
 * deterministic in (title, parts ordering, parts titles) — re-running the
 * planner and the writer on the same inputs produces the same set.
 */
function computeMultipartSlugs(
	overallTitle: string,
	partTitles: string[],
): { baseSlug: string; partSlugs: string[] } {
	const baseSlug = `${todayIso()}-${slugify(overallTitle)}`;
	const padWidth = String(partTitles.length).length;
	const partSlugs = partTitles.map(
		(t, i) =>
			`${baseSlug}-part-${String(i + 1).padStart(padWidth, "0")}-${slugify(t)}`,
	);
	return { baseSlug, partSlugs };
}

/*
 * Shared write-and-verify path used by both `write_html_render`
 * (when auto-split fires) and `write_html_render_multipart` (when the
 * caller hands over an explicit parts array). Owns: base-slug derivation,
 * cleanup of any prior set under the same base, frontmatter assembly with
 * sibling list, write loop, parallel verification, error shape.
 *
 * Streaming model: as each part clears verification (or fails), its URL
 * is surfaced into the TUI via `pi.sendMessage` (see surfaceRenderProgress).
 * This is deliberately NOT piped through the tool's `onUpdate` channel —
 * that channel renders in place of pi's braille working indicator, and
 * displacing the spinner during an in-flight tool call leaves the user
 * with no visual signal that the tool is still working. surfaceShared
 * pushes a separate boxed message instead, so the spinner stays alive
 * and URLs trickle in as they land.
 */
async function writeMultipartRender(params: MultipartWriteParams) {
	const { baseSlug, partSlugs } = computeMultipartSlugs(
		params.title,
		params.parts.map((p) => p.title),
	);
	const dir = RENDERS_ROOT;
	const partsMeta = partSlugs.map((slug, i) => ({
		slug,
		title: params.parts[i].title,
	}));

	const escapeYaml = (s: string) =>
		s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const buildFrontmatter = (currentSlug: string, partTitle: string) => {
		const fullTitle = `${partTitle} — ${params.title}`;
		const lines = [
			"---",
			`title: "${escapeYaml(fullTitle)}"`,
			"sidebar: false",
			// Persist the vault source path so the Mermaid syntax-fix
			// endpoint can locate the originating .md and dual-write.
			...(params.source_md_path
				? [`source_md_path: "${escapeYaml(params.source_md_path)}"`]
				: []),
			`part_slug: "${escapeYaml(currentSlug)}"`,
			"parts:",
			...partsMeta.map(
				(p) =>
					`  - { slug: "${escapeYaml(p.slug)}", title: "${escapeYaml(p.title)}" }`,
			),
			"---",
			"",
			"",
		];
		return lines.join("\n");
	};

	if (!existsSync(dir)) {
		await mkdir(dir, { recursive: true });
	}

	// Clean up any prior artifacts under the same base before writing the
	// new set. Without this, shrinking from 5 parts to 3 would leave parts
	// 4 and 5 stranded under their old URLs. We also remove `<base>.mdx`
	// so a switch from single-page to multipart (or back) doesn't leave
	// both flavors coexisting.
	const existing = await readdir(dir).catch(() => [] as string[]);
	const escapedBase = baseSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const baseRegex = new RegExp(
		`^${escapedBase}(\\.mdx|-part-\\d+-[a-z0-9-]+\\.mdx)$`,
	);
	await Promise.all(
		existing
			.filter((f) => baseRegex.test(f))
			.map((f) => unlink(join(dir, f)).catch(() => undefined)),
	);

	const results: Array<{
		slug: string;
		url: string;
		title: string;
		path: string;
		html_stripped_count: number;
	}> = [];
	for (let i = 0; i < params.parts.length; i++) {
		const part = params.parts[i];
		const slug = partSlugs[i];
		const path = join(dir, `${slug}.mdx`);
		const url = `${serverPublicUrl()}/v/${slug}`;
		const frontmatter = buildFrontmatter(slug, part.title);
		const { cleaned, strippedCount } = stripMdxHtml(part.markdown);
		await writeFile(path, frontmatter + cleaned, { encoding: "utf8" });
		results.push({
			slug,
			url,
			title: part.title,
			path,
			html_stripped_count: strippedCount,
		});
	}

	// Verify every part's URL in parallel — one broken part is enough to
	// fail the whole multipart write, since the sibling nav makes the
	// broken part discoverable from every other page. As each verification
	// resolves, push a TUI box with the URL so the user sees ready parts
	// as they land. Each part is its own surfaced message (not a single
	// accumulating block) — that way the spinner stays alive between
	// parts and the message history reads chronologically.
	const verifyOne = async (
		r: (typeof results)[number],
		index: number,
	): Promise<{ r: typeof r; v: Awaited<ReturnType<typeof verifyRender>> }> => {
		const v = await verifyRender(r.slug);
		if (v.ok) {
			surfaceRenderProgress(`Part ${index + 1} — ${r.title}: ${r.url}`);
		} else {
			const reason = (v as { ok: false; reason: string }).reason;
			surfaceRenderProgress(
				`Part ${index + 1} — ${r.title}: FAILED (${reason})`,
			);
		}
		return { r, v };
	};
	const verifications = await Promise.all(results.map((r, i) => verifyOne(r, i)));
	const failures = verifications.filter((x) => !x.v.ok);
	if (failures.length > 0) {
		const detail = failures
			.map(
				(x) =>
					`${x.r.title}: ${(x.v as { ok: false; reason: string }).reason}`,
			)
			.join("; ");
		return {
			content: [
				{
					type: "text" as const,
					text: `Wrote ${results.length} parts but ${failures.length} failed to render — ${detail}`,
				},
			],
			details: {
				base_slug: baseSlug,
				title: params.title,
				parts: results,
				source_md_path: params.source_md_path,
				...(params.extraDetails ?? {}),
				failed_parts: failures.map((x) => ({
					slug: x.r.slug,
					title: x.r.title,
					reason: (x.v as { ok: false; reason: string }).reason,
				})),
			},
			isError: true as const,
		};
	}

	const summary = results.map((r, i) => `Part ${i + 1}: ${r.url}`).join("\n");
	return {
		content: [
			{
				type: "text" as const,
				text: `Rendered ${results.length} parts:\n${summary}`,
			},
		],
		details: {
			base_slug: baseSlug,
			title: params.title,
			parts: results,
			source_md_path: params.source_md_path,
			...(params.extraDetails ?? {}),
		},
	};
}

const writeNote = defineTool({
	name: "write_note",
	label: "Write Note",
	description:
		"Write a markdown note to the Obsidian vault. Owns YAML frontmatter, inline tags, wiki-link footers. Called by the `note-taker` skill. Markdown only — HTML output goes through the `write_html_render` tool (via the `render-html` skill).",
	parameters: Type.Object({
		title: Type.String({
			description: "Short noun-phrase title for the note.",
		}),
		body: Type.String({
			description:
				"Markdown body. Real headings (## for sections), wiki-links ([[Title]]) for references, real bullet lists. Frontmatter is prepended automatically — do not include your own --- block.",
		}),
		folder: Type.Optional(
			Type.String({
				description:
					"Vault subfolder (e.g. 'inbox', 'pm/prd', 'engineering/adr', 'learning/japanese', 'trades/2026'). Created if missing. Default: 'inbox'.",
			}),
		),
		tags: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"Frontmatter tags. List of strings, no '#' prefix (Obsidian convention: '#' is only for inline body tags). Example: ['pm/prd', 'q2-2026', 'auth'].",
			}),
		),
		aliases: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"Obsidian aliases — alternative names this note can be wiki-linked under. Example: a note titled 'ADR-0007: Switch to Postgres' might have alias 'Postgres ADR' so [[Postgres ADR]] resolves to it.",
			}),
		),
		links: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"Wiki-link targets — note titles to reference. Appended as a footer (`Related: [[A]] · [[B]]`). Use only when the caller explicitly passed them; do NOT synthesize.",
			}),
		),
		source_agent: Type.Optional(
			Type.String({ description: "Which agent generated this note." }),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const folder = params.folder ?? "inbox";
		const filename = `${todayIso()}-${slugify(params.title)}.md`;
		const path = join(VAULT_ROOT, folder, filename);
		const vaultRelative = join(folder, filename);

		try {
			if (!existsSync(dirname(path))) {
				await mkdir(dirname(path), { recursive: true });
			}

			const fmLines = ["---"];
			fmLines.push(`title: ${JSON.stringify(params.title)}`);
			fmLines.push(`created: ${new Date().toISOString()}`);
			if (params.source_agent)
				fmLines.push(`source_agent: ${params.source_agent}`);
			if (params.tags?.length) {
				const tagList = params.tags
					.map((t: string) => t.replace(/^#/, ""))
					.map((t: string) => JSON.stringify(t))
					.join(", ");
				fmLines.push(`tags: [${tagList}]`);
			}
			if (params.aliases?.length) {
				const aliasList = params.aliases
					.map((a: string) => JSON.stringify(a))
					.join(", ");
				fmLines.push(`aliases: [${aliasList}]`);
			}
			fmLines.push("---", "");
			const frontmatter = fmLines.join("\n");

			let linksFooter = "";
			if (params.links?.length) {
				const wiki = params.links
					.map((l: string) => `[[${l}]]`)
					.join(" · ");
				linksFooter = `\n\n---\nRelated: ${wiki}\n`;
			}

			const fileContents = frontmatter + params.body + linksFooter;
			await writeFile(path, fileContents, { encoding: "utf8" });

			return {
				content: [{ type: "text", text: `Wrote ${vaultRelative}` }],
				details: {
					path,
					vault_relative_path: vaultRelative,
					title: params.title,
				},
			};
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [{ type: "text", text: `Failed to write note: ${message}` }],
				details: { error: message },
				isError: true,
			};
		}
	},
});

/*
 * Decider step for the `render-html` skill family. Takes the assembled
 * markdown body and returns the deterministic plan that the matching
 * write tool will execute:
 *
 *   - mode === "single"    → one .mdx file at the predetermined slug
 *   - mode === "multipart" → an ordered parts array, each carrying its
 *                            own slug, url, and pre-split markdown body
 *
 * The planner is the source of truth for filenames and URLs. Because
 * slugs are deterministic in (date, title, parts ordering, parts
 * titles), the URLs returned here are *exactly* the URLs the writer
 * tool will later serve — so the orchestrator can surface them to the
 * user the moment planning completes, before any file is written. Pi
 * also surfaces the plan into the TUI from inside this tool (boxed
 * message via surfaceRenderProgress) so the URLs appear in the user's
 * terminal even when the orchestrator is mid-turn.
 */
const planHtmlRender = defineTool({
	name: "plan_html_render",
	label: "Plan HTML Render",
	description:
		"Decide whether a markdown body should be rendered as a single page or split into a multi-part set, and return the deterministic plan (predetermined slugs, URLs, paths). The orchestrator skill (`render-html`) calls this BEFORE either writer tool so URLs are known up-front. Split policy: if `force_single` is true OR the body is under ~1200 lines, mode is `single`. Otherwise the body is walked along top-level `##` headings and bucketed into parts of ≤ 600 lines each; mode is `multipart` when ≥ 2 buckets result, else `single` with `auto_split_skipped_reason` set. No files are written and nothing is verified — this tool is pure decision + slug derivation. After planning, call `write_html_render` for single mode or `write_html_render_multipart` for multipart mode with the returned `parts` array.",
	parameters: Type.Object({
		title: Type.String({
			description:
				"Title of the document. Used to derive the date-prefixed base slug shared by every part. Must match the title that will be passed to the writer.",
		}),
		markdown: Type.String({
			description:
				"The assembled markdown body to plan over. Pass the body exactly as it will be sent to the writer — slug derivation uses the title (not the markdown) but the splitter walks this body to decide how it carves into parts.",
		}),
		source_md_path: Type.Optional(
			Type.String({
				description:
					"Vault-relative path of the markdown source (informational only — recorded in the response so the orchestrator can pair plan + source).",
			}),
		),
		force_single: Type.Optional(
			Type.Boolean({
				description:
					"Force `mode: single` even when the body crosses the auto-split threshold. Default false. Use only for sources you intentionally want shipped as one page (rare).",
			}),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		try {
			const sourceLines = countLines(params.markdown);
			const dir = RENDERS_ROOT;
			const baseSlug = `${todayIso()}-${slugify(params.title)}`;

			const planSingle = (skippedReason?: string) => {
				const slug = baseSlug;
				const url = `${serverPublicUrl()}/v/${slug}`;
				const path = join(dir, `${slug}.mdx`);
				surfaceRenderProgress(`Planned (single): ${url}`);
				return {
					content: [{ type: "text" as const, text: `Plan: single → ${url}` }],
					details: {
						mode: "single" as const,
						base_slug: baseSlug,
						source_lines: sourceLines,
						slug,
						url,
						path,
						title: params.title,
						source_md_path: params.source_md_path,
						...(params.force_single ? { override_reason: "force_single" } : {}),
						...(skippedReason
							? { auto_split_skipped_reason: skippedReason }
							: {}),
					},
				};
			};

			if (params.force_single || sourceLines < AUTO_SPLIT_THRESHOLD) {
				return planSingle();
			}

			const splitParts = splitMarkdownAlongHeadings(params.markdown);
			if (splitParts.length < 2) {
				const reason =
					parseTopLevelSections(params.markdown).length < 2
						? "no top-level `##` headings to split along"
						: "all sections fit within MAX_LINES_PER_PART";
				return planSingle(reason);
			}

			const { partSlugs } = computeMultipartSlugs(
				params.title,
				splitParts.map((p) => p.title),
			);
			const parts = splitParts.map((p, i) => {
				const slug = partSlugs[i];
				return {
					index: i + 1,
					slug,
					url: `${serverPublicUrl()}/v/${slug}`,
					path: join(dir, `${slug}.mdx`),
					title: p.title,
					markdown: p.markdown,
					lines: countLines(p.markdown),
				};
			});

			const lines = parts
				.map((p) => `Part ${p.index} — ${p.title}: ${p.url}`)
				.join("\n");
			surfaceRenderProgress(`Planned (multipart, ${parts.length} parts):\n${lines}`);
			return {
				content: [
					{
						type: "text" as const,
						text: `Plan: multipart (${parts.length} parts)\n${lines}`,
					},
				],
				details: {
					mode: "multipart" as const,
					base_slug: baseSlug,
					source_lines: sourceLines,
					title: params.title,
					source_md_path: params.source_md_path,
					parts,
				},
			};
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [{ type: "text", text: `Failed to plan HTML render: ${message}` }],
				details: { error: message },
				isError: true,
			};
		}
	},
});

const writeHtmlRender = defineTool({
	name: "write_html_render",
	label: "Write HTML Render",
	description:
		"Write a markdown body as a SINGLE `.mdx` page into the root `renders/` directory. The page is named `<YYYY-MM-DD>-<slug-of-title>.mdx` and served at `http://localhost:8080/v/{slug}` (or whatever `AGENTS_TEAM_SERVER_PUBLIC_URL` points to). Re-running on the same title on the same day overwrites the file; the URL stays stable. **This tool is the single-page leg of the `render-html` skill family — it does not split.** The orchestrator skill must call `plan_html_render` first; if that returns `mode: single` (or you have a specific reason to force a single page on a long body) call this tool. If the body exceeds ~1200 lines and `force_single` is not set, this tool refuses and tells you to plan first, since a single page would render unreadably. Markdown body only — no `<!doctype>`, `<html>`, `<head>`, `<style>`, `<script>`. Return the URL plainly; do NOT add suggestions about cloudflared or setting `AGENTS_TEAM_SERVER_PUBLIC_URL`.",
	parameters: Type.Object({
		title: Type.String({
			description:
				"Title for the page (set as `title` in frontmatter, used to build the URL slug). Must match the title passed to `plan_html_render` so the URL matches the planned URL.",
		}),
		markdown: Type.String({
			description:
				"Markdown body, written verbatim. NO frontmatter (this tool prepends it). NO `<!doctype>` / `<html>` / `<head>` / `<style>` / `<script>` — Nextra owns the chrome. Mermaid blocks via ```mermaid` fences are supported. GFM callouts via `> [!NOTE]` / `> [!WARNING]` / `> [!DANGER]` are rendered as styled boxes. Refused with isError if longer than ~1200 lines unless `force_single` is true — use `plan_html_render` + `write_html_render_multipart` for large bodies.",
		}),
		source_md_path: Type.Optional(
			Type.String({
				description:
					"Vault-relative path of the markdown source this render was generated from (e.g. 'pm/prd/2026-05-15-foo.md'). Recorded in the response so the caller can keep them paired.",
			}),
		),
		force_single: Type.Optional(
			Type.Boolean({
				description:
					"Override the over-threshold guard and ship a single page even when the body is large. Default false. Set this only when `plan_html_render` was called with `force_single: true`, OR the source is genuinely one continuous narrative with no `##` boundaries.",
			}),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		try {
			const sourceLines = countLines(params.markdown);
			if (!params.force_single && sourceLines >= AUTO_SPLIT_THRESHOLD) {
				return {
					content: [
						{
							type: "text",
							text: `Body is ${sourceLines} lines (≥ ${AUTO_SPLIT_THRESHOLD}). Call plan_html_render first; if the plan returns multipart, use write_html_render_multipart with its parts array. To override, pass force_single: true.`,
						},
					],
					details: {
						source_lines: sourceLines,
						threshold: AUTO_SPLIT_THRESHOLD,
						guard: "over_threshold_without_force_single",
					},
					isError: true,
				};
			}

			const slug = `${todayIso()}-${slugify(params.title)}`;
			const dir = RENDERS_ROOT;
			const path = join(dir, `${slug}.mdx`);
			const url = `${serverPublicUrl()}/v/${slug}`;

			if (!existsSync(dir)) {
				await mkdir(dir, { recursive: true });
			}

			// Clean up any prior multipart set under the same base slug —
			// otherwise switching from multipart to single-page would leave
			// stale `-part-N-…` files coexisting with the new single page.
			const existing = await readdir(dir).catch(() => [] as string[]);
			const escapedBase = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const partRegex = new RegExp(
				`^${escapedBase}-part-\\d+-[a-z0-9-]+\\.mdx$`,
			);
			await Promise.all(
				existing
					.filter((f) => partRegex.test(f))
					.map((f) => unlink(join(dir, f)).catch(() => undefined)),
			);

			const titleEscaped = params.title.replace(/"/g, '\\"');
			// Persist the vault source path so client-side fix-ups (e.g. the
			// Mermaid syntax-fix button) can locate the originating .md and
			// keep both files in sync without round-tripping through the
			// render-html subagent.
			const sourceLine = params.source_md_path
				? `source_md_path: "${params.source_md_path.replace(/"/g, '\\"')}"\n`
				: "";
			const frontmatter = `---\ntitle: "${titleEscaped}"\nsidebar: false\n${sourceLine}---\n\n`;
			const { cleaned, strippedCount } = stripMdxHtml(params.markdown);
			await writeFile(path, frontmatter + cleaned, { encoding: "utf8" });

			const verification = await verifyRender(slug);
			if (!verification.ok) {
				return {
					content: [
						{
							type: "text",
							text: `Wrote ${path} but render verification failed: ${verification.reason}`,
						},
					],
					details: {
						slug,
						path,
						url,
						title: params.title,
						source_md_path: params.source_md_path,
						html_stripped_count: strippedCount,
						verify_error: verification.reason,
					},
					isError: true,
				};
			}

			surfaceRenderProgress(`Rendered (single): ${url}`);
			return {
				content: [{ type: "text", text: `Rendered ${url}` }],
				details: {
					slug,
					path,
					url,
					title: params.title,
					source_md_path: params.source_md_path,
					html_stripped_count: strippedCount,
				},
			};
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [
					{ type: "text", text: `Failed to write HTML render: ${message}` },
				],
				details: { error: message },
				isError: true,
			};
		}
	},
});

/*
 * Multi-part variant of write_html_render. Used when a markdown source is
 * too large to render on a single HTML page (rule of thumb: ~2000+ lines,
 * or any curriculum / research doc whose single-page render visibly bloats
 * the browser). The caller supplies an array of parts; each part becomes
 * its own `.mdx` file at `renders/<base>-part-<N>-<part-slug>.mdx` and
 * its frontmatter carries the full `parts` list plus the current
 * `part_slug`, which the DocLayout reads to render a "Parts" nav block
 * above the on-page TOC. Re-running on the same overall title on the same
 * day cleans up any prior single-page or multipart artifacts for the
 * same base before writing, so the URL set always reflects the latest
 * intent and stale parts can't linger when the split shape changes.
 */
const writeHtmlRenderMultipart = defineTool({
	name: "write_html_render_multipart",
	label: "Write HTML Render (multi-part)",
	description:
		"Write a long markdown source as a SET of `.mdx` part pages into the root `renders/` directory. Each part is served at `http://localhost:8080/v/<base>-part-<N>-<part-slug>` and the DocLayout sidebar shows a 'Parts' nav block linking every sibling. **This is the multi-part leg of the `render-html` skill family.** The orchestrator skill calls `plan_html_render` first; when it returns `mode: multipart`, pass `parts: plan.parts` directly into this tool (the planner produces the exact part shape this tool expects — same titles, same ordering, same markdown bodies). Re-running on the same overall title on the same day overwrites the file set; existing single-page or multipart files under the same base slug are cleaned up first. URLs from the plan match the URLs this tool serves — same slug derivation. Return the URL set plainly; do NOT add suggestions about cloudflared or setting `AGENTS_TEAM_SERVER_PUBLIC_URL`.",
	parameters: Type.Object({
		title: Type.String({
			description:
				"Overall title of the document (used to derive the base slug shared by every part). Each part's own page title is composed as `<part.title> — <title>`.",
		}),
		parts: Type.Array(
			Type.Object({
				title: Type.String({
					description:
						"Title of this part (used in the sidebar 'Parts' nav and to build its slug suffix). Keep it short — e.g. 'Introduction', 'Fundamentals', 'Module 3: Recursion'.",
				}),
				markdown: Type.String({
					description:
						"Markdown body for this part, written verbatim. NO frontmatter (the tool prepends it). Same idiom rules as `write_html_render` — Mermaid via ```mermaid` fences, GFM callouts via `> [!NOTE]`, no `<style>` / `<script>` / inline HTML chrome.",
				}),
			}),
			{
				minItems: 2,
				description:
					"Ordered list of parts. Index in this array maps 1:1 to the visible Part N number and to the slug ordering. Minimum two parts — if you only have one, use `write_html_render`.",
			},
		),
		source_md_path: Type.Optional(
			Type.String({
				description:
					"Vault-relative path of the markdown source the parts were split from. Recorded in the response so the caller can keep them paired.",
			}),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		try {
			return await writeMultipartRender({
				title: params.title,
				parts: params.parts,
				source_md_path: params.source_md_path,
			});
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [
					{ type: "text", text: `Failed to write multi-part HTML render: ${message}` },
				],
				details: { error: message },
				isError: true,
			};
		}
	},
});

const writeExportPdf = defineTool({
	name: "write_export_pdf",
	label: "Write PDF Export",
	description:
		"Render a complete Kami-styled HTML document to PDF (via headless Chrome) and write it into the canonical export root at `<repo>/exports/` (override with `AGENTS_TEAM_EXPORT_PATH`). The PDF is named `<YYYY-MM-DD>-<slug-of-title>-<epoch>.pdf` (Unix-epoch seconds appended) and served at `http://localhost:8080/p/{slug}.pdf` by the Next.js route handler at `app/p/[slug]/route.ts` which reads from disk at request time. The host portion is overridden by `AGENTS_TEAM_SERVER_PUBLIC_URL` if set. Each regeneration produces a NEW filename — the epoch suffix defeats CDN (Cloudflare) caching because the URL changes per export. After the new PDF is on disk, prior PDFs for the SAME title across ALL dates are deleted automatically so the export root holds only the latest version per title; date prefix in the regex is wild, title slug is exact, optional epoch suffix is matched too (so legacy unsuffixed PDFs are pruned in the same pass). Used by the `export` skill to produce print-ready deliverables (resume, letter, portfolio, report, slides, etc.). Caller passes Kami-styled HTML; this tool writes the HTML transiently, hands it to Chrome to render, then deletes the HTML once the PDF is confirmed on disk. If Chrome fails, the HTML is retained for manual recovery and the tool returns isError. Return the URL plainly; do NOT add suggestions about cloudflared or setting `AGENTS_TEAM_SERVER_PUBLIC_URL`.",
	parameters: Type.Object({
		title: Type.String({
			description:
				"Title used for the document and to build the URL slug. Recorded in the response.",
		}),
		html: Type.String({
			description:
				"Complete Kami-styled HTML document, written verbatim. Must start with <!doctype html>, embed all CSS inline, and avoid network-dependent assets (web fonts are fine via `@font-face` with local fallbacks; remote scripts are not used because PDF print does not need JS).",
		}),
		source_md_path: Type.Optional(
			Type.String({
				description:
					"Vault-relative path of the markdown source, if the export was generated from a vault note. Recorded in the response so the caller can keep them paired. Omit for one-shot inline exports (e.g. resumes the user does not want archived).",
			}),
		),
		template: Type.Optional(
			Type.String({
				description:
					"Kami template name used for this export (one-pager | long-doc | letter | portfolio | resume | slides | equity-report | changelog). Recorded in the response for telemetry; does not affect rendering.",
			}),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		// Append Unix-epoch seconds so every regeneration produces a unique
		// filename rather than overwriting the prior PDF. This defeats
		// Cloudflare's edge cache: the URL changes, so the CDN can't serve
		// a stale copy under the same URL. After a successful write we
		// prune older PDFs for the same title across ALL dates, so the
		// export root holds only one file per title.
		const epoch = Math.floor(Date.now() / 1000);
		const prefix = `${todayIso()}-${slugify(params.title)}`;
		const slug = `${prefix}-${epoch}`;
		const pdfDir = EXPORT_ROOT;
		const tmpDir = join(SERVER_ROOT, ".export-tmp");
		const htmlPath = join(tmpDir, `${slug}.html`);
		const pdfPath = join(pdfDir, `${slug}.pdf`);
		const pdfUrl = `${serverPublicUrl()}/p/${slug}.pdf`;

		try {
			if (!existsSync(pdfDir)) await mkdir(pdfDir, { recursive: true });
			if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });
			await writeFile(htmlPath, params.html, { encoding: "utf8" });

			const chrome = resolveChromeBinary();
			if (!chrome) {
				return {
					content: [
						{
							type: "text",
							text: `Wrote HTML to ${htmlPath} but no Chrome binary was found. Set AGENTS_TEAM_CHROME_PATH or install Google Chrome / Chromium to enable PDF rendering.`,
						},
					],
					details: {
						html_path: htmlPath,
						pdf_path: null,
						pdf_url: null,
						title: params.title,
						source_md_path: params.source_md_path,
						template: params.template,
						error: "no_chrome_binary",
					},
					isError: true,
				};
			}

			await execFileP(
				chrome,
				[
					"--headless=new",
					"--disable-gpu",
					"--no-pdf-header-footer",
					"--no-sandbox",
					// Paint the page canvas parchment BEFORE CSS layout, so any
					// `@page { margin }` area renders in-band with the body even
					// when the rendered HTML happens to omit `@page {
					// background-color }`. The render-pdf agent is LLM-driven
					// and occasionally drifts off the prescribed CSS — without
					// this flag, a missing @page bg yields a thick white frame
					// around the parchment content. Flag value is RRGGBBAA
					// (NOT AARRGGBB — that order paints a peach tone).
					// Harmless when the CSS is correct: parchment over
					// parchment.
					"--default-background-color=f5f4edFF",
					"--virtual-time-budget=5000",
					`--print-to-pdf=${pdfPath}`,
					`file://${htmlPath}`,
				],
				{ timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
			);

			if (!existsSync(pdfPath)) {
				throw new Error(
					"Chrome reported success but no PDF file appeared at the target path.",
				);
			}

			// PDF is the deliverable; the intermediate HTML is no longer needed.
			// Swallow unlink errors — the export still succeeded.
			await unlink(htmlPath).catch(() => undefined);

			// Prune older PDFs for this title across all dates. Match any
			// filename of the form `<YYYY-MM-DD>-<title-slug>(-<epoch>)?.pdf`
			// — date prefix is wild, title slug is exact, epoch suffix is
			// optional so legacy unsuffixed files (from before the epoch
			// suffix was added) are caught too. Result: a re-export keeps
			// only the just-written file for that title, regardless of
			// when prior versions were generated. Run AFTER the new file
			// is on disk so a failed export can't wipe out the prior good
			// version. Per-file unlink failures are swallowed — one stuck
			// file shouldn't fail the export.
			const titleSlug = slugify(params.title);
			const newFilename = `${slug}.pdf`;
			const titleRegex = new RegExp(
				`^\\d{4}-\\d{2}-\\d{2}-${titleSlug.replace(
					/[.*+?^${}()|[\]\\]/g,
					"\\$&",
				)}(-\\d+)?\\.pdf$`,
			);
			const existing = await readdir(pdfDir).catch(() => [] as string[]);
			await Promise.all(
				existing
					.filter((f) => f !== newFilename && titleRegex.test(f))
					.map((f) => unlink(join(pdfDir, f)).catch(() => undefined)),
			);

			return {
				content: [{ type: "text", text: `Exported ${pdfUrl}` }],
				details: {
					slug,
					pdf_path: pdfPath,
					pdf_url: pdfUrl,
					title: params.title,
					source_md_path: params.source_md_path,
					template: params.template,
				},
			};
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [
					{ type: "text", text: `Failed to export PDF: ${message}` },
				],
				details: {
					html_path: existsSync(htmlPath) ? htmlPath : null,
					pdf_path: null,
					error: message,
				},
				isError: true,
			};
		}
	},
});

export default function (pi: ExtensionAPI): void {
	piRef = pi;
	pi.registerMessageRenderer(RENDER_HTML_CUSTOM_TYPE, createBoxRenderer());
	pi.registerTool(writeNote);
	pi.registerTool(planHtmlRender);
	pi.registerTool(writeHtmlRender);
	pi.registerTool(writeHtmlRenderMultipart);
	pi.registerTool(writeExportPdf);
}
