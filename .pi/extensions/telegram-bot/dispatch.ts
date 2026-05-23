/**
 * dispatch — single entry point the transport calls.
 *
 * Long-poll (loop.ts) produces a `TelegramUpdate` and calls
 * `dispatch(update, pi, ctx)`. The split between decide() (pure) and the
 * per-kind handlers (impure) makes this very thin.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { surface as surfaceShared } from "../../lib/tui";
import type { TelegramUpdate } from "./api";
import { type DispatcherContext, decide } from "./dispatcher";
import {
	handleCallback,
	handleControl,
	handleIngest,
	handleInvoke,
	handleStart,
	handleStop,
} from "./driver";

function surface(pi: ExtensionAPI, text: string): void {
	surfaceShared(pi, "telegram-bot", text);
}

function traceOn(): boolean {
	return (process.env.TELEGRAM_TRACE ?? "").toLowerCase() === "on";
}

function imageTag(count: number | undefined): string {
	return count && count > 0 ? ` (+${count} img)` : "";
}

export async function dispatch(
	update: TelegramUpdate,
	pi: ExtensionAPI,
	dctx: DispatcherContext,
): Promise<void> {
	const decision = decide(update, dctx);
	switch (decision.kind) {
		case "ingest":
			if (traceOn())
				surface(
					pi,
					`telegram-bot: ingested from @${decision.fromUsername} in "${decision.chatTitle}"${imageTag(decision.attachments?.length)}`,
				);
			return handleIngest(decision);
		case "invoke":
			if (traceOn())
				surface(
					pi,
					`telegram-bot: invoke ${decision.persona} from @${decision.fromUsername} in "${decision.chatTitle}"${imageTag(decision.attachments?.length)}`,
				);
			return handleInvoke(decision, pi);
		case "stop":
			surface(pi, `telegram-bot: /stop from @${decision.fromUsername}`);
			return handleStop(decision);
		case "control":
			surface(
				pi,
				`telegram-bot: /${decision.command}${decision.args ? ` ${decision.args}` : ""} from @${decision.fromUsername}`,
			);
			return handleControl(decision);
		case "start":
			surface(
				pi,
				`telegram-bot: /start from @${decision.fromUsername} in "${decision.chatTitle}" (allowed=${decision.isAllowed})`,
			);
			return handleStart(decision);
		case "callback":
			if (traceOn())
				surface(pi, `telegram-bot: callback ${decision.data} from @${decision.fromUsername}`);
			return handleCallback(decision, pi);
		case "ignore":
			// Surface allowlist misses to the TUI — they're rare and operationally
			// important (they carry the bootstrap hint). Other ignores are noisy
			// and only go to stderr.
			if (decision.reason.startsWith("chat not allowlisted")) {
				surface(pi, `telegram-bot: ${decision.reason}`);
			} else {
				console.error(`[telegram-bot] dispatch.ignore: ${decision.reason}`);
			}
			return;
	}
}
