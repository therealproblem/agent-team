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
 *                            Next.js server's `content/v/` directory.
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

const writeHtmlRender = defineTool({
	name: "write_html_render",
	label: "Write HTML Render",
	description:
		"Write a markdown body as an `.mdx` page into the local Nextra server's `content/v/` directory. The page is named `<YYYY-MM-DD>-<slug-of-title>.mdx` and served at `http://localhost:8080/v/{slug}` (or whatever `AGENTS_TEAM_SERVER_PUBLIC_URL` points to). Re-running on the same title on the same day overwrites the file; the URL stays stable. Used by the `render-html` skill. The caller passes plain markdown body — Nextra owns layout, theme, syntax highlighting, copy buttons, TOC, and dark/light mode. Do NOT include `<!doctype>`, `<html>`, `<head>`, `<style>`, or `<script>` — that's all framework chrome. Return the URL plainly; do NOT add suggestions about cloudflared or setting `AGENTS_TEAM_SERVER_PUBLIC_URL`.",
	parameters: Type.Object({
		title: Type.String({
			description:
				"Title for the page (set as `title` in frontmatter, used to build the URL slug). Should match the source note's title.",
		}),
		markdown: Type.String({
			description:
				"Markdown body, written verbatim. NO frontmatter (this tool prepends it). NO `<!doctype>` / `<html>` / `<head>` / `<style>` / `<script>` — Nextra owns the chrome. Mermaid blocks via ```mermaid` fences are supported. GFM callouts via `> [!NOTE]` / `> [!WARNING]` / `> [!DANGER]` are rendered as styled boxes.",
		}),
		source_md_path: Type.Optional(
			Type.String({
				description:
					"Vault-relative path of the markdown source this render was generated from (e.g. 'pm/prd/2026-05-15-foo.md'). Recorded in the response so the caller can keep them paired.",
			}),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const slug = `${todayIso()}-${slugify(params.title)}`;
		const dir = join(SERVER_ROOT, "content", "v");
		const path = join(dir, `${slug}.mdx`);
		const url = `${serverPublicUrl()}/v/${slug}`;

		try {
			if (!existsSync(dir)) {
				await mkdir(dir, { recursive: true });
			}
			const titleEscaped = params.title.replace(/"/g, '\\"');
			const frontmatter = `---\ntitle: "${titleEscaped}"\nsidebar: false\n---\n\n`;
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
 * its own `.mdx` file at `content/v/<base>-part-<N>-<part-slug>.mdx` and
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
		"Write a long markdown source as a SET of `.mdx` part pages into the local Next.js server's `content/v/` directory. Each part is served at `http://localhost:8080/v/<base>-part-<N>-<part-slug>` and the DocLayout sidebar shows a 'Parts' nav block linking every sibling. Use when the source markdown is too large for one HTML page (~2000+ lines, or any curriculum/research doc that visibly bloats the page). The caller passes an ordered `parts` array where each item is `{ title, markdown }`. Re-running on the same overall title on the same day overwrites the file set; existing single-page or multipart files under the same base slug are cleaned up first. Return the URL set plainly; do NOT add suggestions about cloudflared or setting `AGENTS_TEAM_SERVER_PUBLIC_URL`.",
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
		const baseSlug = `${todayIso()}-${slugify(params.title)}`;
		const dir = join(SERVER_ROOT, "content", "v");
		const pad = (n: number) =>
			String(n).padStart(String(params.parts.length).length, "0");
		const partSlugs = params.parts.map(
			(p, i) => `${baseSlug}-part-${pad(i + 1)}-${slugify(p.title)}`,
		);
		const partsMeta = partSlugs.map((slug, i) => ({
			slug,
			title: params.parts[i].title,
		}));

		const escapeYaml = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const buildFrontmatter = (currentSlug: string, partTitle: string) => {
			const fullTitle = `${partTitle} — ${params.title}`;
			const lines = [
				"---",
				`title: "${escapeYaml(fullTitle)}"`,
				"sidebar: false",
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

		try {
			if (!existsSync(dir)) {
				await mkdir(dir, { recursive: true });
			}

			// Clean up any prior artifacts under the same base before writing
			// the new set. Without this, shrinking from 5 parts to 3 would
			// leave parts 4 and 5 stranded under their old URLs. We also
			// remove `<base>.mdx` so a switch from single-page to multipart
			// (or back) doesn't leave both flavors coexisting.
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

			// Verify every part's URL in parallel — one broken part is enough
			// to fail the whole multipart write, since the sibling nav makes
			// the broken part discoverable from every other page.
			const verifications = await Promise.all(
				results.map(async (r) => ({ r, v: await verifyRender(r.slug) })),
			);
			const failures = verifications.filter((x) => !x.v.ok);
			if (failures.length > 0) {
				const detail = failures
					.map(
						(x, i) =>
							`${x.r.title}: ${(x.v as { ok: false; reason: string }).reason}`,
					)
					.join("; ");
				return {
					content: [
						{
							type: "text",
							text: `Wrote ${results.length} parts but ${failures.length} failed to render — ${detail}`,
						},
					],
					details: {
						base_slug: baseSlug,
						title: params.title,
						parts: results,
						source_md_path: params.source_md_path,
						failed_parts: failures.map((x) => ({
							slug: x.r.slug,
							title: x.r.title,
							reason: (x.v as { ok: false; reason: string }).reason,
						})),
					},
					isError: true,
				};
			}

			const summary = results
				.map((r, i) => `Part ${i + 1}: ${r.url}`)
				.join("\n");
			return {
				content: [{ type: "text", text: `Rendered ${results.length} parts:\n${summary}` }],
				details: {
					base_slug: baseSlug,
					title: params.title,
					parts: results,
					source_md_path: params.source_md_path,
				},
			};
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
	pi.registerTool(writeNote);
	pi.registerTool(writeHtmlRender);
	pi.registerTool(writeHtmlRenderMultipart);
	pi.registerTool(writeExportPdf);
}
