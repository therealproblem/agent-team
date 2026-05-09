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
		"Write a note to the user's Obsidian vault. Called by the `note-taker` skill; agents should not call this directly.",
	parameters: Type.Object({
		title: Type.String({ description: "Short noun-phrase title for the note." }),
		body: Type.String({ description: "Markdown body. Frontmatter is added automatically." }),
		folder: Type.Optional(
			Type.String({ description: "Vault subfolder. Default: 'inbox'." }),
		),
		tags: Type.Optional(
			Type.Array(Type.String(), { description: "Tags to add to frontmatter." }),
		),
		links: Type.Optional(
			Type.Array(Type.String(), {
				description: "Wiki-link targets (note titles) to append at the bottom.",
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

		try {
			if (!existsSync(dirname(path))) {
				await mkdir(dirname(path), { recursive: true });
			}

			const fmLines = ["---"];
			fmLines.push(`title: ${JSON.stringify(params.title)}`);
			fmLines.push(`created: ${new Date().toISOString()}`);
			if (params.source_agent) fmLines.push(`source_agent: ${params.source_agent}`);
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

			await writeFile(path, frontmatter + params.body + linksFooter, {
				encoding: "utf8",
			});

			return {
				content: [{ type: "text", text: `Wrote ${path}` }],
				details: { path, title: params.title },
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
