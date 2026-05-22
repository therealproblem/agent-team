/**
 * state — on-disk persistence for the telegram-bot extension.
 *
 * Two kinds of files in `.pi/state/telegram/`:
 *   - `<chat_id>.json` — per-chat metadata. Created lazily on first contact.
 *   - `_offset.json`   — long-poll cursor (last seen update_id + 1).
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

// ---------- polling lock ----------

interface LockFile {
	pid: number;
	acquiredAt: string;
}

const LOCK_PATH = join(STATE_DIR, "_poll.lock");

/**
 * Attempt to acquire the polling lock. Returns true if acquired, false if
 * another live process holds it. Stale locks (PID no longer running) are
 * automatically cleaned and re-acquired.
 */
export function tryAcquirePollLock(): boolean {
	ensureDir();
	const currentPid = process.pid;

	// Check if lock exists
	const existing = readJson<LockFile>(LOCK_PATH);
	if (existing) {
		// Check if the PID is still alive
		try {
			// Sending signal 0 checks if process exists without actually sending a signal
			process.kill(existing.pid, 0);
			// Process exists — lock is held by another live process
			return false;
		} catch (err: unknown) {
			// Process doesn't exist or we don't have permission to signal it
			// Treat as stale lock and fall through to acquire
		}
	}

	// Acquire lock
	writeJson(LOCK_PATH, {
		pid: currentPid,
		acquiredAt: new Date().toISOString(),
	});
	return true;
}

/**
 * Release the polling lock if this process holds it.
 */
export function releasePollLock(): void {
	const existing = readJson<LockFile>(LOCK_PATH);
	if (existing && existing.pid === process.pid) {
		try {
			require("node:fs").unlinkSync(LOCK_PATH);
		} catch {
			// Best-effort
		}
	}
}
