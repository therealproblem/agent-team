import type { Server } from "node:http";
import { createServer } from "node:http";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TelegramUpdate } from "./api";
import { dispatch } from "./dispatch";
import type { DispatcherContext } from "./dispatcher";
import { getTelegramWebhookLocalPort, getTelegramWebhookSecret } from "./config";

export type Health = "running" | "errored";

const LOCAL_PATH = "/telegram/update";
const MAX_BODY_BYTES = 1024 * 1024;

let server: Server | undefined;
let running = false;
let activePort: number | undefined;

function safeEqual(a: string | undefined, b: string): boolean {
	return typeof a === "string" && a.length === b.length && a === b;
}

export async function startWebhookReceiver(
	pi: ExtensionAPI,
	dctx: DispatcherContext,
	setHealth: (h: Health) => void,
): Promise<void> {
	const port = getTelegramWebhookLocalPort();
	if (running && activePort === port) return;
	if (running) stopWebhookReceiver();

	const secret = getTelegramWebhookSecret();
	server = createServer((req, res) => {
		void (async () => {
			try {
				if (req.method !== "POST" || req.url !== LOCAL_PATH) {
					res.writeHead(404).end("not found");
					return;
				}
				if (!safeEqual(req.headers["x-telegram-bot-api-secret-token"] as string | undefined, secret)) {
					res.writeHead(401).end("unauthorized");
					return;
				}

				const chunks: Buffer[] = [];
				let size = 0;
				for await (const chunk of req) {
					const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
					size += buf.length;
					if (size > MAX_BODY_BYTES) {
						res.writeHead(413).end("payload too large");
						return;
					}
					chunks.push(buf);
				}

				let update: TelegramUpdate;
				try {
					update = JSON.parse(Buffer.concat(chunks).toString("utf8")) as TelegramUpdate;
				} catch {
					res.writeHead(400).end("invalid json");
					return;
				}
				if (!Number.isFinite(update.update_id)) {
					res.writeHead(400).end("invalid update");
					return;
				}

				await dispatch(update, pi, dctx);
				setHealth("running");
				res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[telegram-bot] webhook dispatch error: ${msg}`);
				setHealth("errored");
				if (!res.headersSent) res.writeHead(500).end("dispatch failed");
			}
		})();
	});

	await new Promise<void>((resolve, reject) => {
		const onError = (err: Error): void => {
			server?.off("listening", onListening);
			reject(err);
		};
		const onListening = (): void => {
			server?.off("error", onError);
			resolve();
		};
		server?.once("error", onError);
		server?.once("listening", onListening);
		server?.listen(port, "127.0.0.1");
	});
	server.unref?.();
	running = true;
	activePort = port;
	setHealth("running");
}

export function stopWebhookReceiver(): void {
	running = false;
	activePort = undefined;
	const s = server;
	server = undefined;
	if (s) s.close(() => undefined);
}

export function isWebhookReceiverRunning(): boolean {
	return running;
}
