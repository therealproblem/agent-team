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
 * another live process holds it.
 *
 * Stale lock recovery:
 *   1. If PID is dead, reclaim immediately.
 *   2. If lock age > 10 minutes, reclaim even if PID is alive (handles
 *      kill -9, crash, sleep/suspend where PID lingers but polling stopped).
 *
 * This makes recovery automatic — no manual `.pi/state/telegram/_poll.lock`
 * deletion required after unclean shutdown.
 */
export function tryAcquirePollLock(): boolean {
	ensureDir();
	const currentPid = process.pid;
	const STALE_LOCK_AGE_MS = 10 * 60 * 1000; // 10 minutes

	// Check if lock exists
	const existing = readJson<LockFile>(LOCK_PATH);
	if (existing) {
		const lockAge = Date.now() - new Date(existing.acquiredAt).getTime();
		const isStaleByAge = lockAge > STALE_LOCK_AGE_MS;

		// If lock is older than 10 minutes, reclaim regardless of PID status
		if (isStaleByAge) {
			// Fall through to acquire
		} else {
			// Check if the PID is still alive
			try {
				// Sending signal 0 checks if process exists without actually sending a signal
				process.kill(existing.pid, 0);
				// Process exists and lock is fresh — held by another live process
				return false;
			} catch (err: unknown) {
				// Process doesn't exist or we don't have permission to signal it
				// Treat as stale lock and fall through to acquire
			}
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
 * Check if multiple Pi CLI processes are running concurrently (not including
 * this one). This catches accidental duplicate sessions that cause alternating
 * 409 conflicts as they race for the poll lock.
 *
 * Filters out:
 *   - The current process
 *   - Children of the current process (subagents spawned with --no-session)
 *   - The parent process if it's the tmux-host wrapper (command = "pi", has child "tmux new-session")
 *   - Lines containing "tmux" or "grep"
 *
 * Returns: { hasDuplicates: boolean, pids: number[], error?: string }
 */
export function checkForDuplicatePiProcesses(): {
	hasDuplicates: boolean;
	pids: number[];
	error?: string;
} {
	const currentPid = process.pid;
	try {
		const { execSync } = require("node:child_process");
		// Get process tree with PID, PPID, and COMMAND
		const output = execSync("ps -eo pid,ppid,command", {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "ignore"],
		});

		const lines = output.trim().split("\n").slice(1); // Skip header
		const processes: Array<{ pid: number; ppid: number; command: string }> = [];
		const childPids = new Set<number>();

		// Parse all processes
		for (const line of lines) {
			const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
			if (match) {
				const pid = Number.parseInt(match[1], 10);
				const ppid = Number.parseInt(match[2], 10);
				const command = match[3];
				processes.push({ pid, ppid, command });
				if (ppid === currentPid) {
					childPids.add(pid);
				}
			}
		}

		// Find tmux-host wrapper PIDs: any "pi" process that has a child
		// "tmux new-session -A -s pi pi" is the outer wrapper we should exclude.
		const tmuxWrapperPids = new Set<number>();
		for (const proc of processes) {
			if (proc.command.includes("tmux new-session") && proc.command.includes(" pi")) {
				// This is the "tmux new-session ... pi" process; its parent is the wrapper
				tmuxWrapperPids.add(proc.ppid);
			}
		}

		// Find candidate "pi" processes
		const pids: number[] = [];
		for (const proc of processes) {
			// Match command ending with " pi" or "pi" at end (no trailing args)
			if (
				proc.command.match(/\spi\s*$/) &&
				!proc.command.includes("tmux") &&
				!proc.command.includes("grep")
			) {
				if (
					proc.pid !== currentPid &&
					!childPids.has(proc.pid) &&
					!tmuxWrapperPids.has(proc.pid)
				) {
					pids.push(proc.pid);
				}
			}
		}

		return { hasDuplicates: pids.length > 0, pids };
	} catch (err) {
		// ps command failed or unavailable — return non-blocking error
		return {
			hasDuplicates: false,
			pids: [],
			error: err instanceof Error ? err.message : String(err),
		};
	}
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
