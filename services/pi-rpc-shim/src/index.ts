/**
 * pi-rpc-shim — OpenAI-compatible HTTP wrapper around Pi's RPC client.
 *
 * Plug into LibreChat (or any OpenAI-compat chat UI) to drive the Pi coding
 * agent from a browser. Each LibreChat conversation maps to a persistent Pi
 * RpcClient instance; idle clients are reaped after 30 minutes.
 *
 * Endpoints:
 *   POST /v1/chat/completions   OpenAI Chat Completions (streaming + non-streaming)
 *   GET  /v1/models              advertise the "pi-distributor" model
 *   GET  /health                 process status
 *
 * Configure via env vars:
 *   PI_RPC_SHIM_PORT          default 9090
 *   PI_RPC_SHIM_HOST          default 127.0.0.1 (bind localhost only)
 *   AGENTS_TEAM_ROOT          default process.cwd() — Pi inherits this as its cwd
 *   PI_RPC_SHIM_IDLE_MIN      default 30 — minutes before idle session is reaped
 */

import express from "express";
import type { Request, Response } from "express";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// Resolve the locally-installed Pi CLI so RpcClient doesn't try to find it
// relative to its cwd (which is the agents-team project, not Pi's package).
// The package's exports map only exposes "." (ESM import condition), so we
// use import.meta.resolve to honor that, then derive the CLI path from the
// resolved main entry's directory.
const PI_MAIN_URL = import.meta.resolve("@earendil-works/pi-coding-agent");
const PI_CLI_PATH = resolve(fileURLToPath(PI_MAIN_URL), "..", "cli.js");

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const PORT = Number(process.env.PI_RPC_SHIM_PORT ?? 9090);
const HOST = process.env.PI_RPC_SHIM_HOST ?? "127.0.0.1";
const PROJECT_ROOT = resolve(process.env.AGENTS_TEAM_ROOT ?? process.cwd());
const SESSION_IDLE_MS = Number(process.env.PI_RPC_SHIM_IDLE_MIN ?? 30) * 60 * 1000;
const PROMPT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per prompt

// -----------------------------------------------------------------------------
// Pi session manager — one RpcClient per LibreChat conversation_id
// -----------------------------------------------------------------------------

interface PiSession {
	client: RpcClient;
	lastUsed: number;
}

const sessions = new Map<string, PiSession>();

async function getOrCreateSession(conversationId: string): Promise<RpcClient> {
	const existing = sessions.get(conversationId);
	if (existing) {
		existing.lastUsed = Date.now();
		return existing.client;
	}
	const client = new RpcClient({ cwd: PROJECT_ROOT, cliPath: PI_CLI_PATH });
	await client.start();
	sessions.set(conversationId, { client, lastUsed: Date.now() });
	console.log(`[session] started ${conversationId} (total: ${sessions.size})`);
	return client;
}

async function reapIdleSessions(): Promise<void> {
	const now = Date.now();
	for (const [id, session] of sessions) {
		if (now - session.lastUsed > SESSION_IDLE_MS) {
			try {
				await session.client.stop();
			} catch (e) {
				console.error(`[session] failed to stop ${id}:`, (e as Error).message);
			}
			sessions.delete(id);
			console.log(`[session] reaped idle ${id} (remaining: ${sessions.size})`);
		}
	}
}
setInterval(reapIdleSessions, 5 * 60 * 1000).unref();

// -----------------------------------------------------------------------------
// Pi event → OpenAI SSE chunk translation
// -----------------------------------------------------------------------------

/**
 * Pi emits various AgentEvent types; this maps them to incremental text deltas
 * for OpenAI-compat streaming. Tool calls become italic markdown placeholders;
 * the user can see what's happening without raw event dumps.
 */
function eventToDelta(event: any): string | null {
	if (!event || typeof event !== "object") return null;

	// Pi nests assistant text inside event.assistantMessageEvent.
	// Relevant sub-types:
	//   "text_delta"      → incremental text chunk in `.delta`
	//   "text_start"      → first chunk start; `.delta` may be present
	//   "tool_use_start"  → tool call beginning (when surfaced this way)
	if (event.type === "message_update") {
		const inner = event.assistantMessageEvent;
		if (!inner || typeof inner !== "object") return null;
		if (inner.type === "text_delta" && typeof inner.delta === "string") {
			return inner.delta;
		}
		// text_start sometimes carries the initial chunk too — include if delta is set.
		if (inner.type === "text_start" && typeof inner.delta === "string" && inner.delta.length > 0) {
			return inner.delta;
		}
		return null;
	}

	switch (event.type) {
		case "tool_execution_start": {
			const name = event.toolName ?? event.tool ?? "tool";
			const argsHint = formatToolArgsBrief(event.args ?? event.input);
			return `\n\n_⚙ ${name}${argsHint ? ` ${argsHint}` : ""}_\n\n`;
		}
		case "tool_execution_end": {
			if (event.error || event.isError) {
				return `\n_⚠ tool error: ${event.error ?? "unknown"}_\n\n`;
			}
			return null;
		}
		default:
			return null;
	}
}

function formatToolArgsBrief(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const a = args as Record<string, unknown>;
	if (typeof a.command === "string") return `\`${truncate(a.command, 60)}\``;
	if (typeof a.path === "string") return `\`${truncate(a.path, 60)}\``;
	if (typeof a.file_path === "string") return `\`${truncate(a.file_path, 60)}\``;
	if (typeof a.agent === "string") return `→ ${a.agent}`;
	if (typeof a.title === "string") return `"${truncate(a.title, 40)}"`;
	return "";
}

function truncate(s: string, n: number): string {
	return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// -----------------------------------------------------------------------------
// SSE / OpenAI completion-chunk emission
// -----------------------------------------------------------------------------

function sseDelta(model: string, content: string, id: string): string {
	const payload = {
		id,
		object: "chat.completion.chunk",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [{ index: 0, delta: { content }, finish_reason: null }],
	};
	return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseDone(model: string, id: string): string {
	const payload = {
		id,
		object: "chat.completion.chunk",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
	};
	return `data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`;
}

// -----------------------------------------------------------------------------
// HTTP handlers
// -----------------------------------------------------------------------------

interface OpenAIChatMessage {
	role: "system" | "user" | "assistant";
	content: string | Array<{ type: string; text?: string }>;
}

interface ChatCompletionRequest {
	model?: string;
	messages?: OpenAIChatMessage[];
	stream?: boolean;
	user?: string;
	conversation_id?: string;
}

function extractTextContent(content: OpenAIChatMessage["content"]): string {
	if (typeof content === "string") return content;
	return content
		.map((p) => (typeof p === "object" && p !== null && typeof p.text === "string" ? p.text : ""))
		.filter(Boolean)
		.join("\n");
}

function pickConversationId(req: Request, body: ChatCompletionRequest): string {
	// LibreChat's exact field is yet to be confirmed live; check several plausible
	// places. Falls back to a fresh UUID (stateless behaviour, undesirable but safe).
	return (
		(req.headers["x-conversation-id"] as string | undefined) ??
		(req.headers["x-librechat-conversation-id"] as string | undefined) ??
		body.conversation_id ??
		body.user ??
		randomUUID()
	);
}

async function handleChatCompletions(req: Request, res: Response): Promise<void> {
	const body = (req.body ?? {}) as ChatCompletionRequest;
	const messages = body.messages ?? [];
	const lastUser = [...messages].reverse().find((m) => m.role === "user");
	if (!lastUser) {
		res.status(400).json({ error: { message: "No user message in request" } });
		return;
	}

	const text = extractTextContent(lastUser.content);
	const conversationId = pickConversationId(req, body);
	const responseId = `chatcmpl-${randomUUID()}`;
	const model = body.model ?? "pi-distributor";

	let client: RpcClient;
	try {
		client = await getOrCreateSession(conversationId);
	} catch (e) {
		res.status(500).json({ error: { message: `Failed to start Pi session: ${(e as Error).message}` } });
		return;
	}

	const isStream = body.stream === true;

	if (isStream) {
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("X-Accel-Buffering", "no"); // disable proxy buffering
		res.flushHeaders();

		const unsubscribe = client.onEvent((event) => {
			const delta = eventToDelta(event);
			if (delta) {
				res.write(sseDelta(model, delta, responseId));
			}
		});

		try {
			await client.prompt(text);
			await client.waitForIdle(PROMPT_TIMEOUT_MS);
		} catch (e) {
			res.write(sseDelta(model, `\n\n[Error: ${(e as Error).message}]`, responseId));
		} finally {
			unsubscribe();
			res.write(sseDone(model, responseId));
			res.end();
		}
		return;
	}

	// Non-streaming: collect deltas, return one shot
	let collected = "";
	const unsubscribe = client.onEvent((event) => {
		const delta = eventToDelta(event);
		if (delta) collected += delta;
	});

	try {
		await client.prompt(text);
		await client.waitForIdle(PROMPT_TIMEOUT_MS);
	} catch (e) {
		collected += `\n\n[Error: ${(e as Error).message}]`;
	} finally {
		unsubscribe();
	}

	res.json({
		id: responseId,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [
			{
				index: 0,
				message: { role: "assistant", content: collected },
				finish_reason: "stop",
			},
		],
		usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
	});
}

// -----------------------------------------------------------------------------
// App / lifecycle
// -----------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
	res.json({ ok: true, sessions: sessions.size, project_root: PROJECT_ROOT });
});

app.get("/v1/models", (_req, res) => {
	res.json({
		object: "list",
		data: [
			{
				id: "pi-distributor",
				object: "model",
				created: 0,
				owned_by: "pi",
			},
		],
	});
});

app.post("/v1/chat/completions", (req, res) => {
	handleChatCompletions(req, res).catch((e) => {
		console.error("[handler] unexpected error:", e);
		if (!res.headersSent) {
			res.status(500).json({ error: { message: (e as Error).message } });
		}
	});
});

const server = app.listen(PORT, HOST, () => {
	console.log(`pi-rpc-shim listening on http://${HOST}:${PORT}`);
	console.log(`  POST /v1/chat/completions   OpenAI-compat endpoint`);
	console.log(`  GET  /v1/models              available models`);
	console.log(`  GET  /health                 status`);
	console.log(`  PROJECT_ROOT=${PROJECT_ROOT}`);
});

async function shutdown(signal: string): Promise<void> {
	console.log(`\nreceived ${signal}, shutting down…`);
	server.close();
	for (const [id, session] of sessions) {
		try {
			await session.client.stop();
			console.log(`  stopped ${id}`);
		} catch (e) {
			console.error(`  failed to stop ${id}:`, (e as Error).message);
		}
	}
	process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
