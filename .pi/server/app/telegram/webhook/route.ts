/**
 * /telegram/webhook — public-facing endpoint Telegram POSTs updates to.
 *
 * Used only when the telegram-bot extension boots in webhook mode (i.e. when
 * AGENTS_TEAM_SERVER_PUBLIC_URL is set in .env). The actual dispatcher lives
 * inside the running pi process; this route is a thin forwarder:
 *
 *   1. Verify Telegram's X-Telegram-Bot-Api-Secret-Token header matches the
 *      shared secret in TELEGRAM_WEBHOOK_SECRET. 401 on mismatch — the only
 *      authentication Telegram itself offers.
 *   2. Read the loopback rendezvous from .pi/state/telegram/_loopback.json
 *      (port + per-pi-boot internal-auth token). If the file is missing or
 *      the loopback doesn't respond, return 503 — pi is down and Telegram
 *      will retry on its own backoff.
 *   3. Forward the raw body to http://127.0.0.1:<port>/__internal/telegram
 *      with the X-Internal-Auth header set to the loopback token.
 *   4. Mirror back the loopback's status / body.
 *
 * Why the loopback indirection? Pi (where the extension and dispatcher live)
 * and Next.js (where this route runs) are different processes. The loopback
 * is the cheapest reliable bridge — no IPC plumbing to choose, no filesystem
 * queue to GC, restart-safe because the rendezvous is rewritten on every
 * extension boot.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

// The loopback rendezvous is written by .pi/extensions/telegram-bot/receiver.ts.
// Path is resolved relative to the project root (the Next.js server's cwd
// equals the agents-team repo root when started via the existing `server`
// extension).
const LOOPBACK_PATH = join(process.cwd(), ".pi", "state", "telegram", "_loopback.json");

interface LoopbackInfo {
	port?: number;
	token?: string;
	pid?: number;
}

function readLoopback(): LoopbackInfo | undefined {
	try {
		const raw = readFileSync(LOOPBACK_PATH, "utf8");
		return JSON.parse(raw) as LoopbackInfo;
	} catch {
		return undefined;
	}
}

export async function POST(req: Request): Promise<Response> {
	const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
	const provided = req.headers.get("x-telegram-bot-api-secret-token");

	// If no secret is configured server-side, treat as misconfigured rather
	// than silently allowing through — refusing is the safer default.
	if (!expected) {
		return NextResponse.json(
			{ ok: false, error: "TELEGRAM_WEBHOOK_SECRET not configured" },
			{ status: 503 },
		);
	}
	if (provided !== expected) {
		return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}

	const loopback = readLoopback();
	if (!loopback?.port || !loopback?.token) {
		// Pi is down or webhook mode isn't active. Telegram will retry.
		return NextResponse.json(
			{ ok: false, error: "pi extension not running" },
			{ status: 503 },
		);
	}

	const body = await req.text();

	try {
		const forwarded = await fetch(`http://127.0.0.1:${loopback.port}/__internal/telegram`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-internal-auth": loopback.token,
			},
			body,
			// Short timeout — the receiver always 200s immediately and dispatches
			// async, so this should never be slow. If it is, pi is wedged; let
			// Telegram retry.
			signal: AbortSignal.timeout(2_000),
		});

		const text = await forwarded.text();
		return new Response(text || "{}", {
			status: forwarded.status,
			headers: { "content-type": "application/json" },
		});
	} catch {
		return NextResponse.json(
			{ ok: false, error: "loopback unreachable" },
			{ status: 503 },
		);
	}
}
