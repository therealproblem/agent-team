/**
 * loop — long-poll runtime for the telegram-bot extension.
 *
 * The extension calls `start(pi, dctx, setHealth)`; loop runs until `stop()`
 * is called. Offset is persisted to disk after each batch so a restart
 * resumes where it left off (Telegram retains ~24h of undelivered updates).
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
	// After a session swap or quick restart, Telegram keeps the prior module's
	// long-poll alive on their side until it times out on their clock — up to
	// timeoutSec seconds. New getUpdates calls during that window come back
	// 409. Pad with a margin for clock skew + jitter; anything past this is
	// almost certainly a genuine concurrent poller, not a leftover lock.
	const conflictGraceMs = (timeoutSec + 20) * 1000;
	let offset = loadOffset();
	let backoffMs = 1_000;
	// Tracks whether we've already attempted the "clear webhook + drain stale
	// long-poll" recovery since the last successful getUpdates.
	let recovered409 = false;
	// Wall-clock start of the current 409 burst (reset on any successful
	// getUpdates). Used to decide whether persistent 409s are still within
	// Telegram's grace window (stay quiet — the | TG ✗ footer is enough) or
	// past it (surface once as a likely concurrent-instance problem).
	let conflictStartedAt: number | undefined;
	let surfacedPersistent = false;

	while (running) {
		try {
			const updates = await api.getUpdates(
				offset,
				timeoutSec,
				[...ALLOWED_UPDATES],
				abort.signal,
			);
			backoffMs = 1_000;
			recovered409 = false;
			conflictStartedAt = undefined;
			surfacedPersistent = false;
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
			// 409 Conflict has two causes: a webhook is registered, OR another
			// getUpdates is in flight server-side (most commonly a stale
			// long-poll lock held after the previous module's abort). First
			// time through, do both recoveries: deleteWebhook is cheap and
			// idempotent, and a timeout=0 getUpdates with the higher offset
			// causes Telegram to release any prior long-poll on their side.
			//
			// Past that initial recovery we stay quiet until conflictGraceMs
			// has elapsed — repeated 409s inside that window are almost always
			// Telegram taking its time to drop the prior session's lock, and
			// the alarmist "another instance is polling" message would spam
			// the user every backoff cycle for a benign reason. Once we're
			// past the window the lock theory is dead, so we surface ONCE
			// (more spam doesn't help) and keep backing off; the | TG ✗
			// footer carries the unhealthy state until a poll succeeds.
			if (/409|Conflict/.test(msg)) {
				if (conflictStartedAt === undefined) conflictStartedAt = Date.now();
				if (!recovered409) {
					surface(
						pi,
						"telegram-bot: getUpdates conflict — clearing webhook and prior long-poll lock",
					);
					try {
						await api.deleteWebhook();
					} catch {
						// best-effort
					}
					try {
						await api.getUpdates(offset, 0, [...ALLOWED_UPDATES]);
					} catch {
						// The drain call may itself 409; that's fine — issuing
						// it still nudges Telegram to drop the prior lock.
					}
					recovered409 = true;
					backoffMs = 500;
				} else if (
					!surfacedPersistent &&
					Date.now() - conflictStartedAt >= conflictGraceMs
				) {
					surface(
						pi,
						`telegram-bot: getUpdates still conflicting after ${Math.round(conflictGraceMs / 1000)}s — another process is likely polling with the same TELEGRAM_BOT_TOKEN`,
					);
					surfacedPersistent = true;
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
