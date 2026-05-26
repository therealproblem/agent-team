/**
 * state — on-disk persistence for the telegram-bot extension.
 *
 * Files in `.pi/state/telegram/`:
 *   - `<chat_id>.json` — per-chat metadata. Created lazily on first contact.
 *   - `_receiver.lock` — local webhook receiver ownership (PID-tracked).
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

// ---------- webhook receiver lock ----------

interface LockFile {
	pid: number;
	acquiredAt: string;
}

const RECEIVER_LOCK_PATH = join(STATE_DIR, "_receiver.lock");

export function tryAcquireReceiverLock(): boolean {
	ensureDir();
	const currentPid = process.pid;
	const existing = readJson<LockFile>(RECEIVER_LOCK_PATH);
	if (existing) {
		if (existing.pid === currentPid) {
			writeJson(RECEIVER_LOCK_PATH, {
				pid: currentPid,
				acquiredAt: new Date().toISOString(),
			});
			return true;
		}
		try {
			process.kill(existing.pid, 0);
			return false;
		} catch {
			// Dead or unreachable holder; reclaim below.
		}
	}
	writeJson(RECEIVER_LOCK_PATH, {
		pid: currentPid,
		acquiredAt: new Date().toISOString(),
	});
	return true;
}

export function releaseReceiverLock(): void {
	const existing = readJson<LockFile>(RECEIVER_LOCK_PATH);
	if (existing && existing.pid === process.pid) {
		try {
			require("node:fs").unlinkSync(RECEIVER_LOCK_PATH);
		} catch {
			// Best-effort.
		}
	}
}
