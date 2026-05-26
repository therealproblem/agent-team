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
 *   setChatMenuButton, idempotent) → starts the webhook receiver and registers
 *   the public webhook → surfaces status. If TELEGRAM_ALLOWED_CHATS is empty after the bot is
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
 *   - before_agent_start: claim the Telegram-originated turn if the prompt carries our sigil.
 *   - agent_end: route the final assistant message back to Telegram.
 */

import {
	defineTool,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDotenv, reloadDotenv } from "../../lib/dotenv";
import { createBoxRenderer, surface as surfaceShared } from "../../lib/tui";
import { api } from "./api";
import {
	buildTelegramWebhookUrl,
	checkTelegramWebhookPublicUrlDns,
	explainTelegramSetWebhookFailure,
	getTelegramPublicUrlConfig,
	getTelegramWebhookSecret,
} from "./config";
import { parseAllowedChats, type DispatcherContext } from "./dispatcher";
import { onAgentEnd, onBeforeAgentStart, setCtx, shutdown as shutdownDriver } from "./driver";
import * as state from "./state";
import * as webhook from "./webhook";

loadDotenv();

// ---------- footer cell ----------

const FOOTER_KEY = "4tg";
const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

type TgState = "pending" | "ready" | "errored" | "off";

let pendingTimer: ReturnType<typeof setInterval> | null = null;
let pendingFrame = 0;

// Tracks the connect/disconnect notification we last delivered to allowlisted
// chats. Used by setTg to edge-trigger "(pi connected)" / "(pi disconnected)"
// when the footer state actually toggles. Stored on globalThis (process-level)
// so it survives Pi's module re-evaluation on /reload, /new, /resume, /fork —
// the Node process keeps running across those, and we want the new module to
// see the previous module's "connected" so it doesn't re-announce. Cleared
// implicitly when the process exits (after /quit).
const LAST_NOTIFIED_SENTINEL = Symbol.for(
	"agents-team-telegram-bot-last-notified",
);

function getLastNotifiedState():
	| "connected"
	| "disconnected"
	| undefined {
	return (globalThis as { [k: symbol]: unknown })[
		LAST_NOTIFIED_SENTINEL
	] as "connected" | "disconnected" | undefined;
}

function setLastNotifiedState(value: "connected" | "disconnected"): void {
	(globalThis as { [k: symbol]: unknown })[LAST_NOTIFIED_SENTINEL] = value;
}

// Wired up by the extension function on each module evaluation. Holds the
// closure that has access to dctx/acquiredLock and broadcasts via the Telegram
// API. setTg is module-level (called from the pending-frame timer too) so it
// can't see those closures directly — this indirection bridges them.
let notifyTransition: ((target: "connected" | "disconnected") => void) | undefined;

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

	// Edge-trigger Telegram notifications when the footer state actually
	// toggles between connected (●) and disconnected (✗/off). "pending" is an
	// in-flight state, not a real transition, so it's ignored. State lives on
	// globalThis (see LAST_NOTIFIED_SENTINEL above) so /reload doesn't
	// re-announce — the new module sees the prior "connected" and the
	// target===previous early-return kicks in. notifyTransition gates on
	// acquiredLock + writes the sentinel + broadcasts, so only the primary
	// process drives this side-effect.
	if (value === "pending") return;
	const target: "connected" | "disconnected" =
		value === "ready" ? "connected" : "disconnected";
	const previous = getLastNotifiedState();
	if (target === previous) return;
	// Don't fire "(pi disconnected)" before we've ever fired "(pi connected)"
	// in this process — a transient initial getMe/bringUp failure would
	// otherwise send the user a phantom disconnect they didn't expect a
	// counterpart for. State stays at `undefined` so a later successful
	// ready→ready transition still announces correctly.
	if (target === "disconnected" && previous === undefined) return;
	notifyTransition?.(target);
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

// ---------- telegram_send tool ----------

/**
 * Push a message to a Telegram chat via the bot. Works from any pi process
 * that has TELEGRAM_BOT_TOKEN in env — including subagent children, which
 * stay dormant for webhook receiving but share the same bot identity for outbound
 * sends. Telegram's sendMessage has no single-consumer constraint, so
 * parallel sends across processes are fine.
 *
 * Chat id resolution:
 *   1. Explicit `chat_id` arg (when caller knows the chat).
 *   2. `TELEGRAM_REPLY_CHAT_ID` env (spawner-injected for opt-in subagents).
 *   3. Otherwise, no-op — the tool returns a "skipped" result instead of
 *      blasting to the first allowlisted chat. Spawners that want a
 *      notification MUST set the env var (or the agent MUST pass chat_id).
 */
const telegramSend = defineTool({
	name: "telegram_send",
	label: "Telegram send",
	description: [
		"Send a one-off message to a Telegram chat through the project's bot.",
		"Use this when a subagent has a result the user should see in Telegram (e.g. PM posting a reply summary).",
		"If `chat_id` is omitted, falls back to the TELEGRAM_REPLY_CHAT_ID env var; if neither is set, the tool no-ops (does NOT broadcast).",
		"Text supports the same markdown-to-HTML conversion the bot uses for agent replies.",
	].join(" "),
	parameters: Type.Object({
		text: Type.String({
			description: "Message body. Markdown is converted to Telegram HTML. Max ~4000 chars per chunk (auto-split).",
		}),
		chat_id: Type.Optional(
			Type.Number({
				description: "Target chat id. Omit to use TELEGRAM_REPLY_CHAT_ID env var.",
			}),
		),
	}),
	async execute(_toolCallId, params) {
		const args = params as { text: string; chat_id?: number };
		const text = args.text?.trim();
		if (!text) {
			return { content: [{ type: "text", text: "(empty text — nothing sent)" }] };
		}
		if (!process.env.TELEGRAM_BOT_TOKEN) {
			return { content: [{ type: "text", text: "(no TELEGRAM_BOT_TOKEN — skipped)" }] };
		}

		let chatId: number | undefined = args.chat_id;
		if (chatId === undefined) {
			const env = process.env.TELEGRAM_REPLY_CHAT_ID;
			if (env) {
				const parsed = Number(env);
				if (Number.isFinite(parsed)) chatId = parsed;
			}
		}
		if (chatId === undefined) {
			return {
				content: [
					{ type: "text", text: "(no chat_id and no TELEGRAM_REPLY_CHAT_ID — skipped)" },
				],
			};
		}

		try {
			const ids = await api.sendMessage(chatId, text);
			return {
				content: [{ type: "text", text: `sent to ${chatId} (${ids.length} chunk(s))` }],
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				content: [{ type: "text", text: `telegram send failed: ${msg}` }],
				isError: true,
			};
		}
	},
});

// ---------- extension entry ----------

export default function (pi: ExtensionAPI): void {
	pi.registerMessageRenderer("telegram-bot", createBoxRenderer());
	pi.registerTool(telegramSend);

	let dctx: DispatcherContext | undefined;
	// Flipped to false when this module's runner is torn down (session_shutdown).
	// Guards against the race where session_start fires bringUp, /reload comes
	// in mid-flight, and the in-flight bringUp wakes up after tear-down and
	// starts a transport against an invalid `pi`.
	let alive = true;
	// True only on the primary instance (the one that acquired the receiver lock).
	// Subagents and non-primary processes leave this false so they don't send
	// connect/shutdown notices that the primary already covers.
	let acquiredLock = false;

	function broadcastConnectionStatus(text: string): void {
		if (!process.env.TELEGRAM_BOT_TOKEN) return;
		const chats =
			dctx?.allowedChats ?? parseAllowedChats(process.env.TELEGRAM_ALLOWED_CHATS);
		for (const chatId of chats) {
			api.sendMessage(chatId, text).catch(() => undefined);
		}
	}

	// Wire the module-level transition hook to this module instance's
	// closure. Only the primary process broadcasts; subagents and other
	// secondary processes stay silent so we don't duplicate notifications.
	// State is written only when we actually broadcast — a non-primary
	// observing the transition won't pin the sentinel, so the primary still
	// sees the prior value and can emit when its setTg fires.
	notifyTransition = (target) => {
		if (!acquiredLock) return;
		setLastNotifiedState(target);
		broadcastConnectionStatus(
			target === "connected" ? "(pi connected)" : "(pi disconnected)",
		);
	};

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
		reloadDotenv();
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
			const publicUrlConfig = getTelegramPublicUrlConfig();
			const dns = await checkTelegramWebhookPublicUrlDns(publicUrlConfig);
			if (!dns.ok) {
				const overrideHint = publicUrlConfig.fileValueDiffersFromActiveEnv
					? " The active environment value differs from .env; unset the shell-exported value or restart the shell if .env has the intended URL."
					: "";
				throw new Error(
					`${publicUrlConfig.key} is invalid for Telegram webhook delivery: configured host does not resolve in local DNS (${dns.code}); skipping Telegram setWebhook.${overrideHint}`,
				);
			}
			const secret = getTelegramWebhookSecret();
			const webhookUrl = buildTelegramWebhookUrl(publicUrlConfig.baseUrl, secret);
			if (!alive) return { ok: false, message: "torn down mid-bring-up" };
			await webhook.startWebhookReceiver(pi, dctx, (h) => setTg(ctx, h === "running" ? "ready" : "errored"));
			if (!alive) return { ok: false, message: "torn down mid-bring-up" };
			await api.setWebhook(webhookUrl, {
				secretToken: secret,
				allowedUpdates: ["message", "callback_query"],
				dropPendingUpdates: false,
			});
			setTg(ctx, "ready");
			return { ok: true, message: `webhook registered (@${botUsername})` };
		} catch (err) {
			const msg = explainTelegramSetWebhookFailure(err instanceof Error ? err.message : String(err));
			setTg(ctx, "errored");
			return { ok: false, message: `webhook start failed — ${msg}` };
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

			// Manual connect — claim primary BEFORE any setTg call so the
			// "(pi connected)" transition broadcast fires naturally via
			// notifyTransition when bringUp flips the footer to ready. Skip
			// if the session_start path already claimed it. tryAcquireReceiverLock
			// no-ops if another live PID owns it; in that case that other
			// process handles notifications and our setTg calls stay silent.
			if (!acquiredLock) {
				const forcePrimary = process.env.TELEGRAM_BOT_PRIMARY === "1";
				if (forcePrimary || state.tryAcquireReceiverLock()) {
					acquiredLock = true;
				}
			}

			// Always (re-)configure the bot side: register slash commands + Menu
			// button. Idempotent. Silent on success — the | TG ● footer cell
			// is the success indicator (and the broadcast goes out via the
			// ready transition below).
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
		// takes effect without a /telegram-connect retry. The receiver holds the
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
	// /new, /resume, /fork). That means module-level state (dctx, the receiver's
	// `running` flag, the driver's `latestCtx`, etc.) resets on every
	// transition. To keep the bot alive across these, we:
	//
	//   - On session_start (any reason): connect afresh if a token is set AND
	//     this is the primary Pi process (guarded by TELEGRAM_BOT_PRIMARY).
	//   - On session_shutdown (any reason): cleanly stop *this* module's receiver
	//     BEFORE the runtime is invalidated, so the dying module's dispatcher
	//     doesn't fire against a stale pi. The next module's session_start
	//     starts a fresh receiver with the new pi.
	pi.on("session_start", (event, ctx) => {
		setCtx(ctx);

		// Silent fast-path: no token → stay completely dormant. Slash commands
		// stay registered so the user can /telegram-setup later.
		if (!process.env.TELEGRAM_BOT_TOKEN) {
			setTg(ctx, "off");
			return;
		}

		// Guard: only one Pi process should run the Telegram webhook receiver at a time.
		// This prevents duplicate local receivers when:
		//   - Multiple Pi sessions run concurrently (tmux worktrees, manual spawns)
		//   - `pi --no-session` is invoked (server PM replies, cron, etc.)
		//   - Subagent spawns inherit the token but shouldn't receive
		//
		// We use a filesystem lock with PID tracking. The first process to start
		// acquires the lock; others skip webhook receiving. Stale locks (dead PID) are
		// automatically cleaned and re-acquired.
		//
		// Manual override: set TELEGRAM_BOT_PRIMARY=1 to force-acquire (useful
		// when debugging lock issues or if PID-check gives false negatives).
		const forcePrimary = process.env.TELEGRAM_BOT_PRIMARY === "1";
		const acquired = forcePrimary || state.tryAcquireReceiverLock();
		if (!acquired) {
			// Another live process holds the lock; stay dormant for webhook receiving but
			// keep API-send capability for tools like board_add_comment.
			setTg(ctx, "off");
			return;
		}

		// At this point: token is set AND we acquired the receiver lock.
		acquiredLock = true;
		// Only flash the "pending" spinner if we weren't already in a
		// connected state coming into this session_start. On /reload, /new,
		// /resume, /fork the previous module instance left the footer at
		// "| TG ●" and the globalThis sentinel at "connected" — overwriting
		// with the spinner just flickers "reconnecting" at the user for no
		// good reason; bringUp's setTg("ready") will see no transition and
		// the footer stays steady at ●. Fresh boot (no prior state) and
		// recovery-after-error (prior state "disconnected") both fall through
		// and do show the spinner since that's an honest indicator of work
		// in flight.
		if (getLastNotifiedState() !== "connected") {
			setTg(ctx, "pending");
		}

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

					// "(pi connected)" is no longer broadcast from here — the
					// setTg("ready") inside bringUp above edge-triggers it via
					// notifyTransition (which writes the globalThis sentinel
					// and sends the message). The globalThis tracker is what
					// keeps /reload/new/resume/fork from re-announcing: the
					// previous module-instance already pinned "connected", so
					// the new module's setTg("ready") becomes a no-op
					// (target===previous).
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
	// closure, so leaving the receiver running after invalidation makes
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
		const wasPrimary = acquiredLock;
		acquiredLock = false;
		stopPending();
		webhook.stopWebhookReceiver();

		// Release the receiver lock if this instance acquired it, so the next
		// module instance (on /reload, /new, /resume) can immediately re-acquire
		// without waiting. Without this,
		// session swaps within the same process leave the lock file pointing at
		// the current PID, and tryAcquireReceiverLock correctly treats "same PID,
		// fresh timestamp" as "held by another live module" → fails to acquire.
		if (wasPrimary) {
			state.releaseReceiverLock();
		}

		// Only the primary process (the one that owned the receiver lock) sends the
		// shutdown notice. Subagents and other non-primary processes inherit the
		// token but never brought up the bot — they have nothing to announce.
		if (event.reason === "quit" && wasPrimary && process.env.TELEGRAM_BOT_TOKEN) {
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
			setLastNotifiedState("disconnected");
		}

		shutdownDriver();
	});

	// Hook agent events so we can route Telegram-originated turns back.
	pi.on("before_agent_start", (event) => {
		onBeforeAgentStart(event.prompt);
	});

	pi.on("agent_end", (event) => {
		void onAgentEnd((event.messages as never) ?? []);
	});

	// Process-level cleanup as belt-and-braces for abrupt exits (Ctrl-C, kill
	// -9). Registered once per node process via a globalThis sentinel —
	// otherwise every module reload would stack another listener. The latest
	// module instance is the one whose receiver is actually live (previous
	// instances stopped themselves in session_shutdown).
	const CLEANUP_SENTINEL = Symbol.for("agents-team-telegram-bot-process-cleanup");
	if (!(globalThis as { [k: symbol]: unknown })[CLEANUP_SENTINEL]) {
		(globalThis as { [k: symbol]: unknown })[CLEANUP_SENTINEL] = true;
		const cleanup = (): void => {
			stopPending();
			webhook.stopWebhookReceiver();
			state.releaseReceiverLock();
		};
		process.on("exit", cleanup);
		process.on("SIGINT", cleanup);
		process.on("SIGTERM", cleanup);
	}
}
