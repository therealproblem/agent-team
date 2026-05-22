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
 * Attempt to acquire the polling lock. Returns true if acquired (or already
 * held by us), false if another live process holds it.
 *
 * The lock is the sole gatekeeper for "primary status" — exactly one Pi
 * process per machine polls Telegram for updates at a time. Everyone else
 * (subagents, cron-driven runs, secondary tmux sessions, --no-session
 * one-shots) sees a live primary and stays dormant, so they don't fight
 * over getUpdates and cause 409 conflicts.
 *
 * Re-acquisition rules:
 *   - Same PID (us): refresh the timestamp and return true. This is what
 *     makes /reload, /new, /resume, /fork transparent — the same Node
 *     process is re-evaluating the extension and we still own the lock.
 *   - Different PID, alive: return false. The other live process is the
 *     primary; we stay dormant.
 *   - Different PID, dead (signal 0 throws ESRCH): reclaim. Covers kill -9,
 *     crash, panic — anywhere the holder exited without releasing the lock.
 *
 * Note: there is intentionally NO age-based staleness reclaim. A previous
 * version timed the lock out after 10 minutes "in case the holder slept",
 * but a Pi session sitting idle in tmux for >10 min is normal and very
 * much alive — letting a subagent steal the lock in that case caused the
 * primary's getUpdates to start 409-conflicting against the subagent's
 * concurrent poll, producing flapping (pi disconnected)/(pi connected)
 * notifications. Sleep/suspend resolves itself: the OS pauses the holder,
 * its loop pauses, and on wake it resumes polling — no reclaim needed.
 * If the holder is genuinely deadlocked, the user can delete
 * `.pi/state/telegram/_poll.lock` manually.
 */
export function tryAcquirePollLock(): boolean {
	ensureDir();
	const currentPid = process.pid;

	const existing = readJson<LockFile>(LOCK_PATH);
	if (existing) {
		if (existing.pid === currentPid) {
			// We already own it (this is a re-evaluation of the extension
			// module within the same Node process, e.g. /reload / /new /
			// /resume / /fork). Refresh the timestamp and continue.
			writeJson(LOCK_PATH, {
				pid: currentPid,
				acquiredAt: new Date().toISOString(),
			});
			return true;
		}
		try {
			// Signal 0 is a process-existence probe — doesn't actually signal.
			process.kill(existing.pid, 0);
			// Holder is alive and not us — stay dormant.
			return false;
		} catch {
			// ESRCH / EPERM — holder is gone or unreachable. Reclaim below.
		}
	}

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
