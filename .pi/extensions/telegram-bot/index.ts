/**
 * telegram-bot — pi extension that bridges Telegram into the running pi
 * session.
 *
 * One slash command the user runs in the pi TUI to manage this extension:
 *
 *   /telegram-connect [token]
 *
 *     - With no arg and no TELEGRAM_BOT_TOKEN in env: prints instructions on
 *       how to get a token from @BotFather and re-invoke with it. Stops.
 *     - With a token arg: writes it to .env (atomic replace-or-append), then
 *       falls through to connect.
 *     - With a token in env (either from a previous /telegram-connect or
 *       already in .env): proceeds straight to connect.
 *
 *   Connect always: validates the token via getMe → registers the bot's
 *   slash commands and Menu button with Telegram (setMyCommands +
 *   setChatMenuButton, idempotent) → starts the long-poll transport →
 *   surfaces status. If TELEGRAM_ALLOWED_CHATS is empty after the bot is
 *   live, surfaces a bootstrap hint telling the user to DM the bot /start
 *   to get their chat_id.
 *
 * Boot policy:
 *   - On `session_start`, if TELEGRAM_BOT_TOKEN is not set, the extension
 *     stays completely silent (no surface, no footer cell) so it doesn't
 *     clutter the TUI for users who haven't opted in. The slash command
 *     stays registered so the user can opt in any time via
 *     /telegram-connect <token>.
 *   - If a token IS set, the extension brings itself up automatically.
 *
 * Pi event subscriptions:
 *   - before_agent_start: claim the loop if the prompt carries our sigil.
 *   - agent_end: route the final assistant message back to Telegram.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDotenv } from "../../lib/dotenv";
import { createBoxRenderer, surface as surfaceShared } from "../../lib/tui";
import { api } from "./api";
import { parseAllowedChats, type DispatcherContext } from "./dispatcher";
import * as loop from "./loop";
import { onAgentEnd, onBeforeAgentStart, setCtx, shutdown as shutdownDriver } from "./driver";

loadDotenv();

// ---------- footer cell ----------

const FOOTER_KEY = "4tg";
const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

type TgState = "pending" | "ready" | "errored" | "off";

let pendingTimer: ReturnType<typeof setInterval> | null = null;
let pendingFrame = 0;

function stopPending(): void {
	if (pendingTimer) {
		clearInterval(pendingTimer);
		pendingTimer = null;
	}
}

function setTg(ctx: ExtensionContext | undefined, value: TgState): void {
	if (!ctx) return;
	try {
		if (value === "off") {
			stopPending();
			ctx.ui.setStatus(FOOTER_KEY, undefined);
			return;
		}
		if (value === "pending") {
			const tick = () => {
				const glyph = BRAILLE_FRAMES[pendingFrame % BRAILLE_FRAMES.length];
				pendingFrame++;
				try {
					ctx.ui.setStatus(FOOTER_KEY, `| TG ${glyph}`);
				} catch {
					// don't crash the interval
				}
			};
			tick();
			if (!pendingTimer) {
				pendingTimer = setInterval(tick, 100);
				pendingTimer.unref?.();
			}
			return;
		}
		stopPending();
		const glyph = value === "ready" ? "●" : "✗";
		ctx.ui.setStatus(FOOTER_KEY, `| TG ${glyph}`);
	} catch {
		// best-effort
	}
}

// ---------- helpers ----------

function surface(pi: ExtensionAPI, text: string, details?: object): void {
	surfaceShared(pi, "telegram-bot", text, details);
}

function envPath(): string {
	return join(process.cwd(), ".env");
}

/**
 * Append or replace `<key>=<value>` in .env, atomically. Returns whether the
 * value changed.
 */
function writeEnvVar(key: string, value: string): boolean {
	if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`unsafe env key: ${key}`);
	const path = envPath();
	const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
	const re = new RegExp(`^${key}=.*$`, "m");
	let next: string;
	if (re.test(existing)) {
		next = existing.replace(re, `${key}=${value}`);
	} else {
		const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
		next = `${existing}${sep}${key}=${value}\n`;
	}
	if (next === existing) return false;
	writeFileSync(`${path}.tmp`, next);
	// atomic rename
	const { renameSync } = require("node:fs") as typeof import("node:fs");
	renameSync(`${path}.tmp`, path);
	return true;
}

// ---------- extension entry ----------

export default function (pi: ExtensionAPI): void {
	pi.registerMessageRenderer("telegram-bot", createBoxRenderer());

	let dctx: DispatcherContext | undefined;
	// Flipped to false when this module's runner is torn down (session_shutdown).
	// Guards against the race where session_start fires bringUp, /reload comes
	// in mid-flight, and the in-flight bringUp wakes up after tear-down and
	// starts a transport against an invalid `pi`.
	let alive = true;

	async function configureBot(): Promise<{
		ok: boolean;
		username?: string;
		commandCount?: number;
		error?: string;
	}> {
		try {
			const me = await api.getMe();
			if (!me.username) return { ok: false, error: "bot has no username (set one in @BotFather)" };
			const commands = buildBotCommands();
			await api.setMyCommands(commands);
			await api.setChatMenuButton();
			return { ok: true, username: me.username, commandCount: commands.length };
		} catch (err) {
			return { ok: false, error: err instanceof Error ? err.message : String(err) };
		}
	}

	/**
	 * Telegram's bot-level slash command menu (the Menu pill in the input
	 * bar). Kept intentionally minimal:
	 *
	 *   /start    — bot-only: bootstrap reply with the chat id
	 *   /stop     — bot-only: cancel the in-flight agent turn
	 *   /new      — rotate pi's session (Esc → C-c → "/new" → Enter via tmux
	 *               send-keys against $TMUX_PANE; see driver.handleControl)
	 *   /compact  — trigger pi's compaction with optional custom instructions
	 *
	 * /new and /compact only work when pi is running inside tmux (which the
	 * `tmux-host` extension guarantees for every interactive invocation).
	 * `pi.sendUserMessage()` can't invoke pi's built-in slash commands —
	 * it hard-codes `expandPromptTemplates: false` — so we type them into
	 * pi's own pane instead.
	 */
	function buildBotCommands(): { command: string; description: string }[] {
		return [
			{ command: "start", description: "show this chat's id / onboarding info" },
			{ command: "stop", description: "cancel the in-flight agent turn" },
			{ command: "new", description: "start a fresh pi session" },
			{ command: "compact", description: "compact pi's context (optionally /compact <focus>)" },
		];
	}

	async function bringUp(ctx: ExtensionContext): Promise<{ ok: boolean; message?: string }> {
		const token = process.env.TELEGRAM_BOT_TOKEN;
		if (!token) {
			return { ok: false, message: "TELEGRAM_BOT_TOKEN not set — run /telegram-setup first" };
		}

		const allowedChats = parseAllowedChats(process.env.TELEGRAM_ALLOWED_CHATS);
		// Allowlist may be empty at first run — bot still boots so /start can
		// reply to a DM with the chat_id for bootstrapping. Other messages will
		// be ignored until the user adds at least one chat id.

		let me;
		try {
			me = await api.getMe();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setTg(ctx, "errored");
			return { ok: false, message: `getMe failed — ${msg}` };
		}
		const botUsername = me.username ?? "";
		if (!botUsername) {
			setTg(ctx, "errored");
			return { ok: false, message: "bot has no username (set one in @BotFather)" };
		}

		dctx = { allowedChats, botUsername };

		if (!alive) return { ok: false, message: "torn down mid-bring-up" };

		try {
			// Clear any stale webhook registered by an earlier build that supported webhook mode.
			// Failure is non-fatal — the loop's reactive 409 recovery will retry — but surface
			// it so a real outage (network, auth) doesn't hide behind a silent swallow.
			try {
				await api.deleteWebhook();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				surface(pi, `telegram-bot: deleteWebhook at startup failed — ${msg} (will retry on first 409)`);
			}
			if (!alive) return { ok: false, message: "torn down mid-bring-up" };
			if (!loop.isRunning()) {
				void loop.start(pi, dctx, (h) => setTg(ctx, h === "running" ? "ready" : "errored"));
			}
			setTg(ctx, "ready");
			return { ok: true, message: `long-poll started (@${botUsername})` };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setTg(ctx, "errored");
			return { ok: false, message: `long-poll start failed — ${msg}` };
		}
	}

	// ---------- slash command ----------

	pi.registerCommand("telegram-connect", {
		description: "Set the Telegram bot token (if needed) and connect",

		async handler(args, ctx) {
			setCtx(ctx);

			const argToken = args.trim();

			// If a token was passed as arg, write it. This is the path used both
			// for first-time setup and for rotating an existing token.
			if (argToken) {
				if (!/^\d+:[A-Za-z0-9_-]+$/.test(argToken)) {
					surface(
						pi,
						`telegram-connect: that doesn't look like a bot token. Expected "<digits>:<chars>".`,
					);
					return;
				}
				try {
					writeEnvVar("TELEGRAM_BOT_TOKEN", argToken);
					process.env.TELEGRAM_BOT_TOKEN = argToken;
					surface(pi, "telegram-connect: token written to .env");
				} catch (err) {
					surface(pi, `telegram-connect: writing .env failed — ${(err as Error).message}`);
					return;
				}
			}

			// Still no token (no arg, none in env): surface instructions and
			// open an input prompt so the user can paste the token directly.
			if (!process.env.TELEGRAM_BOT_TOKEN) {
				surface(
					pi,
					[
						"telegram-connect: no token set.",
						"",
						"To get one, open Telegram and talk to @BotFather:",
						"  1. /newbot — pick a name and username",
						"  2. Copy the token it gives you",
						"  3. (Optional, for groups) /setprivacy → Disable",
						"",
						"Paste the token into the prompt below (or leave blank to skip).",
					].join("\n"),
				);

				if (!ctx.hasUI) {
					// Non-interactive mode (print, RPC). Tell the user how to retry.
					surface(pi, "telegram-connect: no UI — re-run with `/telegram-connect <token>`.");
					return;
				}

				let entered: string | undefined;
				try {
					entered = await ctx.ui.input("Paste bot token", "123456:ABC-DEF...");
				} catch {
					return;
				}
				const pasted = (entered ?? "").trim();
				if (pasted.length === 0) {
					surface(pi, "telegram-connect: no token entered — extension stays dormant");
					return;
				}
				if (!/^\d+:[A-Za-z0-9_-]+$/.test(pasted)) {
					surface(
						pi,
						`telegram-connect: that doesn't look like a bot token. Expected "<digits>:<chars>". Run /telegram-connect again to retry.`,
					);
					return;
				}
				try {
					writeEnvVar("TELEGRAM_BOT_TOKEN", pasted);
					process.env.TELEGRAM_BOT_TOKEN = pasted;
					surface(pi, "telegram-connect: token written to .env");
				} catch (err) {
					surface(pi, `telegram-connect: writing .env failed — ${(err as Error).message}`);
					return;
				}
			}

			// Always (re-)configure the bot side: register slash commands + Menu
			// button. Idempotent. Silent on success — the | TG ● footer cell
			// is the success indicator.
			setTg(ctx, "pending");
			const cfg = await configureBot();
			if (!cfg.ok) {
				surface(pi, `telegram-connect: bot config failed — ${cfg.error}`);
				setTg(ctx, "errored");
				return;
			}

			const result = await bringUp(ctx);
			if (!result.ok) {
				surface(pi, `telegram-connect: ${result.message ?? "failed"}`);
				return;
			}

			await surfaceConnected(ctx, cfg.username ?? "?");
		},
	});

	/**
	 * After a successful connect, stay silent if the allowlist is already
	 * populated (the | TG ● footer cell is the success indicator). When the
	 * allowlist is empty, surface guidance and open an interactive prompt for
	 * the user to enter their chat id(s).
	 */
	async function surfaceConnected(
		ctx: ExtensionContext,
		botUsername: string,
	): Promise<void> {
		const allowedChats = parseAllowedChats(process.env.TELEGRAM_ALLOWED_CHATS);
		if (allowedChats.size > 0) return;

		surface(
			pi,
			[
				"TELEGRAM_ALLOWED_CHATS is empty — no chats can talk to the bot yet.",
				"",
				`To get a chat id: open Telegram, DM @${botUsername} (or add it to a group)`,
				"and send /start. The bot will reply with that chat's id. Paste it into the",
				"prompt below (or leave blank to skip; you can run /telegram-connect again later).",
			].join("\n"),
		);

		if (!ctx.hasUI) return; // print mode etc.

		let entered: string | undefined;
		try {
			entered = await ctx.ui.input(
				"Enter chat id(s) — comma-separated for multiple",
				"-1001234567890",
			);
		} catch {
			// dialog dismissed
			return;
		}

		const value = (entered ?? "").trim();
		if (value.length === 0) {
			surface(pi, "telegram-bot: no chat id entered — leaving allowlist empty");
			return;
		}

		// Accept comma- or whitespace-separated ids; normalise to a canonical
		// comma-separated string. Validate each as integer (chat ids are signed
		// 64-bit ints; negative for groups/supergroups, positive for users).
		const tokens = value.split(/[,\s]+/).filter((t) => t.length > 0);
		const bad = tokens.filter((t) => !/^-?\d+$/.test(t));
		if (bad.length > 0) {
			surface(
				pi,
				`telegram-bot: invalid chat id(s): ${bad.join(", ")} — expected integers. Try /telegram-connect again.`,
			);
			return;
		}

		const merged = mergeAllowedChats(process.env.TELEGRAM_ALLOWED_CHATS, tokens);
		try {
			writeEnvVar("TELEGRAM_ALLOWED_CHATS", merged);
			process.env.TELEGRAM_ALLOWED_CHATS = merged;
		} catch (err) {
			surface(pi, `telegram-bot: writing .env failed — ${(err as Error).message}`);
			return;
		}

		// Push the new allowlist into the live dispatcher context so the change
		// takes effect without a /telegram-connect retry. The loop holds the
		// same dctx object by reference; mutating in place is enough.
		const next = parseAllowedChats(merged);
		if (dctx) {
			dctx.allowedChats.clear();
			for (const id of next) dctx.allowedChats.add(id);
		}

		surface(
			pi,
			`telegram-bot: allowlist updated — ${next.size} chat${next.size === 1 ? "" : "s"} now allowed (.env: TELEGRAM_ALLOWED_CHATS=${merged})`,
		);
	}

	/**
	 * Merge new chat ids into an existing comma-separated env value,
	 * deduplicating and preserving the original order followed by new entries.
	 */
	function mergeAllowedChats(current: string | undefined, additions: string[]): string {
		const seen = new Set<string>();
		const out: string[] = [];
		const push = (id: string): void => {
			if (seen.has(id)) return;
			seen.add(id);
			out.push(id);
		};
		(current ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter((s) => /^-?\d+$/.test(s))
			.forEach(push);
		additions.forEach(push);
		return out.join(",");
	}

	// ---------- lifecycle ----------

	// Pi re-evaluates extension JS modules on every session swap (/reload,
	// /new, /resume, /fork). That means module-level state (dctx, the loop's
	// `running` flag, the driver's `latestCtx`, etc.) resets on every
	// transition. To keep the bot alive across these, we:
	//
	//   - On session_start (any reason): connect afresh if a token is set.
	//   - On session_shutdown (any reason): cleanly stop *this* module's loop
	//     BEFORE the runtime is invalidated, so the dying module's dispatcher
	//     doesn't fire against a stale pi. The next module's session_start
	//     starts a fresh loop with the new pi.
	pi.on("session_start", (_event, ctx) => {
		setCtx(ctx);

		// Silent fast-path: no token → stay completely dormant. Slash commands
		// stay registered so the user can /telegram-setup later.
		if (!process.env.TELEGRAM_BOT_TOKEN) {
			setTg(ctx, "off");
			return;
		}

		setTg(ctx, "pending");

		void (async () => {
			// Retry transient network failures: laptop wake-from-sleep, DNS not
			// yet resolved, brief offline window. Auth and "no username" errors
			// won't be fixed by waiting — give up on those immediately.
			const BACKOFFS_MS = [1_000, 4_000, 16_000];
			const isTransient = (msg: string): boolean =>
				/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|getaddrinfo|socket hang up/i.test(
					msg,
				);

			for (let attempt = 0; ; attempt++) {
				if (!alive) return;
				try {
					const cfg = await configureBot();
					if (!cfg.ok) {
						if (attempt < BACKOFFS_MS.length && isTransient(cfg.error ?? "")) {
							const waitMs = BACKOFFS_MS[attempt];
							surface(
								pi,
								`telegram-bot: config failed — ${cfg.error} (retrying in ${Math.round(waitMs / 1000)}s)`,
							);
							await new Promise((r) => setTimeout(r, waitMs));
							continue;
						}
						surface(pi, `telegram-bot: config failed — ${cfg.error}`);
						setTg(ctx, "errored");
						return;
					}
					const r = await bringUp(ctx);
					if (!r.ok) {
						surface(pi, `telegram-bot: ${r.message ?? "bring-up failed"}`);
						return;
					}
					await surfaceConnected(ctx, cfg.username ?? "?");
					return;
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					if (attempt < BACKOFFS_MS.length && isTransient(msg)) {
						const waitMs = BACKOFFS_MS[attempt];
						surface(
							pi,
							`telegram-bot: bring-up crashed — ${msg} (retrying in ${Math.round(waitMs / 1000)}s)`,
						);
						await new Promise((r) => setTimeout(r, waitMs));
						continue;
					}
					surface(pi, `telegram-bot: bring-up crashed — ${msg}`);
					setTg(ctx, "errored");
					return;
				}
			}
		})();
	});

	// Fires on *this* module's runner before pi tears it down (for any reason:
	// quit, reload, new, resume, fork). The dispatcher captures `pi` in its
	// closure, so leaving the loop running after invalidation makes
	// `pi.sendUserMessage` throw on the next incoming update. Stop cleanly here.
	//
	// On `quit` only (the actual process exit — session swaps keep pi alive),
	// fire a heads-up to every allowlisted chat before tear-down so users on
	// Telegram learn the agent went offline. Pi awaits async session_shutdown
	// handlers via `runtimeHost.dispose()` before calling `process.exit(0)`,
	// so the send completes before pi exits. Bounded by a tight timeout —
	// a network outage at shutdown shouldn't hang pi.
	pi.on("session_shutdown", async (event) => {
		alive = false;
		stopPending();
		loop.stop();

		if (event.reason === "quit" && process.env.TELEGRAM_BOT_TOKEN) {
			const chats =
				dctx?.allowedChats ?? parseAllowedChats(process.env.TELEGRAM_ALLOWED_CHATS);
			if (chats.size > 0) {
				const SHUTDOWN_NOTICE_TIMEOUT_MS = 4_000;
				const sends = Array.from(chats).map((chatId) =>
					api.sendMessage(chatId, "(pi shut down)").catch(() => undefined),
				);
				await Promise.race([
					Promise.all(sends),
					new Promise<void>((resolve) => {
						const timer = setTimeout(resolve, SHUTDOWN_NOTICE_TIMEOUT_MS);
						timer.unref?.();
					}),
				]);
			}
		}

		shutdownDriver();
	});

	// Hook agent loop events so we can route Telegram-originated turns back.
	pi.on("before_agent_start", (event) => {
		onBeforeAgentStart(event.prompt);
	});

	pi.on("agent_end", (event) => {
		void onAgentEnd((event.messages as never) ?? []);
	});

	// Process-level cleanup as belt-and-braces for abrupt exits (Ctrl-C, kill
	// -9). Registered once per node process via a globalThis sentinel —
	// otherwise every module reload would stack another listener. The latest
	// module instance is the one whose loop is actually live (previous
	// instances stopped themselves in session_shutdown).
	const CLEANUP_SENTINEL = Symbol.for("agents-team-telegram-bot-process-cleanup");
	if (!(globalThis as { [k: symbol]: unknown })[CLEANUP_SENTINEL]) {
		(globalThis as { [k: symbol]: unknown })[CLEANUP_SENTINEL] = true;
		const cleanup = (): void => {
			stopPending();
			loop.stop();
		};
		process.on("exit", cleanup);
		process.on("SIGINT", cleanup);
		process.on("SIGTERM", cleanup);
	}
}
