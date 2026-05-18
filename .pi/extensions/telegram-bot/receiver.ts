/**
 * receiver — loopback HTTP listener inside the extension.
 *
 * Active only in webhook mode. The Next.js route handler at
 * `.pi/server/app/telegram/webhook/route.ts` is the public-facing endpoint
 * Telegram POSTs to; it verifies the Telegram secret-token header and then
 * forwards the update body to `http://127.0.0.1:<port>/__internal/telegram`
 * (this server), where the same `dispatch()` pipeline as long-poll mode runs.
 *
 * The port is chosen by the OS (passing port 0 to `listen`); the (port,
 * shared-token) pair is written to `.pi/state/telegram/_loopback.json` so the
 * Next.js route can find it. The token is a fresh random hex string per
 * extension boot — defence-in-depth against anyone with local access poking
 * the loopback directly.
 */

import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dispatch } from "./dispatch";
import type { DispatcherContext } from "./dispatcher";
import { saveLoopback, clearLoopback } from "./state";

let server: Server | undefined;
let token: string | undefined;

export async function start(pi: ExtensionAPI, dctx: DispatcherContext): Promise<{ port: number; token: string }> {
	if (server) {
		// Already running — return existing rendezvous.
		const addr = server.address();
		const port = typeof addr === "object" && addr ? addr.port : 0;
		return { port, token: token ?? "" };
	}

	token = randomBytes(16).toString("hex");

	server = createServer((req, res) => {
		if (req.method !== "POST" || req.url !== "/__internal/telegram") {
			res.statusCode = 404;
			res.end();
			return;
		}
		if (req.headers["x-internal-auth"] !== token) {
			res.statusCode = 401;
			res.end();
			return;
		}
		let body = "";
		req.on("data", (chunk: Buffer) => {
			body += chunk.toString("utf8");
			if (body.length > 1_000_000) {
				// Telegram updates don't get this big; cap to avoid abuse.
				req.destroy();
			}
		});
		req.on("end", () => {
			let update: unknown;
			try {
				update = JSON.parse(body);
			} catch {
				res.statusCode = 400;
				res.end();
				return;
			}
			// Reply 200 immediately; do the work async. The Next.js route can
			// then return 200 to Telegram quickly too.
			res.statusCode = 200;
			res.setHeader("content-type", "application/json");
			res.end("{}");
			void dispatch(update as never, pi, dctx).catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[telegram-bot] receiver dispatch error: ${msg}`);
			});
		});
		req.on("error", () => {
			// Connection dropped; nothing to do.
		});
	});

	await new Promise<void>((resolve, reject) => {
		server!.once("error", reject);
		// Bind to loopback only, OS-chosen port.
		server!.listen(0, "127.0.0.1", () => resolve());
	});

	const addr = server.address();
	const port = typeof addr === "object" && addr ? addr.port : 0;
	saveLoopback({ port, token, pid: process.pid });

	return { port, token };
}

export async function stop(): Promise<void> {
	const s = server;
	server = undefined;
	token = undefined;
	clearLoopback();
	if (!s) return;
	await new Promise<void>((resolve) => {
		s.close(() => resolve());
		// Hard limit on close — don't hang pi shutdown on stuck connections.
		setTimeout(resolve, 2_000).unref?.();
	});
}

export function isRunning(): boolean {
	return server !== undefined;
}
