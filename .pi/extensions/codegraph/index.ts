/**
 * codegraph — wrap @colbymchenry/codegraph CLI as native Pi tools.
 *
 * Pi v0.76 has no MCP support, so the codegraph_* MCP tools available in
 * Claude Code are invisible to a Pi subagent. This extension closes that gap
 * by shelling out to the `codegraph` binary with `cwd: ctx.cwd`, so each
 * spawned subagent's tools target the project the subagent is actually
 * working in — not the parent Pi session's cwd.
 *
 * Auto-inits `.codegraph/` on first call when missing (cached per cwd for
 * the process lifetime, so we only check once). The engineer's prompt may
 * still mention the explicit `codegraph init -i` guard, but it's no longer
 * load-bearing — the extension handles it transparently.
 *
 * Tools registered (one per CLI subcommand useful to an engineer):
 *   codegraph_search    — find symbols by name (CLI: query)
 *   codegraph_context   — build markdown context for a task (CLI: context)
 *   codegraph_callers   — who calls X
 *   codegraph_callees   — what does X call
 *   codegraph_impact    — what changes if X changes
 *   codegraph_files     — project file structure from the index
 *   codegraph_status    — index health + stats
 *   codegraph_affected  — test files affected by changed source files
 *
 * NOT wrapped: init/sync/index/uninit (admin), serve (MCP daemon), unlock
 * (rare), install/uninstall (cross-agent admin). The auto-init above covers
 * the only init the agent needs.
 *
 * NOT wrapped (yet): trace, node, explore — these exist only in the MCP
 * surface, not the CLI. Adding them would require speaking JSON-RPC to a
 * `codegraph serve --mcp` subprocess; left as a follow-up.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Cache of cwds where we've already confirmed `.codegraph/` exists (or just
// initialized it). One Pi process == one cache. Avoids repeated existsSync
// checks per tool call.
const initializedCwds = new Set<string>();

interface RunResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

function runCodegraph(args: string[], cwd: string, signal: AbortSignal | undefined): Promise<RunResult> {
	return new Promise((resolveRun) => {
		const proc = spawn("codegraph", args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		proc.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		proc.on("close", (code) => {
			resolveRun({ exitCode: code ?? 0, stdout, stderr });
		});
		proc.on("error", (err) => {
			resolveRun({ exitCode: 127, stdout: "", stderr: (err as Error).message });
		});
		if (signal) {
			const onAbort = () => {
				proc.kill("SIGTERM");
				setTimeout(() => {
					if (!proc.killed) proc.kill("SIGKILL");
				}, 2000);
			};
			if (signal.aborted) onAbort();
			else signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}

async function ensureInitialized(cwd: string, signal: AbortSignal | undefined): Promise<string | null> {
	const abs = resolve(cwd);
	if (initializedCwds.has(abs)) return null;
	if (existsSync(resolve(abs, ".codegraph"))) {
		initializedCwds.add(abs);
		return null;
	}
	const r = await runCodegraph(["init", "-i"], abs, signal);
	if (r.exitCode !== 0) {
		return `codegraph init failed (exit ${r.exitCode}): ${r.stderr || r.stdout || "(no output)"}`;
	}
	initializedCwds.add(abs);
	return null;
}

function errorResult(text: string) {
	return {
		content: [{ type: "text" as const, text }],
		isError: true,
	};
}

function tryParseJson(s: string): unknown | undefined {
	try {
		return JSON.parse(s);
	} catch {
		return undefined;
	}
}

function previewText(s: string, max = 200): string {
	const trimmed = s.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max)}…`;
}

/**
 * Shared runner: ensure init, run the subcommand, parse JSON if requested,
 * return a normalized result. `humanArgs` is the CLI tail used for both the
 * actual spawn and the error/preview messages.
 */
async function runTool(
	subcommand: string,
	humanArgs: string[],
	cwd: string,
	signal: AbortSignal | undefined,
	jsonOutput: boolean,
) {
	const initErr = await ensureInitialized(cwd, signal);
	if (initErr) return errorResult(initErr);

	const r = await runCodegraph([subcommand, ...humanArgs], cwd, signal);
	if (r.exitCode !== 0) {
		return errorResult(
			`codegraph ${subcommand} failed (exit ${r.exitCode}): ${r.stderr || r.stdout || "(no output)"}`,
		);
	}

	const out = r.stdout.trim() || "(no output)";
	const details: Record<string, unknown> = {
		subcommand,
		cwd,
		args: humanArgs,
	};
	if (jsonOutput) {
		const parsed = tryParseJson(r.stdout);
		if (parsed !== undefined) details.parsed = parsed;
	}
	return {
		content: [{ type: "text" as const, text: out }],
		details,
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Tools

const codegraphSearch = defineTool({
	name: "codegraph_search",
	label: "codegraph search",
	description:
		"Find symbols by name in the project's code graph. Use for 'where is X defined?' / 'find symbol named X'. Returns matches with file path, line, kind, signature. Faster than grep for symbol lookups — sub-millisecond DB read against a tree-sitter AST index.",
	parameters: Type.Object({
		query: Type.String({ description: "Symbol name or partial name to search for (e.g. 'parseFrontmatter', 'auth')" }),
		limit: Type.Optional(Type.Number({ description: "Max results (default 10)", default: 10 })),
		kind: Type.Optional(
			Type.String({ description: "Filter by node kind: function, class, interface, type_alias, constant, etc." }),
		),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const args = [params.query, "-j"];
		if (params.limit !== undefined) args.push("--limit", String(params.limit));
		if (params.kind) args.push("--kind", params.kind);
		return runTool("query", args, ctx.cwd, signal, true);
	},
});

const codegraphContext = defineTool({
	name: "codegraph_context",
	label: "codegraph context",
	description:
		"Build focused context for a task — composes search + node + callers + callees in one call. Best PRIMARY tool when starting work on an unfamiliar area: 'how does X work', 'what's the deal with this feature'. Returns markdown by default.",
	parameters: Type.Object({
		task: Type.String({ description: "Task or topic description (e.g. 'how does the engineer subagent spawn flow work')" }),
		max_nodes: Type.Optional(Type.Number({ description: "Maximum nodes to include (default 50)", default: 50 })),
		max_code: Type.Optional(Type.Number({ description: "Maximum code blocks (default 10)", default: 10 })),
		json: Type.Optional(Type.Boolean({ description: "Return JSON instead of markdown", default: false })),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const args = [params.task];
		if (params.max_nodes !== undefined) args.push("--max-nodes", String(params.max_nodes));
		if (params.max_code !== undefined) args.push("--max-code", String(params.max_code));
		if (params.json) args.push("--format", "json");
		return runTool("context", args, ctx.cwd, signal, params.json === true);
	},
});

const codegraphCallers = defineTool({
	name: "codegraph_callers",
	label: "codegraph callers",
	description:
		"Find every function/method that calls a specific symbol. Use for 'what calls Y?' or 'where is this used?'. Trust the result — it's from a full AST parse; don't re-verify with grep.",
	parameters: Type.Object({
		symbol: Type.String({ description: "Symbol name (e.g. 'authenticateUser')" }),
		limit: Type.Optional(Type.Number({ description: "Max results (default 20)", default: 20 })),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const args = [params.symbol, "-j"];
		if (params.limit !== undefined) args.push("--limit", String(params.limit));
		return runTool("callers", args, ctx.cwd, signal, true);
	},
});

const codegraphCallees = defineTool({
	name: "codegraph_callees",
	label: "codegraph callees",
	description: "Find every function/method that a specific symbol calls. Use for 'what does Y call?' or 'what does this depend on?'.",
	parameters: Type.Object({
		symbol: Type.String({ description: "Symbol name (e.g. 'handleRequest')" }),
		limit: Type.Optional(Type.Number({ description: "Max results (default 20)", default: 20 })),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const args = [params.symbol, "-j"];
		if (params.limit !== undefined) args.push("--limit", String(params.limit));
		return runTool("callees", args, ctx.cwd, signal, true);
	},
});

const codegraphImpact = defineTool({
	name: "codegraph_impact",
	label: "codegraph impact",
	description:
		"Analyze the blast radius of changing a symbol — what code is affected if I modify this. Use BEFORE non-trivial edits to plan scope; pair with codegraph_callers when you need the explicit reverse-call list.",
	parameters: Type.Object({
		symbol: Type.String({ description: "Symbol name being changed (e.g. 'SessionStore')" }),
		depth: Type.Optional(Type.Number({ description: "Traversal depth (default 2)", default: 2 })),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const args = [params.symbol, "-j"];
		if (params.depth !== undefined) args.push("--depth", String(params.depth));
		return runTool("impact", args, ctx.cwd, signal, true);
	},
});

const codegraphFiles = defineTool({
	name: "codegraph_files",
	label: "codegraph files",
	description:
		"List project file structure from the index. Use for 'what files exist under path X' or surveying an area. Faster than ls + recursive find because it returns only indexed source files with metadata (language, symbol count).",
	parameters: Type.Object({
		filter: Type.Optional(Type.String({ description: "Filter to files under this directory (e.g. 'src/api')" })),
		pattern: Type.Optional(Type.String({ description: "Filter files matching this glob (e.g. '**/*.tsx')" })),
		format: Type.Optional(
			Type.String({ description: "Output format: tree (default), flat, grouped", default: "tree" }),
		),
		max_depth: Type.Optional(Type.Number({ description: "Maximum directory depth for tree format" })),
		json: Type.Optional(Type.Boolean({ description: "Return JSON instead of formatted output", default: false })),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const args: string[] = [];
		if (params.filter) args.push("--filter", params.filter);
		if (params.pattern) args.push("--pattern", params.pattern);
		if (params.format) args.push("--format", params.format);
		if (params.max_depth !== undefined) args.push("--max-depth", String(params.max_depth));
		if (params.json) args.push("-j");
		return runTool("files", args, ctx.cwd, signal, params.json === true);
	},
});

const codegraphStatus = defineTool({
	name: "codegraph_status",
	label: "codegraph status",
	description:
		"Show index health + statistics: file/node/edge counts, languages, pending changes. Use to verify the index is ready before relying on other codegraph_* calls.",
	parameters: Type.Object({
		json: Type.Optional(Type.Boolean({ description: "Return JSON instead of formatted output", default: true })),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const wantsJson = params.json !== false;
		const args = wantsJson ? ["-j"] : [];
		return runTool("status", args, ctx.cwd, signal, wantsJson);
	},
});

const codegraphAffected = defineTool({
	name: "codegraph_affected",
	label: "codegraph affected",
	description:
		"Find test files affected by changes to a set of source files. Use after editing to know which tests to run — cheaper than running the whole suite.",
	parameters: Type.Object({
		files: Type.Array(Type.String(), { description: "Source file paths that changed (project-relative or absolute)" }),
		json: Type.Optional(Type.Boolean({ description: "Return JSON", default: false })),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const args: string[] = [...params.files];
		if (params.json) args.push("-j");
		return runTool("affected", args, ctx.cwd, signal, params.json === true);
	},
});

export default function (pi: ExtensionAPI): void {
	pi.registerTool(codegraphSearch);
	pi.registerTool(codegraphContext);
	pi.registerTool(codegraphCallers);
	pi.registerTool(codegraphCallees);
	pi.registerTool(codegraphImpact);
	pi.registerTool(codegraphFiles);
	pi.registerTool(codegraphStatus);
	pi.registerTool(codegraphAffected);
}
