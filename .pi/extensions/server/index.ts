/**
 * server — Pi extension that lifecycle-manages the local Next.js / Nextra
 * server that serves renders and exports.
 *
 * On `session_start` (startup or resume):
 *   1. Probe the configured port. If it's already bound, skip — another Pi
 *      session (or an orphan from a crash) is serving. The bound process is
 *      authoritative; we don't try to take over.
 *   2. Verify the production build (.next/) exists. If missing, surface a
 *      clear message pointing at `bash scripts/setup.sh` or `npm run build`
 *      and bail — we never auto-build on session_start (that would silently
 *      add 10+ seconds before the TUI is usable).
 *   3. Otherwise spawn `node node_modules/next/dist/bin/next start` from
 *      the server root. We invoke Next directly (not `npm run start`)
 *      because the npm wrapper doesn't propagate SIGTERM to the Next child —
 *      that would leak orphan processes across Pi restarts.
 *   4. Poll the port until it answers (up to 15s) or timeout. Pre-warm `/`
 *      with a fetch — production start is fast but the warm-up still
 *      cheap-insures the first user request.
 *   5. Stay silent on the happy path; only surface a TUI line when something
 *      needs attention (missing build, spawn error, 15s timeout).
 *
 * On Pi exit (`exit` / SIGINT / SIGTERM):
 *   Send SIGTERM to the spawned process; SIGKILL fallback after 2s.
 *
 * The surface line uses customType "server" with a minimal renderer so the
 * `[server]` label is dropped (same pattern as the reminders extension).
 *
 * If you're iterating on the .pi/server/ Next app itself, `next start` won't
 * pick up changes — rebuild with `cd .pi/server && npm run build` and
 * restart Pi, or run `npm run dev` in a separate terminal on a different
 * port for live reload.
 *
 * Configure via env vars:
 *   AGENTS_TEAM_SERVER_PATH — default: <cwd>/.pi/server
 *   AGENTS_TEAM_SERVER_PORT — default: 8080
 */

import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
	type ExtensionAPI,
	type MessageRenderer,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, Spacer, Text } from "@earendil-works/pi-tui";
import { loadDotenv } from "../../lib/dotenv";

loadDotenv();

const SERVER_ROOT = resolve(
	process.env.AGENTS_TEAM_SERVER_PATH ?? join(process.cwd(), ".pi", "server"),
);
const SERVER_PORT = Number(process.env.AGENTS_TEAM_SERVER_PORT ?? 8080);
const LOG_PATH = join(process.cwd(), ".pi", "state", "server.log");
const NEXT_BIN = join(SERVER_ROOT, "node_modules", "next", "dist", "bin", "next");
const NEXT_BUILD_DIR = join(SERVER_ROOT, ".next");

async function isPortBound(port: number): Promise<boolean> {
	try {
		await fetch(`http://localhost:${port}/`, {
			signal: AbortSignal.timeout(500),
		});
		return true;
	} catch {
		return false;
	}
}

async function preWarm(port: number): Promise<void> {
	try {
		await fetch(`http://localhost:${port}/`, {
			signal: AbortSignal.timeout(10_000),
		});
	} catch {
		// Pre-warm is best-effort; if it fails the server may still be fine
		// from the user's perspective on the next real request.
	}
}

/**
 * Custom renderer for the `server` custom message type. Pi's default
 * renders a colored box with a bold `[customType]` label; we drop the label
 * (the "server: …" line already carries the context) and keep the box.
 */
const serverRenderer: MessageRenderer = (message, _options, theme) => {
	const container = new Container();
	container.addChild(new Spacer(1));
	const box = new Box(1, 1, (t: string) => theme.bg("customMessageBg", t));
	const text =
		typeof message.content === "string"
			? message.content
			: message.content
					.filter(
						(c): c is { type: "text"; text: string } => c.type === "text",
					)
					.map((c) => c.text)
					.join("\n");
	box.addChild(new Text(theme.fg("customMessageText", text), 0, 0));
	container.addChild(box);
	return container;
};

function surface(pi: ExtensionAPI, text: string, details?: object): void {
	pi.sendMessage(
		{
			customType: "server",
			content: text,
			display: true,
			details,
		},
		{ triggerTurn: false },
	);
}

export default function (pi: ExtensionAPI): void {
	pi.registerMessageRenderer("server", serverRenderer);

	let child: ChildProcess | null = null;

	pi.on("session_start", async (event, _ctx) => {
		// Only on real launches/resumes — not internal reloads, forks, etc.
		if (event.reason !== "startup" && event.reason !== "resume") return;

		if (!existsSync(SERVER_ROOT)) {
			surface(pi, `server: ${SERVER_ROOT} not found — run setup first`);
			return;
		}
		if (!existsSync(NEXT_BIN)) {
			surface(
				pi,
				`server: next binary missing — run \`cd ${SERVER_ROOT} && npm install\` first`,
			);
			return;
		}
		if (!existsSync(NEXT_BUILD_DIR)) {
			surface(
				pi,
				`server: production build missing — run \`bash scripts/setup.sh\` (or \`cd ${SERVER_ROOT} && npm run build\`) first`,
			);
			return;
		}

		if (await isPortBound(SERVER_PORT)) {
			// Already running — stay silent on the happy path.
			return;
		}

		try {
			await mkdir(dirname(LOG_PATH), { recursive: true });
		} catch {
			// Best-effort; if mkdir fails we let the createWriteStream below
			// throw and surface the message in the catch handler.
		}
		const log = createWriteStream(LOG_PATH, { flags: "a" });

		// Spawn Next directly. `npm run start` would interpose an npm process
		// that swallows SIGTERM, leaving orphan Next.js children behind.
		// `next start` serves the pre-built .next/ artifacts — fast cold start,
		// no compile-on-request, matches what the cloudflared tunnel exposes.
		child = spawn("node", [NEXT_BIN, "start", "-p", String(SERVER_PORT)], {
			cwd: SERVER_ROOT,
			stdio: ["ignore", "pipe", "pipe"],
		});
		child.stdout?.pipe(log);
		child.stderr?.pipe(log);
		child.on("error", (err) => {
			surface(pi, `server: spawn error — ${err.message}`);
		});

		// Poll up to 15s for the port to come up. With `next start` serving
		// pre-built artifacts, port-bound usually means ready — pre-warm `/`
		// anyway as a cheap belt-and-braces for the first user request.
		for (let i = 0; i < 30; i++) {
			if (await isPortBound(SERVER_PORT)) {
				await preWarm(SERVER_PORT);
				// Came up cleanly — stay silent on the happy path.
				return;
			}
			await new Promise((r) => setTimeout(r, 500));
		}
		surface(
			pi,
			`server: failed to start within 15s — tail ${LOG_PATH}`,
		);
	});

	// Best-effort cleanup. Pi's TUI Ctrl-C can kill the parent before the
	// `exit` handler runs synchronously, so we also catch SIGINT/SIGTERM.
	const cleanup = () => {
		if (child && !child.killed) {
			child.kill("SIGTERM");
			setTimeout(() => {
				if (child && !child.killed) child.kill("SIGKILL");
			}, 2000).unref();
		}
	};
	process.on("exit", cleanup);
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
}
