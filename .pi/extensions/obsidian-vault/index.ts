/**
 * obsidian-vault — write-only interface to the user's Obsidian vault.
 *
 * Used by the `note-taker` skill (Layer 3). No agent should write to the
 * vault directly; everything goes through this extension's `write_note`
 * tool so folder structure, frontmatter, and link conventions stay
 * consistent.
 *
 * Configure vault path via environment variable AGENTS_TEAM_VAULT_PATH.
 * Default: ~/Obsidian/vault.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Default: project-root `vault/`. Override with AGENTS_TEAM_VAULT_PATH if you
// want notes to land in your real Obsidian vault elsewhere on disk.
const VAULT_ROOT = resolve(
	process.env.AGENTS_TEAM_VAULT_PATH ?? join(process.cwd(), "vault"),
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
		"Write a note or document to the user's Obsidian vault. Called by the `note-taker` skill (markdown notes) and the `document` skill (self-contained HTML). Agents should not call this directly.",
	parameters: Type.Object({
		title: Type.String({ description: "Short noun-phrase title for the note." }),
		body: Type.String({
			description:
				"Note body. For format='markdown' (default), this is markdown (frontmatter is prepended automatically). For format='html', this is the COMPLETE self-contained HTML document — written verbatim with no frontmatter, no link footer.",
		}),
		format: Type.Optional(
			Type.Union([Type.Literal("markdown"), Type.Literal("html")], {
				description:
					"Output format. 'markdown' (default) writes a .md file with YAML frontmatter. 'html' writes a .html file verbatim — caller is responsible for the full <!doctype>…</html>.",
			}),
		),
		folder: Type.Optional(
			Type.String({
				description:
					"Vault subfolder. Default: 'inbox' for markdown, 'docs' for html.",
			}),
		),
		tags: Type.Optional(
			Type.Array(Type.String(), {
				description: "Tags (markdown only — added to frontmatter).",
			}),
		),
		links: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"Wiki-link targets (markdown only — appended at the bottom).",
			}),
		),
		source_agent: Type.Optional(
			Type.String({ description: "Which agent generated this note." }),
		),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const format = params.format ?? "markdown";
		const folder = params.folder ?? (format === "html" ? "docs" : "inbox");
		const ext = format === "html" ? "html" : "md";
		const filename = `${todayIso()}-${slugify(params.title)}.${ext}`;
		const path = join(VAULT_ROOT, folder, filename);

		try {
			if (!existsSync(dirname(path))) {
				await mkdir(dirname(path), { recursive: true });
			}

			let fileContents: string;
			if (format === "html") {
				// HTML: write verbatim. The caller (document skill) owns the
				// full document including <!doctype>, <head>, embedded styles.
				// No frontmatter, no link footer.
				fileContents = params.body;
			} else {
				const fmLines = ["---"];
				fmLines.push(`title: ${JSON.stringify(params.title)}`);
				fmLines.push(`created: ${new Date().toISOString()}`);
				if (params.source_agent)
					fmLines.push(`source_agent: ${params.source_agent}`);
				if (params.tags?.length) {
					fmLines.push(
						`tags: [${params.tags.map((t: string) => JSON.stringify(t)).join(", ")}]`,
					);
				}
				fmLines.push("---", "");
				const frontmatter = fmLines.join("\n");

				let linksFooter = "";
				if (params.links?.length) {
					const wiki = params.links.map((l: string) => `[[${l}]]`).join(" · ");
					linksFooter = `\n\n---\nLinks: ${wiki}\n`;
				}

				fileContents = frontmatter + params.body + linksFooter;
			}

			await writeFile(path, fileContents, { encoding: "utf8" });

			// Always include a file:// URL — the `document` skill surfaces this
			// to the user; `note-taker` ignores it for plain markdown notes.
			const url = `file://${path}`;
			return {
				content: [{ type: "text", text: `Wrote ${path}` }],
				details: { path, url, title: params.title, format },
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

export default function (pi: ExtensionAPI): void {
	pi.registerTool(writeNote);
}
