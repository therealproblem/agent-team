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
 *   - `write_presentation` — markdown body, written as `.mdx` into the
 *                            Next.js server's `content/v/` directory.
 *                            Nextra serves it at `/v/<YYYY-MM-DD>-<slug>`.
 *                            Re-running the same title on the same day
 *                            overwrites the file; the URL stays stable.
 *                            Used by the `present-interactive` skill
 *                            (Layer 3).
 *   - `write_export_pdf` — PDF, written into the canonical export root
 *                          at `<repo>/exports/`. The Next.js server's
 *                          `public/p/` is a symlink into this directory so
 *                          the PDF is served at
 *                          `/p/<YYYY-MM-DD>-<slug>.pdf`. Re-exporting the
 *                          same title on the same day overwrites the file;
 *                          the URL stays stable. Used by the `export` skill
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
 *   AGENTS_TEAM_SERVER_PUBLIC_URL — default: http://localhost:8080
 *                                   Set to your cloudflared tunnel hostname
 *                                   so returned URLs are share-ready.
 *   AGENTS_TEAM_CHROME_PATH       — default: platform auto-detect (macOS:
 *                                   /Applications/Google Chrome.app/Contents/MacOS/Google Chrome)
 *
 * Agents should NOT call these tools directly — they go through `note-taker`,
 * `present-interactive`, and `export` skills so naming, folder, and design
 * conventions stay consistent.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
const SERVER_PUBLIC_URL =
	process.env.AGENTS_TEAM_SERVER_PUBLIC_URL ?? "http://localhost:8080";

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

const writeNote = defineTool({
	name: "write_note",
	label: "Write Note",
	description:
		"Write a markdown note to the Obsidian vault. Owns YAML frontmatter, inline tags, wiki-link footers. Called by the `note-taker` skill. Markdown only — HTML output goes through the `write_presentation` tool (via the `present-interactive` skill).",
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

const writePresentation = defineTool({
	name: "write_presentation",
	label: "Write Presentation",
	description:
		"Write a markdown body as an `.mdx` page into the local Nextra server's `content/v/` directory. The page is named `<YYYY-MM-DD>-<slug-of-title>.mdx` and served at `http://localhost:8080/v/{slug}` (or whatever `AGENTS_TEAM_SERVER_PUBLIC_URL` points to — typically a cloudflared tunnel hostname for share-ready URLs). Re-running on the same title on the same day overwrites the file; the URL stays stable. Used by the `present-interactive` skill. The caller passes plain markdown body — Nextra owns layout, theme, syntax highlighting, copy buttons, TOC, and dark/light mode. Do NOT include `<!doctype>`, `<html>`, `<head>`, `<style>`, or `<script>` — that's all framework chrome.",
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
					"Vault-relative path of the markdown source this presentation was generated from (e.g. 'pm/prd/2026-05-15-foo.md'). Recorded in the response so the caller can keep them paired.",
			}),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const slug = `${todayIso()}-${slugify(params.title)}`;
		const dir = join(SERVER_ROOT, "content", "v");
		const path = join(dir, `${slug}.mdx`);
		const url = `${SERVER_PUBLIC_URL}/v/${slug}`;

		try {
			if (!existsSync(dir)) {
				await mkdir(dir, { recursive: true });
			}
			const titleEscaped = params.title.replace(/"/g, '\\"');
			const frontmatter = `---\ntitle: "${titleEscaped}"\nsidebar: false\n---\n\n`;
			await writeFile(path, frontmatter + params.markdown, { encoding: "utf8" });
			return {
				content: [{ type: "text", text: `Presented ${url}` }],
				details: {
					slug,
					path,
					url,
					title: params.title,
					source_md_path: params.source_md_path,
				},
			};
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [
					{ type: "text", text: `Failed to write presentation: ${message}` },
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
		"Render a complete Kami-styled HTML document to PDF (via headless Chrome) and write it into the canonical export root at `<repo>/exports/` (override with `AGENTS_TEAM_EXPORT_PATH`). The PDF is named `<YYYY-MM-DD>-<slug-of-title>.pdf` and served at `http://localhost:8080/p/{slug}.pdf` (the local Nextra server's `public/p/` is a symlink into the export root). Override the host with `AGENTS_TEAM_SERVER_PUBLIC_URL` — typically a cloudflared tunnel hostname for share-ready URLs. Re-exporting the same title on the same day overwrites the file; the URL stays stable. Used by the `export` skill to produce print-ready deliverables (resume, letter, portfolio, report, slides, etc.). Caller passes Kami-styled HTML; this tool writes the HTML transiently, hands it to Chrome to render, then deletes the HTML once the PDF is confirmed on disk. If Chrome fails, the HTML is retained for manual recovery and the tool returns isError.",
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
		const slug = `${todayIso()}-${slugify(params.title)}`;
		const pdfDir = EXPORT_ROOT;
		const tmpDir = join(SERVER_ROOT, ".export-tmp");
		const htmlPath = join(tmpDir, `${slug}.html`);
		const pdfPath = join(pdfDir, `${slug}.pdf`);
		const pdfUrl = `${SERVER_PUBLIC_URL}/p/${slug}.pdf`;

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
	pi.registerTool(writePresentation);
	pi.registerTool(writeExportPdf);
}
