/**
 * quiet-read — overrides Pi's built-in `read` tool with a quieter
 * rendering. The agent still receives full file contents (so reasoning
 * is unchanged); the TUI just shows what the file is *for* instead of
 * its path, and hides the file body.
 *
 * Pi's loader runs `toolRegistry.set(tool.name, tool)` for extension
 * tools after built-ins (`core/agent-session.js`), so registering a
 * tool named `read` replaces the built-in without flagging anything.
 *
 * Execute scope is text files with offset/limit support — image reads
 * and the elaborate truncation/syntax-highlight pipeline from Pi's
 * built-in are dropped. If you need those back, adjust here.
 */

import { readFile, readFileSync, stat } from "node:fs";
import { readFile as readFileAsync, stat as statAsync } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const REPO_ROOT = resolve(process.cwd());

const readSchema = Type.Object({
	path: Type.String({
		description: "Path to the file to read (relative to cwd, or absolute).",
	}),
	offset: Type.Optional(
		Type.Number({
			description: "1-indexed line to start at. Default: 1.",
		}),
	),
	limit: Type.Optional(
		Type.Number({
			description: "Max lines to return after offset. Default: full file.",
		}),
	),
});

interface PersonaRegistry {
	personas: Record<string, unknown>;
	subagents: Record<string, unknown>;
}

let personaNames: Set<string> | null = null;

function loadPersonaNames(): Set<string> {
	if (personaNames) return personaNames;
	const registryPath = resolve(REPO_ROOT, ".pi/state/persona-registry.json");
	const registry: PersonaRegistry = JSON.parse(readFileSync(registryPath, "utf-8"));
	personaNames = new Set(Object.keys(registry.personas));
	return personaNames;
}

/**
 * Describe what a file is *for*, given its absolute path. Falls back
 * to `read <basename>` when nothing more specific fits.
 */
function describePurpose(absolutePath: string): string {
	const rel = absolutePath.startsWith(`${REPO_ROOT}/`)
		? absolutePath.slice(REPO_ROOT.length + 1)
		: absolutePath;

	// Check if it's a persona skill
	const personaMatch = rel.match(/^\.pi\/skills\/([^/]+)\/SKILL\.md$/);
	if (personaMatch) {
		const skillName = personaMatch[1];
		const personas = loadPersonaNames();
		if (personas.has(skillName)) {
			return `adopt ${skillName} persona`;
		}
		return `load ${skillName} skill`;
	}

	const profile = rel.match(/^\.pi\/state\/profiles\/([^/]+)\.md$/);
	if (profile) return `load ${profile[1]} profile`;

	const agent = rel.match(/^\.pi\/agents\/([^/]+)\.md$/);
	if (agent) return `load ${agent[1]} reviewer brief`;

	if (rel === ".pi/SYSTEM.md") return "load root system prompt";
	if (rel === "AGENTS.md" || rel === "CLAUDE.md") return "load repo guide";
	if (rel === "vault/.memory/reminders.md") return "check reminders";
	if (rel.startsWith("vault/.memory/profiles/")) return `load ${basename(rel, ".md")} profile`;
	if (rel.startsWith("vault/.memory/")) return `inspect ${basename(rel)} memory`;
	if (rel.startsWith(".pi/state/")) return `inspect ${basename(rel)} state`;
	if (rel.startsWith("vault/")) return `read note ${basename(rel, ".md")}`;
	if (rel === basename(rel)) return `read ${rel}`;
	return `read ${basename(rel)}`;
}

/** Resolve a user-supplied path against cwd, normalising to absolute. */
function resolveReadPath(p: string): string {
	return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}

const quietRead = defineTool({
	name: "read",
	label: "read",
	description:
		"Read the contents of a text file. Supports offset/limit by line. " +
		"Use this instead of `bash cat` so the harness can manage display.",
	promptSnippet: "Read file contents",
	promptGuidelines: ["Use read to examine files instead of cat or sed."],
	parameters: readSchema,

	async execute(_id, params, signal, _onUpdate, _ctx) {
		const absolutePath = resolveReadPath(params.path);
		if (signal?.aborted) throw new Error("Operation aborted");

		try {
			await statAsync(absolutePath);
		} catch (e) {
			return {
				content: [
					{
						type: "text",
						text: `Cannot read ${params.path}: ${(e as Error).message}`,
					},
				],
				isError: true,
			};
		}

		const buf = await readFileAsync(absolutePath);
		if (signal?.aborted) throw new Error("Operation aborted");

		const text = buf.toString("utf-8");
		const allLines = text.split("\n");
		const totalLines = allLines.length;
		const startLine = params.offset ? Math.max(0, params.offset - 1) : 0;

		if (startLine >= allLines.length) {
			return {
				content: [
					{
						type: "text",
						text: `Offset ${params.offset} is beyond end of file (${totalLines} lines).`,
					},
				],
				isError: true,
			};
		}

		const endLine =
			params.limit !== undefined
				? Math.min(startLine + params.limit, allLines.length)
				: allLines.length;
		let body = allLines.slice(startLine, endLine).join("\n");
		if (endLine < allLines.length) {
			body += `\n\n[Showing lines ${startLine + 1}-${endLine} of ${totalLines}. Use offset=${endLine + 1} to continue.]`;
		}
		return { content: [{ type: "text", text: body }] };
	},

	renderCall(args, theme) {
		const abs = resolveReadPath(args.path);
		return new Text(theme.fg("dim", describePurpose(abs)), 0, 0);
	},

	// File content is in the agent's context already — no need to show it
	// to the user. An empty Text suppresses the rendered tool result.
	renderResult() {
		return new Text("", 0, 0);
	},
});

export default function (pi: ExtensionAPI): void {
	pi.registerTool(quietRead);
}
