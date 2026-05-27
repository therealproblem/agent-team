/**
 * reminders — persistent todos.
 *
 * Responsibilities:
 *
 * 1. Surface open items at `session_start` (startup or resume) as a TUI
 *    message. The display is rendered by our own MessageRenderer so the
 *    default `[reminders]` customType label is dropped; just the list
 *    shows up.
 *
 * 2. Provide three tools — `reminder_add`, `reminder_resolve`,
 *    `reminder_list` — so the agent can manipulate the list without
 *    going through `read` / `edit` (which would surface a noisy diff
 *    in the TUI for what should be a tiny one-line operation).
 *
 * The file lives at `<vault>/.memory/reminders.md` by default (override the
 * root with AGENTS_TEAM_MEMORY_PATH, or the vault location with
 * AGENTS_TEAM_VAULT_PATH). The extension owns the format; the agent should
 * not `read` or `edit` it directly.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import {
	defineTool,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createBoxRenderer, surface as surfaceShared } from "../../lib/tui";

const REPO_ROOT = resolve(process.cwd());
const VAULT_ROOT = resolve(
	process.env.AGENTS_TEAM_VAULT_PATH ?? join(REPO_ROOT, "vault"),
);
const MEMORY_ROOT = resolve(
	process.env.AGENTS_TEAM_MEMORY_PATH ?? join(VAULT_ROOT, ".memory"),
);
const REMINDERS_PATH = join(MEMORY_ROOT, "reminders.md");

const INITIAL_TEMPLATE = `# Reminders

Open items the user has asked to be reminded about. Managed by the \`reminders\` extension (skill: \`reminders\`). Surfaced at every session start. Resolved items are deleted from the file — no history is kept, so the file size is bounded by the open list.

## Open

(empty)
`;

function today(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format an ISO date as a short relative age:
 *   same UTC day  → "today"
 *   1 day         → "1d"
 *   2-6 days      → "Nd"
 *   1-3 weeks     → "Nw"
 *   1-11 months   → "Nmo"
 *   >= 1 year     → "Ny"
 */
function relativeAge(dateStr: string): string {
	const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return "";
	const itemUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	const now = new Date();
	const todayUtc = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	const diffDays = Math.round((todayUtc - itemUtc) / 86400000);
	if (diffDays <= 0) return "today";
	if (diffDays === 1) return "1d";
	if (diffDays < 7) return `${diffDays}d`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
	return `${Math.floor(diffDays / 365)}y`;
}

async function ensureFile(): Promise<void> {
	if (existsSync(REMINDERS_PATH)) return;
	await mkdir(dirname(REMINDERS_PATH), { recursive: true });
	await writeFile(REMINDERS_PATH, INITIAL_TEMPLATE, "utf8");
}

/**
 * Serialize all reads and writes against REMINDERS_PATH.
 *
 * Without this, parallel tool calls (e.g. two `reminder_add` invocations
 * issued in the same agent message) race on the read-modify-write cycle:
 * both read the same starting state, both append one item to their own
 * in-memory copy, both write back — last writer wins, first item is lost.
 *
 * The mutex is in-process; that's sufficient because a single Pi runtime
 * owns the file. The chain swallows errors so one failure doesn't stall
 * subsequent operations.
 */
let fileOpChain: Promise<unknown> = Promise.resolve();

function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
	const next = fileOpChain.then(fn, fn);
	fileOpChain = next.catch(() => undefined);
	return next;
}

type Sections = {
	preamble: string[];
	open: string[];
	middle: string[];
	resolved: string[];
	suffix: string[];
};

function parseSections(md: string): Sections {
	const lines = md.split("\n");
	const out: Sections = {
		preamble: [],
		open: [],
		middle: [],
		resolved: [],
		suffix: [],
	};
	let mode: keyof Sections = "preamble";

	for (const line of lines) {
		if (/^##\s+Open\s*$/i.test(line)) {
			mode = "open";
			continue;
		}
		if (/^##\s+Resolved\s*$/i.test(line)) {
			mode = "resolved";
			continue;
		}
		if (mode === "open" && /^##\s+/.test(line)) mode = "middle";
		if (mode === "resolved" && /^##\s+/.test(line)) mode = "suffix";
		out[mode].push(line);
	}
	return out;
}

function isItemLine(line: string): boolean {
	return /^\s*-\s*\[/.test(line);
}

function serialize(s: Sections): string {
	// Emit only preamble + ## Open. Any pre-existing ## Resolved /
	// middle / suffix content is silently dropped — by design, this
	// extension keeps no history of completed items. The file size is
	// bounded by the size of the open list.
	const parts: string[] = [];
	parts.push(s.preamble.join("\n").replace(/\n+$/, ""));
	parts.push("");
	parts.push("## Open");
	parts.push("");
	const openItems = s.open.filter(isItemLine);
	if (openItems.length === 0) parts.push("(empty)");
	else for (const it of openItems) parts.push(it);
	parts.push("");
	return parts.join("\n");
}

type OpenItem = { text: string; date: string; age: string };

function parseOpenItems(md: string): OpenItem[] {
	const sections = parseSections(md);
	const items: OpenItem[] = [];
	for (const line of sections.open) {
		const withDate = line.match(
			/^\s*-\s*\[\s*\]\s*(\d{4}-\d{2}-\d{2})\s*—\s*(.+?)\s*$/,
		);
		if (withDate) {
			items.push({
				date: withDate[1],
				text: withDate[2],
				age: relativeAge(withDate[1]),
			});
			continue;
		}
		// Fallback: item without a parseable date prefix
		const noDate = line.match(/^\s*-\s*\[\s*\]\s*(.+?)\s*$/);
		if (noDate) items.push({ date: "", text: noDate[1], age: "" });
	}
	return items;
}

/**
 * Format open items into a compact numbered list with right-aligned ages.
 * The index shown here is also the argument to `/clear <N>`.
 *
 *   Open reminder (1):
 *     1. check cmem               [today]
 *
 *   Open reminders (3):
 *     1. check cmem               [today]
 *     2. follow up with Tom       [2d]
 *     3. verify YAML parser       [3w]
 *
 *   (≥ 10 items: index right-padded to 2 chars so the text column stays aligned)
 *     10. ...
 */
function formatOpenItems(items: OpenItem[]): string {
	const word = items.length === 1 ? "reminder" : "reminders";
	const header = `Open ${word} (${items.length}):`;
	if (items.length === 0) return header;
	const idxWidth = String(items.length).length;
	const maxText = Math.max(...items.map((it) => it.text.length));
	const gap = 4;
	const lines = items.map((it, i) => {
		const idx = String(i + 1).padStart(idxWidth);
		const padded = it.text.padEnd(maxText + gap);
		const age = it.age ? `[${it.age}]` : "";
		return `  ${idx}. ${padded}${age}`;
	});
	return [header, ...lines].join("\n");
}

const reminderAdd = defineTool({
	name: "reminder_add",
	label: "Add Reminder",
	description:
		'Add a new open reminder. Use whenever the user says "remind me X" / "don\'t let me forget Y" / "I need to remember to Z". Pass the user\'s verbatim wording as `text` — do not paraphrase. The reminder surfaces at every future session start until resolved via `reminder_resolve`.',
	parameters: Type.Object({
		text: Type.String({
			description:
				"Reminder text — the user's verbatim wording, no paraphrasing.",
		}),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const result = await withFileLock(async () => {
			try {
				await ensureFile();
				const md = await readFile(REMINDERS_PATH, { encoding: "utf8" });
				const sections = parseSections(md);
				sections.open.push(`- [ ] ${today()} — ${params.text}`);
				await writeFile(REMINDERS_PATH, serialize(sections), { encoding: "utf8" });
				return {
					content: [{ type: "text", text: `Added: ${params.text}` }],
					details: { text: params.text, date: today() },
				};
			} catch (e) {
				const message = (e as Error).message;
				return {
					content: [{ type: "text", text: `Failed to add reminder: ${message}` }],
					details: { error: message },
					isError: true,
				};
			}
		});
		await updateStatus(ctx);
		return result;
	},
});

const reminderResolve = defineTool({
	name: "reminder_resolve",
	label: "Resolve Reminder",
	description:
		'Mark an open reminder as resolved (deletes it — no history kept). Use whenever the user says "I did X" / "done with Y" / "resolved Z" / "mark X done". Matches by case-insensitive substring against open reminder text. If 0 or >1 items match, the tool returns an error explaining which — ask the user to clarify and retry with a more specific `match`.',
	parameters: Type.Object({
		match: Type.String({
			description:
				"Substring to match against open reminder text (case-insensitive). Must match exactly one open reminder.",
		}),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const result = await withFileLock(async () => {
			try {
				await ensureFile();
				const md = await readFile(REMINDERS_PATH, { encoding: "utf8" });
				const sections = parseSections(md);
				const openLines = sections.open.filter((l) =>
					/^\s*-\s*\[\s*\]/.test(l),
				);
				const needle = params.match.toLowerCase();
				const matches = openLines.filter((l) =>
					l.toLowerCase().includes(needle),
				);
				if (matches.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `No open reminder matches "${params.match}".`,
							},
						],
						details: { match: params.match, matchCount: 0 },
						isError: true,
					};
				}
				if (matches.length > 1) {
					const summary = matches.map((l) => "  " + l).join("\n");
					return {
						content: [
							{
								type: "text",
								text: `Multiple open reminders match "${params.match}":\n${summary}\nRetry with a more specific substring.`,
							},
						],
						details: { match: params.match, matchCount: matches.length, matches },
						isError: true,
					};
				}
				const matched = matches[0];
				sections.open = sections.open.filter((l) => l !== matched);
				await writeFile(REMINDERS_PATH, serialize(sections), { encoding: "utf8" });
				const itemText = matched
					.replace(/^\s*-\s*\[\s*\]\s*\d{4}-\d{2}-\d{2}\s*—\s*/, "")
					.trim();
				return {
					content: [{ type: "text", text: `Resolved: ${itemText}` }],
					details: { resolved: itemText, date: today() },
				};
			} catch (e) {
				const message = (e as Error).message;
				return {
					content: [{ type: "text", text: `Failed to resolve: ${message}` }],
					details: { error: message },
					isError: true,
				};
			}
		});
		await updateStatus(ctx);
		return result;
	},
});

const reminderList = defineTool({
	name: "reminder_list",
	label: "List Reminders",
	description:
		'List all open reminders. Use whenever the user asks "what are my reminders" / "show my todos" / "what\'s open". Returns a numbered list with each item\'s relative age, or "No open reminders." if none.',
	parameters: Type.Object({}),

	async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
		return withFileLock(async () => {
			try {
				if (!existsSync(REMINDERS_PATH)) {
					return { content: [{ type: "text", text: "No open reminders." }] };
				}
				const md = await readFile(REMINDERS_PATH, { encoding: "utf8" });
				const items = parseOpenItems(md);
				if (items.length === 0) {
					return { content: [{ type: "text", text: "No open reminders." }] };
				}
				const text = formatOpenItems(items);
				return {
					content: [{ type: "text", text }],
					details: { count: items.length, items },
				};
			} catch (e) {
				const message = (e as Error).message;
				return {
					content: [{ type: "text", text: `Failed to list: ${message}` }],
					details: { error: message },
					isError: true,
				};
			}
		});
	},
});

/**
 * Surface a status message in the TUI without spending an agent turn.
 * Forwards to the shared helper with `reminders` as the customType so
 * Pi routes through the box renderer we register below.
 */
function surface(pi: ExtensionAPI, text: string, details?: object): void {
	surfaceShared(pi, "reminders", text, details);
}

/**
 * Push the current open-reminder count into the footer statusline.
 * Called on session_start and after every mutation. Failures are
 * swallowed — a status-line update must never crash the agent.
 */
async function updateStatus(ctx: ExtensionContext): Promise<void> {
	try {
		let count = 0;
		if (existsSync(REMINDERS_PATH)) {
			const md = await readFile(REMINDERS_PATH, { encoding: "utf8" });
			count = parseOpenItems(md).length;
		}
		ctx.ui.setStatus("2rem", `| REM ${count}`);
	} catch {
		// best-effort
	}
}

export default function (pi: ExtensionAPI): void {
	pi.registerTool(reminderAdd);
	pi.registerTool(reminderResolve);
	pi.registerTool(reminderList);
	pi.registerMessageRenderer("reminders", createBoxRenderer());

	/**
	 * `/clear <N>` — delete reminder #N (1-indexed against the numbered list
	 * shown at session start or by `reminder_list`).
	 *
	 * Runs entirely inside the extension. Does NOT trigger an agent turn,
	 * does NOT invoke any LLM. The TUI confirmation is a custom message
	 * surfaced via our renderer.
	 */
	pi.registerCommand("clear", {
		description: "Clear reminder #N by index (e.g. /clear 2)",
		async getArgumentCompletions(prefix: string) {
			try {
				if (!existsSync(REMINDERS_PATH)) return [];
				const md = await readFile(REMINDERS_PATH, { encoding: "utf8" });
				const items = parseOpenItems(md);
				if (items.length === 0) return [];
				const trimmed = prefix.trim();
				return items
					.map((it, i) => {
						const n = String(i + 1);
						return {
							value: n,
							label: n,
							description: it.age ? `${it.text}  (${it.age})` : it.text,
						};
					})
					.filter((c) => trimmed === "" || c.value.startsWith(trimmed));
			} catch {
				return [];
			}
		},

		async handler(args, ctx) {
			const trimmed = args.trim();
			if (trimmed === "") {
				surface(pi, "Usage: /clear <N>  — N is the index shown in the list.");
				return;
			}
			const n = Number(trimmed);
			if (!Number.isInteger(n) || n <= 0) {
				surface(pi, `Invalid index "${trimmed}". Pass a positive integer (e.g. /clear 2).`);
				return;
			}

			await withFileLock(async () => {
				try {
					await ensureFile();
					const md = await readFile(REMINDERS_PATH, { encoding: "utf8" });
					const sections = parseSections(md);
					const openLines = sections.open.filter(isItemLine);
					if (openLines.length === 0) {
						surface(pi, "No open reminders.");
						return;
					}
					if (n > openLines.length) {
						surface(
							pi,
							`No reminder #${n}. You have ${openLines.length} open ${
								openLines.length === 1 ? "reminder" : "reminders"
							}.`,
						);
						return;
					}

					const target = openLines[n - 1];
					const itemText = target
						.replace(/^\s*-\s*\[\s*\]\s*\d{4}-\d{2}-\d{2}\s*—\s*/, "")
						.replace(/^\s*-\s*\[\s*\]\s*/, "")
						.trim();

					// Filter the matched line out of the open section.
					let dropped = false;
					sections.open = sections.open.filter((l) => {
						if (!dropped && l === target) {
							dropped = true;
							return false;
						}
						return true;
					});
					await writeFile(REMINDERS_PATH, serialize(sections), { encoding: "utf8" });

					// Confirm + show updated list (or "No open reminders." if empty).
					const remaining = parseOpenItems(await readFile(REMINDERS_PATH, { encoding: "utf8" }));
					const updated =
						remaining.length === 0
							? "No open reminders."
							: formatOpenItems(remaining);
					surface(pi, `Cleared #${n}: ${itemText}\n\n${updated}`, {
						cleared: { index: n, text: itemText },
						remaining: remaining.length,
					});
				} catch (e) {
					const message = (e as Error).message;
					surface(pi, `Failed to clear: ${message}`);
				}
			});
			await updateStatus(ctx);
		},
	});

	pi.on("session_start", async (event, ctx) => {
		// Pi clears the extension-status map on every session_start, so the
		// REM cell must be re-published on every reason (startup/resume/new/
		// reload/fork) or it disappears from the footer after /new or /reload.
		await updateStatus(ctx);

		// The surface toast, by contrast, should only appear on real launches
		// and resumes — not internal reload events, forks, or
		// new-session-during-existing-pi.
		if (event.reason !== "startup" && event.reason !== "resume") return;
		if (!existsSync(REMINDERS_PATH)) return;

		try {
			const md = await readFile(REMINDERS_PATH, { encoding: "utf8" });
			const items = parseOpenItems(md);
			if (items.length === 0) return;

			const text = formatOpenItems(items);
			surface(pi, text, { count: items.length, items });
		} catch {
			// Read or parse failure must not crash session startup.
		}
	});
}
