/**
 * driver — bridges Telegram updates into the running pi session.
 *
 * Responsibilities:
 *   - Inject Telegram messages as user turns via `pi.sendUserMessage(..., { deliverAs: "followUp" })`.
 *   - Buffer non-triggering messages ("ingest") and flush them as prefix on the
 *     next invoke. (Pi's `sendUserMessage` always triggers a turn, so true
 *     "context-only" injection isn't an API option — we hold the buffer in
 *     extension memory and prepend it on the next invoke.)
 *   - Match each agent loop back to the Telegram invoke that triggered it by
 *     watching `before_agent_start.prompt` for a chat-id sigil we embed in the
 *     prompt, then route the final assistant message back to the originating
 *     chat on `agent_end`.
 *   - Maintain a per-chat typing-indicator heartbeat while an invoke is in
 *     flight.
 *   - Handle /stop via `ctx.abort()`, with cross-chat-aware cancel acks.
 *   - Attach inline keyboards (persona switcher, artifact actions) to outbound
 *     replies, then handle button taps as synthetic invokes.
 *
 * The "queue" is implicit: pi serializes calls to `sendUserMessage` with
 * `deliverAs: "followUp"` internally. We track our in-flight invokes as a
 * pending list keyed by chat-id sigil; before_agent_start lets us claim the
 * loop, agent_end lets us route the reply.
 */

import { spawn } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { api, type InlineKeyboardMarkup, type TelegramUpdate } from "./api";
import type { Decision, Persona } from "./dispatcher";
import { PERSONAS } from "./dispatcher";
import { loadChatState, saveChatState } from "./state";

// ---------- module-level state ----------

let latestCtx: ExtensionContext | undefined;

/**
 * Save the most recent ExtensionContext. session_start handlers call this on
 * every reason ("startup", "reload", "new", etc.) so the driver always has a
 * fresh handle for `ctx.abort()` / `ctx.isIdle()`.
 */
export function setCtx(ctx: ExtensionContext): void {
	latestCtx = ctx;
}

/**
 * Tear down all module-level state. Called from session_shutdown so the
 * dying module doesn't leak a typing-indicator setInterval (which would
 * keep firing `sendChatAction("typing")` against orphaned chat ids forever)
 * or strand pending invokes that pi has already discarded.
 */
export function shutdown(): void {
	stopTypingIndicator();
	pendingInvokes.length = 0;
	currentInvoke = undefined;
	steeringBuffer.length = 0;
	latestCtx = undefined;
}

interface SteeringEntry {
	chatId: number;
	chatTitle: string;
	fromUsername: string;
	line: string;
	ts: number;
}

// One global buffer. Mirrors the shared-pi-session decision: all chats funnel
// into one conversation, so steering messages from any chat enter context as
// part of the next triggered turn (regardless of which chat triggered it).
const steeringBuffer: SteeringEntry[] = [];

interface PendingInvoke {
	chatId: number;
	chatTitle: string;
	fromUsername: string;
	persona: Persona;
	replyToMessageId: number;
	enqueuedAt: number;
}

// Invokes we've called sendUserMessage for but haven't yet seen the matching
// before_agent_start. FIFO: pi drains deliverAs:"followUp" in submission order,
// so we claim the head when an agent loop starts with the Telegram prefix.
const pendingInvokes: PendingInvoke[] = [];

let currentInvoke: PendingInvoke | undefined;
let typingTimer: ReturnType<typeof setInterval> | undefined;

const TYPING_INTERVAL_MS = 4_000;

// Prefix every Telegram-injected turn with this sentinel so the
// before_agent_start handler can distinguish our turns from user-typed input
// in the TUI. Kept short and natural-language so it reads cleanly when the
// agent quotes it.
export const TG_PREFIX = "[From Telegram @";

function renderHeader(fromUsername: string): string {
	return `${TG_PREFIX}${fromUsername}]`;
}

function renderSteeringPrefix(drain: SteeringEntry[]): string {
	if (drain.length === 0) return "";
	const lines = drain.map((e) => `${renderHeader(e.fromUsername)} ${e.line}`);
	return `${lines.join("\n")}\n`;
}

// ---------- ingest ----------

export async function handleIngest(d: Decision & { kind: "ingest" }): Promise<void> {
	steeringBuffer.push({
		chatId: d.chatId,
		chatTitle: d.chatTitle,
		fromUsername: d.fromUsername,
		line: d.line,
		ts: Date.now(),
	});

	// Update per-chat metadata so the dispatcher can later look up
	// lastAssistantPersona on reply-to-bot detection.
	const state = loadChatState(d.chatId, d.chatTitle);
	state.chatTitle = d.chatTitle;
	state.lastActivityAt = new Date().toISOString();
	saveChatState(state);
}

// ---------- invoke ----------

export async function handleInvoke(
	d: Decision & { kind: "invoke" },
	pi: ExtensionAPI,
): Promise<void> {
	const now = Date.now();
	const drained = steeringBuffer.splice(0, steeringBuffer.length);

	const prefix = renderSteeringPrefix(drained);
	const header = renderHeader(d.fromUsername);
	const prompt = `${prefix}${header} ${d.line}`;

	const pending: PendingInvoke = {
		chatId: d.chatId,
		chatTitle: d.chatTitle,
		fromUsername: d.fromUsername,
		persona: d.persona,
		replyToMessageId: d.replyToMessageId,
		enqueuedAt: now,
	};
	pendingInvokes.push(pending);

	// Update per-chat state.
	const state = loadChatState(d.chatId, d.chatTitle);
	state.chatTitle = d.chatTitle;
	state.lastActivityAt = new Date().toISOString();
	saveChatState(state);

	// Send to pi. `deliverAs: "followUp"` queues if pi is mid-stream.
	pi.sendUserMessage(prompt, { deliverAs: "followUp" });

	// Start typing indicator for this chat. The heartbeat continues until
	// agent_end clears `currentInvoke`. If we're not yet the current invoke
	// (queued behind another), the heartbeat still helps signal "we received
	// your message and pi is busy."
	ensureTypingIndicator();
}

// ---------- stop ----------

export async function handleStop(d: Decision & { kind: "stop" }): Promise<void> {
	const ctx = latestCtx;
	const idle = ctx?.isIdle() !== false; // treat unknown ctx as not-idle to be safe

	if (idle && !currentInvoke && pendingInvokes.length === 0) {
		await safeSend(d.chatId, "(nothing in flight)", { replyToMessageId: d.replyToMessageId });
		return;
	}

	const inFlight = currentInvoke ?? pendingInvokes[0];

	// Build the cancel acks. If the stopper is in the same chat as the
	// originator, fold both into one message.
	if (inFlight) {
		const sameChat = inFlight.chatId === d.chatId;
		if (sameChat) {
			await safeSend(
				d.chatId,
				`(cancelled — was working on a request from @${inFlight.fromUsername})`,
				{ replyToMessageId: d.replyToMessageId },
			);
		} else {
			await safeSend(
				inFlight.chatId,
				`(cancelled by @${d.fromUsername} in "${d.chatTitle}")`,
			);
			await safeSend(
				d.chatId,
				`(stopped pi — was working on a request from @${inFlight.fromUsername} in "${inFlight.chatTitle}")`,
				{ replyToMessageId: d.replyToMessageId },
			);
		}
	}

	// Drop the in-flight from our tracking BEFORE calling abort, so the
	// agent_end fired by the abort doesn't try to route a stale reply.
	if (currentInvoke) {
		currentInvoke = undefined;
	} else {
		pendingInvokes.shift();
	}

	stopTypingIndicator();

	// Pull the trigger.
	try {
		ctx?.abort();
	} catch {
		// best-effort
	}
}

// ---------- control (/new, /compact) ----------

/**
 * Send a single `tmux send-keys` invocation. Caller is responsible for
 * choosing whether to include `-l` (literal text) — without it, multi-char
 * args like `Enter` are interpreted as key names.
 */
async function tmuxSendKeys(args: string[]): Promise<void> {
	await new Promise<void>((res, rej) => {
		const p = spawn("tmux", ["send-keys", ...args], { stdio: "ignore" });
		p.on("error", rej);
		p.on("exit", (code) =>
			code === 0 ? res() : rej(new Error(`tmux send-keys exited ${code}`)),
		);
	});
}

/**
 * Inject a pi slash command into pi's own pane.
 *
 * Sequence (all targeted at `$TMUX_PANE`, which the bot inherits from pi at
 * launch — robust against `show-md` side panes being focused):
 *
 *   1. Escape — pi's `app.interrupt`: aborts a running agent turn, closes any
 *      open modal (model picker, resume list, session tree, etc.).
 *   2. C-c    — pi's `app.clear`: clears the editor buffer in case the user
 *      had partial input. Without this, "/new" would be appended to their
 *      text and Enter would submit "<their text>/new" as a chat message.
 *   3. "/new" or "/compact …" — literal text, sent with `-l` so the leading
 *      `/` isn't reinterpreted by tmux.
 *   4. Enter  — submits, which routes to pi's TUI text-submit handler at
 *      modes/interactive/interactive-mode.js:2030 (for /new) /
 *      :2035 (for /compact).
 *
 * Small sleeps between bursts let pi's event loop process each event before
 * the next arrives. Without them, queued keys can race the modal teardown.
 */
export async function handleControl(d: Decision & { kind: "control" }): Promise<void> {
	const pane = process.env.TMUX_PANE;
	if (!process.env.TMUX || !pane) {
		await safeSend(
			d.chatId,
			`(can't /${d.command} — pi isn't running inside tmux)`,
			{ replyToMessageId: d.replyToMessageId },
		);
		return;
	}

	// /new rotates pi's session — any in-flight Telegram invokes vanish with
	// it, so the originating chats would never see `agent_end`. Notify them
	// here (other than the initiator, who gets the success ack below).
	if (d.command === "new") {
		const affected = [
			...(currentInvoke ? [currentInvoke] : []),
			...pendingInvokes,
		].filter((inv) => inv.chatId !== d.chatId);
		for (const inv of affected) {
			await safeSend(
				inv.chatId,
				`(cancelled — @${d.fromUsername} started a new pi session in "${d.chatTitle}")`,
			);
		}
	}

	const slashText =
		d.command === "compact" && d.args ? `/compact ${d.args}` : `/${d.command}`;

	try {
		await tmuxSendKeys(["-t", pane, "Escape"]);
		await new Promise((r) => setTimeout(r, 80));
		await tmuxSendKeys(["-t", pane, "C-c"]);
		await new Promise((r) => setTimeout(r, 60));
		await tmuxSendKeys(["-t", pane, "-l", slashText]);
		await tmuxSendKeys(["-t", pane, "Enter"]);
	} catch (e) {
		const msg = (e as Error).message;
		await safeSend(
			d.chatId,
			`(couldn't send /${d.command}: ${msg})`,
			{ replyToMessageId: d.replyToMessageId },
		);
		return;
	}

	// Stop the typing indicator immediately; the old session is on its way
	// out and any in-flight tracking will be torn down when this module's
	// runner is shut down by pi's session swap.
	if (d.command === "new") {
		stopTypingIndicator();
	}

	const reply =
		d.command === "new"
			? "(started a new pi session)"
			: d.args
				? `(compacting — ${d.args})`
				: "(compacting…)";
	await safeSend(d.chatId, reply, { replyToMessageId: d.replyToMessageId });
}

// ---------- start ----------

/**
 * /start — bootstrap reply. Never triggers an agent turn; the dispatcher
 * routes here BEFORE the allowlist check so this works for any chat.
 *
 * The reply tells the user their chat_id and what to do next. For
 * already-allowlisted chats, the message is just a friendly hello.
 */
export async function handleStart(d: Decision & { kind: "start" }): Promise<void> {
	if (d.isAllowed) {
		await safeSend(
			d.chatId,
			[
				"Hello! I'm ready.",
				"",
				"Try mentioning a persona to start a conversation:",
				"  @engineer can you help with X?",
				"  /pm what should we prioritise?",
				"",
				"Use /stop to cancel the in-flight agent turn.",
			].join("\n"),
			{ replyToMessageId: d.replyToMessageId },
		);
		return;
	}

	await safeSend(
		d.chatId,
		[
			"Hello! Your chat ID is:",
			"",
			`  ${d.chatId}`,
			"",
			"To allow me to respond in this chat, add this id to TELEGRAM_ALLOWED_CHATS",
			"in the agent-team .env (comma-separated if multiple), then run",
			"/telegram-connect in pi to pick up the change.",
		].join("\n"),
		{ replyToMessageId: d.replyToMessageId },
	);
}

// ---------- callback ----------

export async function handleCallback(
	d: Decision & { kind: "callback" },
	pi: ExtensionAPI,
): Promise<void> {
	// Always answer first so the spinner clears.
	try {
		await api.answerCallbackQuery(d.callbackQueryId);
	} catch {
		// best-effort
	}

	// Grey out the row on the originating message.
	try {
		await api.editMessageReplyMarkup(d.chatId, d.messageId, undefined);
	} catch {
		// best-effort
	}

	const [prefix, value] = d.data.split(":", 2);
	let line = "";
	let persona: Persona = "engineer";

	if (prefix === "persona") {
		if (!(PERSONAS as readonly string[]).includes(value)) return;
		persona = value as Persona;
		line = `(switched to ${persona} via button)`;
	} else if (prefix === "act") {
		if (value === "render") line = "use render-html on the just-produced note";
		else if (value === "export") line = "use export to produce a PDF of the just-produced note";
		else return;
		// Use whichever persona was last active in this chat.
		const state = loadChatState(d.chatId, d.chatTitle);
		if (state.lastAssistantPersona && (PERSONAS as readonly string[]).includes(state.lastAssistantPersona)) {
			persona = state.lastAssistantPersona as Persona;
		}
	} else if (prefix === "pu") {
		line = `(profile update: ${value})`;
		const state = loadChatState(d.chatId, d.chatTitle);
		if (state.lastAssistantPersona && (PERSONAS as readonly string[]).includes(state.lastAssistantPersona)) {
			persona = state.lastAssistantPersona as Persona;
		}
	} else {
		return;
	}

	await handleInvoke(
		{
			kind: "invoke",
			chatId: d.chatId,
			chatTitle: d.chatTitle,
			fromUsername: d.fromUsername,
			persona,
			line,
			replyToMessageId: d.messageId,
		},
		pi,
	);
}

// ---------- pi event handlers (called from index.ts) ----------

/**
 * before_agent_start fires once per agent loop. We claim the head of the
 * pending-invoke FIFO when the prompt is recognisably ours: it either starts
 * with the Telegram prefix, or has a leading run of `[From Telegram …]`
 * steering lines followed by one of our trigger lines. Pi drains
 * `deliverAs: "followUp"` in submission order, so head-of-queue is correct.
 */
export function onBeforeAgentStart(prompt: string): void {
	if (pendingInvokes.length === 0) return;
	const trimmed = prompt.trimStart();
	if (!trimmed.startsWith(TG_PREFIX)) return; // user-typed input, not ours
	currentInvoke = pendingInvokes.shift();
	ensureTypingIndicator();
}

/**
 * agent_end fires when the agent loop finishes. If currentInvoke is set, this
 * is the response to a Telegram invoke; extract the final assistant text and
 * route it back.
 */
export async function onAgentEnd(messages: AgentMessageLike[]): Promise<void> {
	const inv = currentInvoke;
	currentInvoke = undefined;
	stopTypingIndicator();

	if (!inv) return; // not ours

	const finalText = extractFinalAssistantText(messages);
	if (finalText.length === 0) {
		// Tool-only turn — Telegram rejects empty messages. Send a neutral ack.
		await safeSend(inv.chatId, "(done)", { replyToMessageId: inv.replyToMessageId });
		return;
	}

	const keyboard = pickKeyboard(finalText);
	const ids = await safeSendOrReportError(inv.chatId, finalText, {
		replyToMessageId: inv.replyToMessageId,
		replyMarkup: keyboard,
	});

	await maybeSendExportedPdf(inv.chatId, finalText, inv.replyToMessageId);

	// Persist what persona this reply was from and the message id of the last
	// chunk (which carries any inline keyboard).
	const state = loadChatState(inv.chatId, inv.chatTitle);
	state.lastAssistantPersona = inv.persona;
	state.lastAssistantMessageId = ids?.[ids.length - 1];
	state.lastAssistantKeyboardKind = keyboardKindFor(finalText);
	state.lastActivityAt = new Date().toISOString();
	saveChatState(state);
}

// ---------- helpers ----------

/**
 * Loose shape for AssistantMessage; the real type is in pi-agent-core, but we
 * only care about role + content array of text-bearing entries. Defined here
 * so callers don't need the dependency typing.
 */
export type AgentMessageLike = {
	role: string;
	content?: unknown;
};

function extractFinalAssistantText(messages: AgentMessageLike[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.role !== "assistant") continue;
		const content = m.content;
		if (typeof content === "string") return content.trim();
		if (!Array.isArray(content)) continue;
		const parts: string[] = [];
		for (const part of content) {
			if (part && typeof part === "object" && "type" in part) {
				const p = part as { type: string; text?: string };
				if (p.type === "text" && typeof p.text === "string") parts.push(p.text);
			}
		}
		const joined = parts.join("\n").trim();
		if (joined.length > 0) return joined;
		// If this assistant message had only tool calls / thinking and no text,
		// keep looking back — earlier assistant messages might have the text.
	}
	return "";
}

function ensureTypingIndicator(): void {
	if (typingTimer) return;
	const target = currentInvoke?.chatId ?? pendingInvokes[0]?.chatId;
	if (target === undefined) return;
	const ping = (chatId: number): void => {
		api.sendChatAction(chatId, "typing").catch(() => {
			// best-effort
		});
	};
	ping(target);
	typingTimer = setInterval(() => {
		const t = currentInvoke?.chatId ?? pendingInvokes[0]?.chatId;
		if (t === undefined) {
			stopTypingIndicator();
			return;
		}
		ping(t);
	}, TYPING_INTERVAL_MS);
	typingTimer.unref?.();
}

function stopTypingIndicator(): void {
	if (typingTimer) {
		clearInterval(typingTimer);
		typingTimer = undefined;
	}
}

async function safeSend(
	chatId: number,
	text: string,
	opts: { replyToMessageId?: number; replyMarkup?: InlineKeyboardMarkup } = {},
): Promise<number[] | undefined> {
	try {
		return await api.sendMessage(chatId, text, opts);
	} catch {
		// best-effort; the typing indicator will eventually time out and the
		// user will see the lack of reply.
		return undefined;
	}
}

async function safeSendOrReportError(
	chatId: number,
	text: string,
	opts: { replyToMessageId?: number; replyMarkup?: InlineKeyboardMarkup } = {},
): Promise<number[] | undefined> {
	try {
		return await api.sendMessage(chatId, text, opts);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		// Drop the keyboard and try a fallback plain-text reply so the user at
		// least learns the agent finished.
		try {
			return await api.sendMessage(chatId, `(error sending reply: ${msg})`);
		} catch {
			return undefined;
		}
	}
}

// ---------- PDF upload ----------

// Matches the `/p/<filename>.pdf` path that `write_export_pdf` emits. The
// filename portion is the on-disk basename under AGENTS_TEAM_EXPORT_PATH —
// the route handler at `app/p/[slug]/route.ts` is just a static disk read.
const EXPORT_PDF_URL_RE = /\/p\/([A-Za-z0-9._-]+\.pdf)\b/;

async function maybeSendExportedPdf(
	chatId: number,
	text: string,
	replyToMessageId: number,
): Promise<void> {
	const m = text.match(EXPORT_PDF_URL_RE);
	if (!m) return;
	const filename = m[1];
	const { resolve, join } = await import("node:path");
	const exportRoot = resolve(
		process.env.AGENTS_TEAM_EXPORT_PATH ?? join(process.cwd(), "exports"),
	);
	const filePath = join(exportRoot, filename);
	try {
		await api.sendDocument(chatId, filePath, { filename, replyToMessageId });
	} catch {
		// best-effort; the URL is already in the text reply so the user can
		// still download it manually.
	}
}

// ---------- inline keyboards ----------

const KEYBOARDS_DISABLED = (): boolean =>
	(process.env.TELEGRAM_INLINE_KEYBOARDS ?? "on").toLowerCase() === "off";

const ARTIFACT_URL_RE = /(localhost:\d+|127\.0\.0\.1:\d+|https?:\/\/[^\s]+)\/(v|p)\/[^\s]+/;
const PROFILE_UPDATE_RE = /PROFILE_UPDATE:/;

function keyboardKindFor(text: string): "artifact" | "profile" | undefined {
	if (PROFILE_UPDATE_RE.test(text)) return "profile";
	if (ARTIFACT_URL_RE.test(text)) return "artifact";
	return undefined;
}

/**
 * Pick an inline keyboard for an outbound reply, or return undefined to send
 * the message bare. Keyboards only appear when the agent's text gives us
 * unambiguous options to surface — an artifact URL or a profile-update
 * proposal. No default persona switcher: persona is selected by typing /name
 * or @name in the next message, which keeps replies uncluttered.
 */
function pickKeyboard(text: string): InlineKeyboardMarkup | undefined {
	if (KEYBOARDS_DISABLED()) return undefined;
	const kind = keyboardKindFor(text);
	if (kind === "profile") {
		return {
			inline_keyboard: [
				[
					{ text: "Approve", callback_data: "pu:approve" },
					{ text: "Edit", callback_data: "pu:edit" },
					{ text: "Reject", callback_data: "pu:reject" },
				],
			],
		};
	}
	if (kind === "artifact") {
		const buttons = [
			{ text: "Render again", callback_data: "act:render" },
			{ text: "Export PDF", callback_data: "act:export" },
		];
		return { inline_keyboard: [buttons] };
	}
	return undefined;
}

// ---------- introspection (for /stop and tests) ----------

export function inFlightCount(): number {
	return (currentInvoke ? 1 : 0) + pendingInvokes.length;
}

export function _resetForTests(): void {
	steeringBuffer.length = 0;
	pendingInvokes.length = 0;
	currentInvoke = undefined;
	stopTypingIndicator();
}

// Re-exported for the Update type and dispatcher use upstream.
export type { TelegramUpdate };
