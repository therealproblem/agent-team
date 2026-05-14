/**
 * obsidian-vault — write interface to the user's Obsidian vault and to the
 * adjacent `renders/` directory for HTML presentations.
 *
 * Two tools:
 *   - `write_note`   — markdown-only, into the Obsidian vault. Owns frontmatter,
 *                      tags, wiki-link footers. The vault is markdown-first so
 *                      the Obsidian graph view, backlinks, and tag search work.
 *                      Called by the `note-taker` skill (Layer 3).
 *   - `write_render` — HTML, into a separate `renders/` directory OUTSIDE the
 *                      vault. Used by the `render` skill (Layer 3) when a
 *                      caller wants the markdown presented as an interactive
 *                      HTML page. Keeping HTML out of the vault preserves the
 *                      graph (Obsidian does not index .html files).
 *
 * Configure paths via env vars:
 *   AGENTS_TEAM_VAULT_PATH    — default: <cwd>/vault
 *   AGENTS_TEAM_RENDERS_PATH  — default: <cwd>/renders
 *
 * Agents should NOT call these tools directly — they go through `note-taker`
 * and `render` skills so naming, folder, and frontmatter conventions stay
 * consistent.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const VAULT_ROOT = resolve(
	process.env.AGENTS_TEAM_VAULT_PATH ?? join(process.cwd(), "vault"),
);
const RENDERS_ROOT = resolve(
	process.env.AGENTS_TEAM_RENDERS_PATH ?? join(process.cwd(), "renders"),
);

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
		"Write a markdown note to the Obsidian vault. Owns YAML frontmatter, inline tags, wiki-link footers. Called by the `note-taker` skill. Markdown only — HTML output goes through the `write_render` tool (via the `render` skill).",
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

const writeRender = defineTool({
	name: "write_render",
	label: "Write HTML Render",
	description:
		"Write a fully-assembled HTML file to the `renders/` directory (OUTSIDE the Obsidian vault). Used by the `render` skill to publish a presentation of a markdown note. The HTML body must be a complete self-contained document — caller owns `<!doctype>`, `<head>`, styles, scripts. Returns a `file://` URL the user can open in a browser.",
	parameters: Type.Object({
		title: Type.String({
			description: "Title for slug + filename. Should match the source note's title.",
		}),
		html: Type.String({
			description:
				"Complete HTML document, written verbatim. Must start with <!doctype html> and be self-contained.",
		}),
		source_md_path: Type.Optional(
			Type.String({
				description:
					"Vault-relative path of the markdown source this render was generated from (e.g. 'pm/prd/2026-05-15-foo.md'). Recorded in the response so the caller can keep them paired.",
			}),
		),
		subfolder: Type.Optional(
			Type.String({
				description:
					"Optional sub-path under `renders/` (e.g. 'pm/prd'). Default: flat — files land directly under `renders/`.",
			}),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const subfolder = params.subfolder ?? "";
		const filename = `${todayIso()}-${slugify(params.title)}.html`;
		const path = subfolder
			? join(RENDERS_ROOT, subfolder, filename)
			: join(RENDERS_ROOT, filename);

		try {
			if (!existsSync(dirname(path))) {
				await mkdir(dirname(path), { recursive: true });
			}
			await writeFile(path, params.html, { encoding: "utf8" });
			const url = `file://${path}`;
			return {
				content: [{ type: "text", text: `Rendered ${path}` }],
				details: {
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
					{ type: "text", text: `Failed to write render: ${message}` },
				],
				details: { error: message },
				isError: true,
			};
		}
	},
});

export default function (pi: ExtensionAPI): void {
	pi.registerTool(writeNote);
	pi.registerTool(writeRender);
}
