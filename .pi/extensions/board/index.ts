/**
 * board — write-side surface for the per-project kanban.
 *
 * The board UI at `/projects/<slug>` is read-only (plus the user-facing
 * Submit Request form). When an agent — PM, engineer, or any persona —
 * needs to create a card, it goes through `board_create_card` instead of
 * editing markdown by hand. The tool:
 *
 *   1. Stamps a UUID v4 `id:` so the card is reachable at `/c/<id>`.
 *   2. Slugifies the title for the filename (collisions get a random suffix).
 *   3. Writes the frontmatter + body atomically.
 *   4. Returns `{ id, projectSlug, cardSlug, url, vaultPath }` so the agent
 *      can surface the short URL in its reply without computing it itself.
 *
 * Read-side reads (listing, status changes, comments) still go through the
 * Next.js board UI / server actions or direct file edits — this extension
 * only adds the *creation* path, where the ID-stamp + URL-return matters.
 */

import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import {
	defineTool,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const REPO_ROOT = resolve(process.cwd());

const VALID_PERSONAS = ["pm", "engineer"] as const;
const VALID_STATUSES = [
	"request",
	"triage",
	"backlog",
	"blocked",
	"in_progress",
	"in_review",
	"done",
] as const;
const VALID_PRIORITIES = ["p0", "p1", "p2", "p3"] as const;

const SUB_PERSONAS: Record<(typeof VALID_PERSONAS)[number], readonly string[]> = {
	pm: ["prd", "roadmap", "stakeholder-summary", "user-research", "uiux", "copywriter"],
	engineer: ["frontend", "backend", "uiux", "devops", "debugger", "refactor"],
};

const MAX_TITLE_LENGTH = 120;
const MAX_SLUG_LENGTH = 60;
const MAX_BODY_LENGTH = 16_000;

function vaultRoot(): string {
	return process.env.AGENTS_TEAM_VAULT_PATH || join(REPO_ROOT, "vault");
}

function projectsDir(): string {
	return join(vaultRoot(), "projects");
}

function publicUrl(): string {
	return (
		process.env.AGENTS_TEAM_SERVER_PUBLIC_URL ||
		`http://localhost:${process.env.AGENTS_TEAM_SERVER_PORT || "8080"}`
	).replace(/\/+$/, "");
}

function today(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/g, "");
}

function isValidProjectSlug(slug: string): boolean {
	return /^[a-z0-9][a-z0-9-]*$/.test(slug) && !slug.includes("..");
}

function randomSuffix(): string {
	return Math.random().toString(36).slice(2, 8);
}

function escapeYaml(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function yamlList(items: readonly string[]): string {
	if (items.length === 0) return "[]";
	const sanitized = items
		.map((t) => t.trim())
		.filter((t) => t.length > 0)
		.map((t) => `"${escapeYaml(t)}"`);
	if (sanitized.length === 0) return "[]";
	return `[${sanitized.join(", ")}]`;
}

interface CreateCardArgs {
	project_slug: string;
	title: string;
	persona: (typeof VALID_PERSONAS)[number];
	body?: string;
	sub_persona?: string;
	status?: (typeof VALID_STATUSES)[number];
	priority?: (typeof VALID_PRIORITIES)[number];
	link?: string;
	tags?: string[];
	slug?: string;
}

const boardCreateCard = defineTool({
	name: "board_create_card",
	label: "Create Card",
	description:
		"Create a new kanban card under a project. Returns the card's globally-unique short URL — surface that URL in your reply so the user can click into the card. Use this whenever you (PM or engineer) drop a card on the board; do NOT hand-write the markdown file. The tool stamps a UUID `id:`, slugifies the title for the filename, writes the frontmatter + body, and returns `{id, projectSlug, cardSlug, url, vaultPath}`.",
	parameters: Type.Object({
		project_slug: Type.String({
			description:
				"Project directory under `<vault>/projects/`. Must already exist (create the project + project.md first if needed).",
		}),
		title: Type.String({
			description: "Card title. Short, descriptive — used both for display and to derive the filename slug.",
		}),
		persona: Type.Union(
			VALID_PERSONAS.map((p) => Type.Literal(p)),
			{
				description:
					"Owner of the card. `pm` for PM artifacts (PRDs, roadmaps, stakeholder writing); `engineer` for implementation work.",
			},
		),
		body: Type.Optional(
			Type.String({
				description:
					"Card body markdown. Brief + acceptance criteria + links. The body is what the engineer or the user actually reads.",
			}),
		),
		sub_persona: Type.Optional(
			Type.String({
				description:
					"Inner skill. PM: prd | roadmap | stakeholder-summary | user-research | uiux | copywriter. Engineer: frontend | backend | uiux | devops | debugger | refactor.",
			}),
		),
		status: Type.Optional(
			Type.Union(VALID_STATUSES.map((s) => Type.Literal(s)), {
				description:
					"Initial column. Defaults to `backlog`. Use `in_progress` when you're picking it up immediately.",
			}),
		),
		priority: Type.Optional(
			Type.Union(VALID_PRIORITIES.map((p) => Type.Literal(p)), {
				description: "p0 (now) · p1 (soon) · p2 (next) · p3 (someday). Defaults to `p2`.",
			}),
		),
		link: Type.Optional(
			Type.String({
				description:
					"Vault-relative path to a related note (PRD, ADR, decision memo). Rendered as a small link in the card dialog.",
			}),
		),
		tags: Type.Optional(
			Type.Array(Type.String(), {
				description: "Free-form tags. Lowercase, hyphenated.",
			}),
		),
		slug: Type.Optional(
			Type.String({
				description:
					"Override the filename slug. Defaults to a slugified title. Use sparingly — title-derived slugs are easier to scan in the board dir.",
			}),
		),
	}),

	async execute(_toolCallId, params, _signal) {
		const args = params as CreateCardArgs;

		const projectSlug = args.project_slug.trim();
		if (!isValidProjectSlug(projectSlug)) {
			return {
				content: [{ type: "text", text: `Invalid project_slug: "${projectSlug}".` }],
				isError: true,
			};
		}

		const title = args.title.trim();
		if (!title) {
			return {
				content: [{ type: "text", text: "title is required." }],
				isError: true,
			};
		}
		if (title.length > MAX_TITLE_LENGTH) {
			return {
				content: [
					{
						type: "text",
						text: `title too long (max ${MAX_TITLE_LENGTH} chars).`,
					},
				],
				isError: true,
			};
		}

		const body = (args.body ?? "").trim();
		if (body.length > MAX_BODY_LENGTH) {
			return {
				content: [
					{ type: "text", text: `body too long (max ${MAX_BODY_LENGTH} chars).` },
				],
				isError: true,
			};
		}

		// Project must exist already — the board UI doesn't show projects without
		// a directory, so writing a card into a non-existent project would be
		// invisible. Force the caller to create the project first.
		const projectDir = join(projectsDir(), projectSlug);
		try {
			const s = await stat(projectDir);
			if (!s.isDirectory()) throw new Error("not a directory");
		} catch {
			return {
				content: [
					{
						type: "text",
						text: `Project not found: ${projectSlug}. Create <vault>/projects/${projectSlug}/project.md from _project_template.md first.`,
					},
				],
				isError: true,
			};
		}

		if (args.sub_persona) {
			const allowed = SUB_PERSONAS[args.persona];
			if (!allowed.includes(args.sub_persona)) {
				return {
					content: [
						{
							type: "text",
							text: `sub_persona "${args.sub_persona}" not valid under persona "${args.persona}". Allowed: ${allowed.join(", ")}.`,
						},
					],
					isError: true,
				};
			}
		}

		const boardDir = join(projectDir, "board");
		await mkdir(boardDir, { recursive: true });

		const baseSlug = (args.slug?.trim() ? slugify(args.slug) : slugify(title)) || "card";
		let cardSlug = baseSlug;
		let filePath = join(boardDir, `${cardSlug}.md`);
		for (let i = 0; i < 5; i++) {
			try {
				await access(filePath);
				cardSlug = `${baseSlug}-${randomSuffix()}`;
				filePath = join(boardDir, `${cardSlug}.md`);
			} catch {
				break;
			}
		}
		// Sandbox: the resolved path must stay inside the project's board dir.
		const resolved = resolve(filePath);
		const resolvedBoardDir = resolve(boardDir);
		if (!resolved.startsWith(resolvedBoardDir + "/")) {
			return {
				content: [{ type: "text", text: "Invalid card path." }],
				isError: true,
			};
		}

		const id = randomUUID();
		const status = args.status ?? "backlog";
		const priority = args.priority ?? "p2";
		const dateStr = today();

		const lines: string[] = ["---", `id: ${id}`, `title: "${escapeYaml(title)}"`];
		lines.push(`status: ${status}`);
		lines.push(`persona: ${args.persona}`);
		if (args.sub_persona) lines.push(`sub_persona: ${args.sub_persona}`);
		lines.push(`priority: ${priority}`);
		lines.push(`created: ${dateStr}`);
		lines.push(`updated: ${dateStr}`);
		if (args.tags && args.tags.length > 0) lines.push(`tags: ${yamlList(args.tags)}`);
		if (args.link) lines.push(`link: "${escapeYaml(args.link)}"`);
		lines.push("---", "");

		const content = lines.join("\n") + (body ? `${body}\n` : "");
		await writeFile(filePath, content, { encoding: "utf8" });

		const url = `${publicUrl()}/c/${id}`;
		const vaultPath = `projects/${projectSlug}/board/${cardSlug}.md`;

		return {
			content: [
				{
					type: "text",
					text: `Created ${vaultPath}\nURL: ${url}`,
				},
			],
			details: { id, projectSlug, cardSlug, url, vaultPath, status, persona: args.persona },
		};
	},
});

export default function (pi: ExtensionAPI): void {
	if (!existsSync(projectsDir())) {
		// Don't pre-create the projects dir — let the user / project-creation
		// flow do that. The tool itself errors helpfully if the project is
		// missing.
	}
	pi.registerTool(boardCreateCard);
}
