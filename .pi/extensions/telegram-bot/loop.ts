/**
 * loop — long-poll runtime for the telegram-bot extension.
 *
 * Active only when `AGENTS_TEAM_SERVER_PUBLIC_URL` is unset. The extension
 * calls `start(pi, dctx, setHealth)`; loop runs until `stop()` is called.
 *
 * Offset is persisted to disk after each batch so a restart resumes where it
 * left off (Telegram retains ~24h of undelivered updates).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { surface as surfaceShared } from "../../lib/tui";
import { api } from "./api";
import { dispatch } from "./dispatch";
import type { DispatcherContext } from "./dispatcher";
import { loadOffset, saveOffset } from "./state";

function surface(pi: ExtensionAPI, text: string): void {
	surfaceShared(pi, "telegram-bot", text);
}

export type Health = "running" | "errored";

const ALLOWED_UPDATES = ["message", "callback_query"] as const;
const DEFAULT_TIMEOUT_SEC = 50;
const MAX_BACKOFF_MS = 60_000;

let abort: AbortController | undefined;
let running = false;

export async function start(
	pi: ExtensionAPI,
	dctx: DispatcherContext,
	setHealth: (h: Health) => void,
): Promise<void> {
	if (running) return;
	running = true;
	abort = new AbortController();

	const timeoutSec = Number(process.env.TELEGRAM_LONG_POLL_TIMEOUT ?? DEFAULT_TIMEOUT_SEC);
	let offset = loadOffset();
	let backoffMs = 1_000;

	while (running) {
		try {
			const updates = await api.getUpdates(
				offset,
				timeoutSec,
				[...ALLOWED_UPDATES],
				abort.signal,
			);
			backoffMs = 1_000;
			setHealth("running");
			for (const update of updates) {
				try {
					await dispatch(update, pi, dctx);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.error(`[telegram-bot] dispatch error: ${msg}`);
				}
				offset = update.update_id + 1;
				saveOffset(offset);
			}
		} catch (err) {
			if (!running) break; // intentional abort during shutdown
			const msg = err instanceof Error ? err.message : String(err);
			// 401/404 from a bad token: don't loop forever, surface and stop.
			if (/401|404|Unauthorized|Not Found/.test(msg)) {
				surface(pi, `telegram-bot: auth error from Telegram — ${msg}`);
				setHealth("errored");
				running = false;
				break;
			}
			// 409 Conflict happens if a webhook is still registered with
			// Telegram from any source (older build that supported webhook
			// mode, a manual setWebhook call, etc.). Clear it once before
			// backing off so polling can take over.
			if (/409|Conflict/.test(msg)) {
				surface(pi, "telegram-bot: getUpdates conflict (stale webhook?) — calling deleteWebhook");
				try {
					await api.deleteWebhook();
				} catch {
					// best-effort
				}
			} else {
				surface(pi, `telegram-bot: getUpdates error — ${msg} (retrying in ${Math.round(backoffMs / 1000)}s)`);
			}
			setHealth("errored");
			await sleep(backoffMs, abort.signal);
			backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
		}
	}
}

export function stop(): void {
	running = false;
	abort?.abort();
}

export function isRunning(): boolean {
	return running;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true },
		);
	});
}
