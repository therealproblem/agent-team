/**
 * trade-journal — read-side accessor for the Trader agent's journal corpus.
 *
 * Writing trades happens via `note-taker` (which goes through `obsidian-vault`).
 * This extension reads those notes back out so the `pattern-watch` skill can
 * scan the corpus efficiently without re-parsing markdown each time.
 *
 * Configure vault path via environment variable AGENTS_TEAM_VAULT_PATH.
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Default: project-root `vault/`. Override with AGENTS_TEAM_VAULT_PATH.
const VAULT_ROOT = resolve(
	process.env.AGENTS_TEAM_VAULT_PATH ?? join(process.cwd(), "vault"),
);
const TRADES_ROOT = join(VAULT_ROOT, "trades");

interface TradeSummary {
	path: string;
	date: string;
	symbol: string;
	direction?: "long" | "short";
	result?: number;
	result_R?: number;
}

function parseFrontmatter(md: string): Record<string, string> {
	const m = md.match(/^---\n([\s\S]*?)\n---/);
	if (!m) return {};
	const out: Record<string, string> = {};
	for (const line of m[1].split("\n")) {
		const kv = line.match(/^(\w+):\s*(.+)$/);
		if (kv) out[kv[1]] = kv[2].replace(/^"|"$/g, "");
	}
	return out;
}

const listTrades = defineTool({
	name: "list_trades",
	label: "List Trade Journal Entries",
	description: "List trade journal entries within an optional date range. Most-recent first.",
	parameters: Type.Object({
		since: Type.Optional(Type.String({ description: "ISO date (inclusive)." })),
		until: Type.Optional(Type.String({ description: "ISO date (inclusive)." })),
		symbol: Type.Optional(Type.String()),
		limit: Type.Optional(Type.Number()),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		if (!existsSync(TRADES_ROOT)) {
			return {
				content: [{ type: "text", text: `No trades directory yet at ${TRADES_ROOT}.` }],
				details: { items: [] as TradeSummary[] },
			};
		}
		const items: TradeSummary[] = [];
		async function walk(dir: string) {
			const entries = await readdir(dir, { withFileTypes: true });
			for (const e of entries) {
				const p = join(dir, e.name);
				if (e.isDirectory()) await walk(p);
				else if (e.isFile() && e.name.endsWith(".md")) {
					try {
						const buf = await readFile(p, "utf8");
						const fm = parseFrontmatter(buf);
						items.push({
							path: p,
							date: fm.date ?? e.name.slice(0, 10),
							symbol: fm.symbol ?? "",
							direction: fm.direction as "long" | "short" | undefined,
							result: fm.result ? Number(fm.result) : undefined,
							result_R: fm.result_R ? Number(fm.result_R) : undefined,
						});
					} catch {
						/* skip unreadable */
					}
				}
			}
		}
		await walk(TRADES_ROOT);

		let filtered = items;
		if (params.since) filtered = filtered.filter((t) => t.date >= (params.since as string));
		if (params.until) filtered = filtered.filter((t) => t.date <= (params.until as string));
		if (params.symbol) filtered = filtered.filter((t) => t.symbol === params.symbol);
		filtered.sort((a, b) => (a.date < b.date ? 1 : -1));
		if (params.limit) filtered = filtered.slice(0, params.limit);

		const lines = [`Listed ${filtered.length} trade(s).`, ""];
		for (const t of filtered) {
			const summary = [
				t.date,
				t.symbol,
				t.direction ?? "",
				t.result_R != null ? `${t.result_R}R` : "",
				t.result != null ? `(${t.result})` : "",
			]
				.filter(Boolean)
				.join(" ");
			lines.push(`- ${summary}  →  ${t.path}`);
		}
		return {
			content: [{ type: "text", text: lines.join("\n") }],
			details: { items: filtered },
		};
	},
});

const readTrade = defineTool({
	name: "read_trade",
	label: "Read Trade Entry",
	description: "Read the full markdown body of a trade journal entry by path.",
	parameters: Type.Object({
		path: Type.String(),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		try {
			const buf = await readFile(params.path, "utf8");
			return {
				content: [{ type: "text", text: buf }],
				details: { path: params.path, content: buf },
			};
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [{ type: "text", text: `Failed to read: ${message}` }],
				details: { error: message },
				isError: true,
			};
		}
	},
});

export default function (pi: ExtensionAPI): void {
	pi.registerTool(listTrades);
	pi.registerTool(readTrade);
}
