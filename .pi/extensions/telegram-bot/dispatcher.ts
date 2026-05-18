/**
 * dispatcher — pure decision function. Takes a Telegram update + bot context
 * and returns a Decision. Does no IO. The driver acts on the decision.
 *
 * Decision rules for `update.message` (in order, first match wins):
 *   1. chat_id not in allowlist               → ignore
 *   2. text starts with `/stop`               → stop
 *   3. text starts with `/<persona>` OR contains `@<persona>` OR replies to a
 *      bot message                            → invoke (with that persona)
 *   4. otherwise                              → ingest (steering buffer)
 *
 * For `update.callback_query`:
 *   5. chat_id not in allowlist               → ignore
 *   6. data starts with known prefix          → callback
 *   7. otherwise                              → ignore
 *
 * Note: pi slash commands (/new, /resume, /fork, /export, …) are deliberately
 * NOT routed from Telegram. `pi.sendUserMessage()` hard-codes
 * `expandPromptTemplates: false`, so any "/foo" text we inject reaches the
 * agent as raw text instead of triggering pi's command handler. Surfacing them
 * as buttons just lies about what's possible.
 */

import type { TelegramUpdate } from "./api";
import { loadChatState } from "./state";

export const PERSONAS = ["pm", "engineer", "educator", "language", "trader"] as const;
export type Persona = (typeof PERSONAS)[number];

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
