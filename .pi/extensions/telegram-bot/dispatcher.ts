/**
 * dispatcher — pure decision function. Takes a Telegram update + bot context
 * and returns a Decision. Does no IO. The driver acts on the decision.
 *
 * Decision rules for `update.message` (in order, first match wins):
 *   1. chat_id not in allowlist               → ignore
 *   2. text starts with `/stop`               → stop
 *   3. text matches `/new` or `/compact`      → control (driver does tmux
 *                                                send-keys into pi's pane)
 *   4. text starts with `/<persona>` OR contains `@<persona>` OR replies to a
 *      bot message                            → invoke (with that persona)
 *   5. otherwise                              → ingest (steering buffer)
 *
 * For `update.callback_query`:
 *   6. chat_id not in allowlist               → ignore
 *   7. data starts with known prefix          → callback
 *   8. otherwise                              → ignore
 *
 * Pi slash commands like `/new` and `/compact` cannot be triggered via
 * `pi.sendUserMessage()` — that API hard-codes `expandPromptTemplates: false`
 * so an injected `/foo` reaches the LLM as raw text. Instead, when running
 * inside tmux (the default — see the `tmux-host` extension), we type the
 * command into pi's own pane via `tmux send-keys`, and pi's TUI handles it
 * exactly as if the user had typed it. See `handleControl` in driver.ts.
 *
 * Other pi slash commands (/resume, /fork, /export, …) are not routed yet —
 * /resume needs a session picker, /fork needs an entry id, etc.
 *
 * Personas are loaded from `.pi/state/persona-registry.json` — the canonical
 * registry. Adding/removing/renaming a persona requires updating only that
 * file plus the persona's SKILL.md. Engineer is included as a valid mention
 * target (routes via pm) even though it's a subagent, not a persona.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TelegramUpdate } from "./api";
import { loadChatState } from "./state";

interface PersonaRegistry {
	personas: Record<string, unknown>;
	subagents: Record<string, unknown>;
}

function loadPersonas(): string[] {
	const registryPath = resolve(process.cwd(), ".pi/state/persona-registry.json");
	const registry: PersonaRegistry = JSON.parse(readFileSync(registryPath, "utf-8"));
	// Include both personas and engineer subagent as valid mention targets
	return [...Object.keys(registry.personas), "engineer"];
}

export const PERSONAS = loadPersonas();
export type Persona = string;

export type Decision =
	| {
			kind: "ingest";
			chatId: number;
			chatTitle: string;
			fromUsername: string;
			line: string;
	  }
	| {
			kind: "invoke";
			chatId: number;
			chatTitle: string;
			fromUsername: string;
			persona: Persona;
			line: string;
			replyToMessageId: number;
	  }
	| {
			kind: "stop";
			chatId: number;
			chatTitle: string;
			fromUsername: string;
			replyToMessageId: number;
	  }
	| {
			kind: "control";
			command: "new" | "compact";
			args: string | undefined;
			chatId: number;
			chatTitle: string;
			fromUsername: string;
			replyToMessageId: number;
	  }
	| {
			kind: "start";
			chatId: number;
			chatTitle: string;
			fromUsername: string;
			replyToMessageId: number;
			isAllowed: boolean;
	  }
	| {
			kind: "callback";
			chatId: number;
			chatTitle: string;
			fromUsername: string;
			data: string;
			callbackQueryId: string;
			messageId: number;
	  }
	| { kind: "ignore"; reason: string; chatId?: number };

export interface DispatcherContext {
	allowedChats: Set<number>;
	botUsername: string;
}

const PERSONA_RE = new RegExp(`^/(${PERSONAS.join("|")})\\b`, "i");
const PERSONA_MENTION_RE = new RegExp(`@(${PERSONAS.join("|")})\\b`, "i");
const STOP_RE = /^\/stop\b/i;
const START_RE = /^\/start\b/i;
const CONTROL_RE = /^\/(new|compact)\b\s*(.*)$/i;
const CALLBACK_PREFIXES = ["persona:", "act:", "pu:"];

function chatTitle(update: TelegramUpdate["message"] | NonNullable<TelegramUpdate["callback_query"]>["message"]): string {
	if (!update) return "";
	const chat = update.chat;
	return chat.title ?? chat.username ?? chat.first_name ?? `chat:${chat.id}`;
}

function fromUsername(from: { username?: string; first_name?: string } | undefined): string {
	if (!from) return "unknown";
	return from.username ?? from.first_name ?? "unknown";
}

export function decide(update: TelegramUpdate, ctx: DispatcherContext): Decision {
	// ---- callback_query branch ----
	const cb = update.callback_query;
	if (cb) {
		const chatId = cb.message?.chat.id;
		if (chatId === undefined) {
			return { kind: "ignore", reason: "callback_query without message context" };
		}
		if (!ctx.allowedChats.has(chatId)) {
			return {
				kind: "ignore",
				reason: `chat not allowlisted (callback): TO ALLOW THIS CHAT, ADD ${chatId}`,
				chatId,
			};
		}
		const data = cb.data ?? "";
		if (!CALLBACK_PREFIXES.some((p) => data.startsWith(p))) {
			return { kind: "ignore", reason: `unknown callback data: ${data}`, chatId };
		}
		return {
			kind: "callback",
			chatId,
			chatTitle: chatTitle(cb.message),
			fromUsername: fromUsername(cb.from),
			data,
			callbackQueryId: cb.id,
			messageId: cb.message?.message_id ?? 0,
		};
	}

	// ---- message branch ----
	const msg = update.message;
	if (!msg) return { kind: "ignore", reason: "no message or callback_query" };

	const chatId = msg.chat.id;
	const text = msg.text ?? "";
	const title = chatTitle(msg);
	const sender = fromUsername(msg.from);

	// /start bypasses the allowlist — it's the bootstrap path for discovering
	// chat ids before they can be allowlisted. Always-on, replies with the
	// chat_id and onboarding info, no agent turn triggered.
	if (START_RE.test(text)) {
		return {
			kind: "start",
			chatId,
			chatTitle: title,
			fromUsername: sender,
			replyToMessageId: msg.message_id,
			isAllowed: ctx.allowedChats.has(chatId),
		};
	}

	if (!ctx.allowedChats.has(chatId)) {
		return {
			kind: "ignore",
			reason: `chat not allowlisted: TO ALLOW THIS CHAT, ADD ${chatId}`,
			chatId,
		};
	}

	if (STOP_RE.test(text)) {
		return {
			kind: "stop",
			chatId,
			chatTitle: title,
			fromUsername: sender,
			replyToMessageId: msg.message_id,
		};
	}

	// /new and /compact: typed into pi's own pane via tmux send-keys, since
	// pi.sendUserMessage() can't trigger built-in slash commands. Must come
	// before the persona check so `/new` isn't mistaken for `/news` etc.
	const ctrl = text.match(CONTROL_RE);
	if (ctrl) {
		const args = ctrl[2].trim();
		return {
			kind: "control",
			command: ctrl[1].toLowerCase() as "new" | "compact",
			args: args.length > 0 ? args : undefined,
			chatId,
			chatTitle: title,
			fromUsername: sender,
			replyToMessageId: msg.message_id,
		};
	}

	const personaSlash = text.match(PERSONA_RE);
	if (personaSlash) {
		const persona = personaSlash[1].toLowerCase() as Persona;
		// Strip the leading `/persona` token from the body for cleaner injection;
		// also strip `@<botname>` that Telegram appends in groups.
		const body = text
			.replace(PERSONA_RE, "")
			.replace(new RegExp(`@${ctx.botUsername}\\b`, "i"), "")
			.trim();
		return {
			kind: "invoke",
			chatId,
			chatTitle: title,
			fromUsername: sender,
			persona,
			line: body.length > 0 ? body : "(no message body)",
			replyToMessageId: msg.message_id,
		};
	}

	const personaMention = text.match(PERSONA_MENTION_RE);
	if (personaMention) {
		const persona = personaMention[1].toLowerCase() as Persona;
		// Keep the @-mention in the line so the agent sees the trigger naturally.
		return {
			kind: "invoke",
			chatId,
			chatTitle: title,
			fromUsername: sender,
			persona,
			line: text,
			replyToMessageId: msg.message_id,
		};
	}

	// Reply to a bot message → use the persona that bot was speaking as.
	const replyTo = msg.reply_to_message;
	if (
		replyTo?.from?.is_bot &&
		replyTo.from.username?.toLowerCase() === ctx.botUsername.toLowerCase()
	) {
		const chat = loadChatState(chatId, title);
		const persona = (chat.lastAssistantPersona ?? "pm") as Persona;
		return {
			kind: "invoke",
			chatId,
			chatTitle: title,
			fromUsername: sender,
			persona,
			line: text,
			replyToMessageId: msg.message_id,
		};
	}

	// Private DM: the user is clearly talking to the bot, no @-mention needed.
	// Every message triggers a turn (with the last-active persona, defaulting
	// to engineer for first contact). In groups, by contrast, the bot stays
	// quiet until @-mentioned and accumulates plain messages as steering.
	if (msg.chat.type === "private") {
		const chat = loadChatState(chatId, title);
		const persona = (chat.lastAssistantPersona ?? "engineer") as Persona;
		return {
			kind: "invoke",
			chatId,
			chatTitle: title,
			fromUsername: sender,
			persona,
			line: text,
			replyToMessageId: msg.message_id,
		};
	}

	// Group with no @-mention — pure steering.
	return {
		kind: "ingest",
		chatId,
		chatTitle: title,
		fromUsername: sender,
		line: text,
	};
}

export function parseAllowedChats(raw: string | undefined): Set<number> {
	if (!raw) return new Set();
	return new Set(
		raw
			.split(",")
			.map((s) => s.trim())
			.filter((s) => /^-?\d+$/.test(s))
			.map((s) => Number(s)),
	);
}
