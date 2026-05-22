/**
 * server — Pi extension that lifecycle-manages the local Next.js / Nextra
 * server that serves renders and exports.
 *
 * On every `session_start` (startup, reload, new, resume, fork), the handler
 * returns immediately and runs the bring-up in the background — Pi's TUI
 * stays interactive while Next.js comes up. Background work, in order:
 *   1. Probe the configured port. If it's already bound, skip — another Pi
 *      session (or our own child from a prior session in this process) is
 *      serving. The bound process is authoritative; we don't try to take
 *      over. This makes /new /resume /fork no-ops once the server is up.
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
 *      needs attention (missing build, spawn error, 15s timeout). Surfaces
 *      can land *after* the TUI is already interactive — that's the point of
 *      detaching.
 *
 * On `session_shutdown` (quit only):
 *   Send SIGTERM to the spawned process; SIGKILL fallback after 2s. Other
 *   shutdown reasons (reload / new / resume / fork) leave the child running
 *   so the server's lifetime spans the pi process, not the session.
 *
 * On abrupt process exit (`exit` / SIGINT / SIGTERM):
 *   Belt-and-braces synchronous SIGTERM. No SIGKILL fallback — `process.on`
 *   handlers can't await timers.
 *
 * The surface line uses customType "server" with a minimal renderer so the
 * `[server]` label is dropped (same pattern as the reminders extension).
 *
 * If you're iterating on the .pi/server/ Next app itself, `next start` won't
 * pick up changes — rebuild with `cd .pi/server && npm run build` and
 * restart Pi, or set `AGENTS_TEAM_SERVER_MODE=dev` to spawn `next dev` with
 * hot reload instead (skips the build-dir check; first request will compile
 * on demand).
 *
 * Configure via env vars:
 *   AGENTS_TEAM_SERVER_PATH — default: <cwd>/.pi/server
 *   AGENTS_TEAM_SERVER_PORT — default: 8080
 *   AGENTS_TEAM_SERVER_MODE — `production` (default) or `dev`/`development`.
 *     `dev` runs `next dev --webpack` (hot reload, on-demand compile);
 *     anything else runs `next start` against the pre-built `.next/`.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadDotenv } from "../../lib/dotenv";
import { createBoxRenderer, surface as surfaceShared } from "../../lib/tui";

loadDotenv();

const SERVER_ROOT = resolve(
	process.env.AGENTS_TEAM_SERVER_PATH ?? join(process.cwd(), ".pi", "server"),
);
const SERVER_PORT = Number(process.env.AGENTS_TEAM_SERVER_PORT ?? 8080);
const SERVER_MODE = (process.env.AGENTS_TEAM_SERVER_MODE ?? "production").toLowerCase();
const IS_DEV = SERVER_MODE === "dev" || SERVER_MODE === "development";
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

function surface(pi: ExtensionAPI, text: string, details?: object): void {
	surfaceShared(pi, "server", text, details);
}

// Standard 10-frame braille spinner — same sequence used by `ora`, `cli-spinners`,
// and Pi's own working indicator default. Renders cleanly in dim text.
const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let pendingTimer: ReturnType<typeof setInterval> | null = null;
let pendingFrame = 0;

// The spawned next child must survive session swaps (/new, /resume, /fork,
// /reload) and only die when pi itself exits. Pi re-evaluates this JS module
// on every swap, so a factory-scoped `let child` would be torn off the live
// process every time. Stash it on globalThis instead so the latest module
// instance can find (and on /quit, kill) it.
const CHILD_KEY = Symbol.for("agents-team-server-child");
function getChild(): ChildProcess | null {
	const stored = (globalThis as { [k: symbol]: unknown })[CHILD_KEY];
	return (stored as ChildProcess | undefined) ?? null;
}
function setChild(c: ChildProcess | null): void {
	(globalThis as { [k: symbol]: unknown })[CHILD_KEY] = c;
}

function stopPendingAnimation(): void {
	if (pendingTimer) {
		clearInterval(pendingTimer);
		pendingTimer = null;
	}
}

function setSrv(ctx: ExtensionContext | null, value: "ready" | "down" | "pending"): void {
	if (!ctx) return;
	try {
		if (value === "pending") {
			const tick = () => {
				const glyph = BRAILLE_FRAMES[pendingFrame % BRAILLE_FRAMES.length];
				pendingFrame++;
				try {
					ctx.ui.setStatus("3srv", `| SRV ${glyph}`);
				} catch {
					// status update failure must not kill the interval loop
				}
			};
			tick();
			if (!pendingTimer) {
				pendingTimer = setInterval(tick, 100);
				// Don't keep the Node process alive solely for this animation.
				pendingTimer.unref?.();
			}
			return;
		}
		stopPendingAnimation();
		// On "ready" the port number is the clearest signal — it doubles as
		// "the server is up" and "here's where to reach it". `✗` covers the
		// failure modes (no port to show then).
		const label = value === "ready" ? String(SERVER_PORT) : "✗";
		ctx.ui.setStatus("3srv", `| SRV ${label}`);
	} catch {
		// best-effort
	}
}

export default function (pi: ExtensionAPI): void {
	pi.registerMessageRenderer("server", createBoxRenderer());

	// Flipped to false when this module's runner is torn down. Guards against
	// the race where bringUp wakes up mid-flight after session_shutdown fired
	// and would otherwise double-spawn (the new module's bringUp may already
	// have spawned a child).
	let alive = true;

	async function bringUp(ctx: ExtensionContext): Promise<void> {
		// Port-bound first: covers both "another pi is serving" and "we already
		// spawned in this process during an earlier session". Makes /new
		// /resume /fork /reload cheap no-ops once the server is alive.
		if (await isPortBound(SERVER_PORT)) {
			setSrv(ctx, "ready");
			return;
		}
		if (!alive) return;

		if (!existsSync(SERVER_ROOT)) {
			surface(pi, `server: ${SERVER_ROOT} not found — run setup first`);
			setSrv(ctx, "down");
			return;
		}
		if (!existsSync(NEXT_BIN)) {
			surface(
				pi,
				`server: next binary missing — run \`cd ${SERVER_ROOT} && npm install\` first`,
			);
			setSrv(ctx, "down");
			return;
		}
		if (!IS_DEV && !existsSync(NEXT_BUILD_DIR)) {
			surface(
				pi,
				`server: production build missing — run \`bash scripts/setup.sh\` (or \`cd ${SERVER_ROOT} && npm run build\`) first`,
			);
			setSrv(ctx, "down");
			return;
		}

		// About to spawn — drive the pending spinner during the boot wait.
		setSrv(ctx, "pending");

		try {
			await mkdir(dirname(LOG_PATH), { recursive: true });
		} catch {
			// Best-effort; if mkdir fails we let the createWriteStream below
			// throw and surface the message in the catch handler.
		}
		if (!alive) return;
		// Final port check right before spawn — another module instance racing
		// us (e.g. an OLD bringUp resuming late after we already spawned) could
		// have bound the port between our first check and now.
		if (await isPortBound(SERVER_PORT)) {
			setSrv(ctx, "ready");
			return;
		}
		if (!alive) return;
		const log = createWriteStream(LOG_PATH, { flags: "a" });

		// Spawn Next directly. `npm run start`/`npm run dev` would interpose an
		// npm process that swallows SIGTERM, leaving orphan Next.js children
		// behind.
		//   prod: `next start` serves pre-built .next/ artifacts — fast cold
		//         start, no compile-on-request.
		//   dev : `next dev --webpack` enables hot reload and compiles on
		//         demand (first request is slow; pre-warm below absorbs it).
		const nextArgs = IS_DEV
			? [NEXT_BIN, "dev", "--webpack", "-p", String(SERVER_PORT)]
			: [NEXT_BIN, "start", "-p", String(SERVER_PORT)];
		const child = spawn("node", nextArgs, {
			cwd: SERVER_ROOT,
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		});
		setChild(child);
		child.stdout?.pipe(log);
		child.stderr?.pipe(log);
		child.on("error", (err) => {
			surface(pi, `server: spawn error — ${err.message}`);
			setSrv(ctx, "down");
		});

		// Poll up to 15s for the port to come up. With `next start` serving
		// pre-built artifacts, port-bound usually means ready — pre-warm `/`
		// anyway as a cheap belt-and-braces for the first user request.
		for (let i = 0; i < 30; i++) {
			if (await isPortBound(SERVER_PORT)) {
				await preWarm(SERVER_PORT);
				setSrv(ctx, "ready");
				return;
			}
			await new Promise((r) => setTimeout(r, 500));
		}
		surface(pi, `server: failed to start within 15s — tail ${LOG_PATH}`);
		setSrv(ctx, "down");
	}

	// Bring up on every session_start. Pi re-evaluates this module on /new,
	// /resume, /fork, and /reload, so the previous instance's child reference
	// is invisible from here — bringUp's port check is the source of truth
	// for "is the server already serving" and makes this idempotent.
	pi.on("session_start", (_event, ctx) => {
		// Fire-and-forget: detach the bring-up so Pi's TUI is interactive
		// immediately. Without this, the handler awaits up to 15s of port
		// polling before session_start resolves, freezing the TUI. Surfaces
		// from bringUp() can land after the user is already typing — fine.
		// Errors must not escape: an unhandled rejection on a detached
		// promise can crash the Pi process. Swallow here and route the
		// message through `surface` so it shows up in the TUI.
		bringUp(ctx).catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			surface(pi, `server: bring-up crashed — ${message}`);
			setSrv(ctx, "down");
		});
	});

	// Fires on *this* module's runner before pi tears it down. The server
	// child should outlive /reload, /new, /resume, /fork — only /quit kills
	// it. We stop the pending animation in every case so the dying module
	// doesn't leak a setInterval ticking against a stale ctx.
	pi.on("session_shutdown", async (event) => {
		alive = false;
		stopPendingAnimation();
		if (event.reason !== "quit") return;
		const child = getChild();
		if (!child || child.killed) return;
		child.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				if (child && !child.killed) child.kill("SIGKILL");
				resolve();
			}, 2000);
			timer.unref?.();
		});
		setChild(null);
	});

	// Process-level cleanup as belt-and-braces for abrupt exits (Ctrl-C, kill
	// -9). Registered once per node process via a globalThis sentinel —
	// otherwise every module reload would stack another listener. Synchronous
	// SIGTERM only; the SIGKILL fallback in session_shutdown can't run here
	// because `process.on("exit", …)` can't await timers.
	const CLEANUP_SENTINEL = Symbol.for("agents-team-server-process-cleanup");
	if (!(globalThis as { [k: symbol]: unknown })[CLEANUP_SENTINEL]) {
		(globalThis as { [k: symbol]: unknown })[CLEANUP_SENTINEL] = true;
		const cleanup = (): void => {
			stopPendingAnimation();
			const child = getChild();
			if (child && !child.killed) child.kill("SIGTERM");
		};
		process.on("exit", cleanup);
		process.on("SIGINT", cleanup);
		process.on("SIGTERM", cleanup);
	}
}
