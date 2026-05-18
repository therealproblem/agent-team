/**
 * state — on-disk persistence for the telegram-bot extension.
 *
 * Three kinds of files in `.pi/state/telegram/`:
 *   - `<chat_id>.json` — per-chat metadata. Created lazily on first contact.
 *   - `_offset.json`   — long-poll cursor (last seen update_id + 1).
 *   - `_loopback.json` — webhook-mode rendezvous: { port, token } the Next.js
 *                        route handler reads to forward updates into pi.
 *
 * All writes are atomic via tmpfile + rename. The read paths tolerate missing
 * files and corrupt JSON (treated as "no state").
 *
 * No transcript is stored here. Pi's own session is the source of truth for
 * conversation history; this state is just routing metadata.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STATE_DIR = join(process.cwd(), ".pi", "state", "telegram");

function ensureDir(): void {
	if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

function readJson<T>(path: string): T | undefined {
	try {
		const raw = readFileSync(path, "utf8");
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

function writeJson(path: string, data: unknown): void {
	ensureDir();
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, JSON.stringify(data, null, 2));
	renameSync(tmp, path);
}

// ---------- per-chat state ----------

export interface ChatState {
	chatId: number;
	chatTitle: string;
	lastAssistantPersona?: string;
	lastAssistantMessageId?: number;
	lastAssistantKeyboardKind?: "artifact" | "profile";
	lastActivityAt: string;
}

function chatPath(chatId: number): string {
	return join(STATE_DIR, `${chatId}.json`);
}

export function loadChatState(chatId: number, fallbackTitle = ""): ChatState {
	const existing = readJson<ChatState>(chatPath(chatId));
	if (existing && existing.chatId === chatId) return existing;
	return {
		chatId,
		chatTitle: fallbackTitle,
		lastActivityAt: new Date().toISOString(),
	};
}

export function saveChatState(state: ChatState): void {
	writeJson(chatPath(state.chatId), state);
}

// ---------- long-poll offset ----------

interface OffsetFile {
	offset: number;
}

const OFFSET_PATH = join(STATE_DIR, "_offset.json");

export function loadOffset(): number {
	return readJson<OffsetFile>(OFFSET_PATH)?.offset ?? 0;
}

export function saveOffset(offset: number): void {
	writeJson(OFFSET_PATH, { offset });
}

// ---------- webhook loopback rendezvous ----------

export interface LoopbackInfo {
	port: number;
	token: string;
	pid: number;
}

const LOOPBACK_PATH = join(STATE_DIR, "_loopback.json");

export function loadLoopback(): LoopbackInfo | undefined {
	return readJson<LoopbackInfo>(LOOPBACK_PATH);
}

export function saveLoopback(info: LoopbackInfo): void {
	writeJson(LOOPBACK_PATH, info);
}

export function clearLoopback(): void {
	try {
		// Atomic-ish: write an empty marker so the Next.js route handler sees
		// "no loopback" (rather than racing on file removal).
		writeJson(LOOPBACK_PATH, {});
	} catch {
		// best-effort
	}
}
