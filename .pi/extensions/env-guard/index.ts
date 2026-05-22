/**
 * env-guard — strip any value from `.env` out of assistant text + outbound
 * tool args before they leave Pi.
 *
 * Defense in depth for a personal-vault setup where the same Pi session
 * holds a Telegram bot token, mlapi.run keys, and whatever else lives in
 * `.env`. The rule in SYSTEM.md tells the agent never to surface env
 * values; this extension enforces it.
 *
 * Two hooks:
 *   1. `message_end` for `role: "assistant"` — walks the message's TextContent
 *      / ThinkingContent / ToolCall arguments, replaces any literal occurrence
 *      of a known env secret with `[REDACTED]`, and returns the rewritten
 *      message via the `{ message }` result. Pi's contract guarantees the
 *      replacement is what's displayed and persisted in the session log.
 *   2. `tool_call` — mutates `event.input` in place so the same redaction
 *      hits arguments before the tool executes (catches leaks that travel
 *      via `telegram_send`, `board_add_comment`, etc.).
 *
 * What counts as a secret: every key=value in `.env` whose value is long
 * enough to be plausibly secret-shaped (length ≥ 8) and whose key is not on
 * the safe-to-surface allowlist below (paths, ports, public URLs, etc.).
 * Anything with TOKEN, KEY, SECRET, PASS, CREDENTIAL in the key name is
 * always redacted, even short ones.
 *
 * Secrets are rebuilt on every `session_start` (startup, reload, new,
 * resume, fork) so a `.env` edit followed by `/reload` takes effect without
 * restarting Pi.
 *
 * Not covered: secrets sourced from environment variables that aren't in
 * the `.env` file (shell-exported `ANTHROPIC_API_KEY` etc.). Add those keys
 * to ALWAYS_REDACT_KEYS or to your `.env` if you want them stripped too.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const REDACTED = "[REDACTED]";
const MIN_SECRET_LENGTH = 8;

/**
 * Env keys whose values are safe to surface in chat replies. Everything
 * else gets scrubbed.
 */
const SAFE_KEYS = new Set<string>([
	"AGENTS_TEAM_VAULT_PATH",
	"AGENTS_TEAM_SERVER_PATH",
	"AGENTS_TEAM_SERVER_PORT",
	"AGENTS_TEAM_SERVER_MODE",
	"AGENTS_TEAM_SERVER_TITLE",
	"AGENTS_TEAM_SERVER_PUBLIC_URL",
	"AGENTS_TEAM_CHROME_PATH",
	"AGENTS_TEAM_EXPORT_PATH",
	"AGENTS_TEAM_STATE_PATH",
	"AGENTS_TEAM_PM_REPLY_DEBOUNCE_MS",
	"TELEGRAM_LONG_POLL_TIMEOUT",
	"TELEGRAM_INLINE_KEYBOARDS",
	"NODE_ENV",
	"PATH",
	"HOME",
	"SHELL",
	"USER",
	"LANG",
	"LC_ALL",
	"TERM",
]);

/** Keys that always get redacted regardless of length. */
const ALWAYS_REDACT_PATTERNS: RegExp[] = [
	/TOKEN/i,
	/SECRET/i,
	/PASSWORD/i,
	/PASS$/i,
	/CREDENTIAL/i,
	/API[_-]?KEY/i,
	/PRIVATE[_-]?KEY/i,
	/^.*_KEY$/i,
];

/**
 * Keys that are *inferred* safe by naming convention, in addition to the
 * explicit SAFE_KEYS list. Anything containing `PUBLIC` is treated as
 * non-secret by design — that's the standard convention (e.g.
 * `NEXT_PUBLIC_*`, `*_PUBLIC_URL`). If you stash a secret in a
 * `*PUBLIC*` var you're fighting the convention; don't do that.
 *
 * The check fires *after* SAFE_KEYS but *before* ALWAYS_REDACT_PATTERNS,
 * so a key like `PUBLIC_TOKEN` would still be redacted (TOKEN trumps
 * PUBLIC — a public token is a contradiction, treat it as a secret).
 */
const SAFE_KEY_PATTERNS: RegExp[] = [
	/PUBLIC/i,
];

interface EnvSecret {
	key: string;
	value: string;
}

let secrets: EnvSecret[] = [];

function parseEnvFile(envPath: string): Record<string, string> {
	let text: string;
	try {
		text = readFileSync(envPath, "utf8");
	} catch {
		return {};
	}
	const out: Record<string, string> = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		const key = line.slice(0, eq).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

function matchesAlwaysRedact(key: string): boolean {
	return ALWAYS_REDACT_PATTERNS.some((p) => p.test(key));
}

function matchesSafePattern(key: string): boolean {
	return SAFE_KEY_PATTERNS.some((p) => p.test(key));
}

/**
 * Decide whether this env entry is safe to surface in chat replies.
 *
 * Precedence:
 *   1. ALWAYS_REDACT_PATTERNS — wins over everything ("PUBLIC_TOKEN" is
 *      still a secret).
 *   2. SAFE_KEYS — explicit allowlist for well-known infrastructure keys.
 *   3. SAFE_KEY_PATTERNS — naming-convention allowlist (`*PUBLIC*`).
 *   4. Length heuristic — values shorter than MIN_SECRET_LENGTH are not
 *      treated as secrets by default (too noisy to redact "true" / "8080" /
 *      "dev").
 */
function isSafeKey(key: string): boolean {
	if (matchesAlwaysRedact(key)) return false;
	if (SAFE_KEYS.has(key)) return true;
	if (matchesSafePattern(key)) return true;
	return false;
}

/**
 * Rebuild the secrets list from .env. Called on extension load and on every
 * session_start (which covers reload).
 */
function rebuildSecrets(): void {
	const envPath = join(process.cwd(), ".env");
	const parsed = parseEnvFile(envPath);
	const fresh: EnvSecret[] = [];
	for (const [key, value] of Object.entries(parsed)) {
		if (!value) continue;
		if (isSafeKey(key)) continue;
		// Otherwise: treat as a secret if the key matches a sensitive pattern,
		// or if the value is long enough to plausibly be one.
		const sensitive = matchesAlwaysRedact(key);
		if (!sensitive && value.length < MIN_SECRET_LENGTH) continue;
		fresh.push({ key, value });
	}
	// Longest first so substring replacement doesn't leave fragments behind
	// when one secret is a prefix of another.
	fresh.sort((a, b) => b.value.length - a.value.length);
	secrets = fresh;
}

/** Replace every secret substring in `s` with [REDACTED]. */
function scrubString(s: string): string {
	if (!s || secrets.length === 0) return s;
	let out = s;
	for (const { value } of secrets) {
		if (!out.includes(value)) continue;
		out = out.split(value).join(REDACTED);
	}
	return out;
}

/** Walk an arbitrary value tree, scrubbing every string. Mutates in place
 *  for objects and arrays so the original reference stays valid. */
function scrubInPlace(node: unknown): unknown {
	if (typeof node === "string") return scrubString(node);
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			node[i] = scrubInPlace(node[i]);
		}
		return node;
	}
	if (node && typeof node === "object") {
		const obj = node as Record<string, unknown>;
		for (const k of Object.keys(obj)) {
			obj[k] = scrubInPlace(obj[k]);
		}
		return obj;
	}
	return node;
}

/**
 * Produce a redacted copy of an assistant message. We don't mutate in
 * place because Pi may hold references to the original elsewhere (session
 * log, in-flight renderers); returning a fresh object keeps both truthful.
 *
 * Typed loosely (`any`-friendly walk over content blocks) because the
 * `AgentMessage` type isn't re-exported from `@earendil-works/pi-coding-agent`.
 * Pi's runtime guarantees the block shapes we discriminate on (text /
 * thinking / toolCall) per pi-ai's `AssistantMessage` definition.
 */
function redactAssistantMessage<M extends { role: string; content: any[] }>(message: M): M {
	if (message.role !== "assistant" || secrets.length === 0) return message;
	let changed = false;
	const newContent = message.content.map((block) => {
		if (block?.type === "text") {
			const scrubbed = scrubString(block.text);
			if (scrubbed === block.text) return block;
			changed = true;
			return { ...block, text: scrubbed };
		}
		if (block?.type === "thinking") {
			const scrubbed = scrubString(block.thinking);
			if (scrubbed === block.thinking) return block;
			changed = true;
			return { ...block, thinking: scrubbed };
		}
		if (block?.type === "toolCall") {
			// Deep-clone the arguments so we don't mutate the live object that
			// other extensions / the tool dispatcher may be reading.
			const cloned = JSON.parse(JSON.stringify(block.arguments));
			const before = JSON.stringify(cloned);
			scrubInPlace(cloned);
			if (JSON.stringify(cloned) === before) return block;
			changed = true;
			return { ...block, arguments: cloned };
		}
		return block;
	});
	if (!changed) return message;
	return { ...message, content: newContent };
}

export default function (pi: ExtensionAPI): void {
	rebuildSecrets();

	pi.on("session_start", () => {
		rebuildSecrets();
	});

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		if (secrets.length === 0) return;
		const redacted = redactAssistantMessage(event.message);
		if (redacted === event.message) return;
		return { message: redacted };
	});

	// Defense in depth: scrub tool arguments before execution. Catches cases
	// where the assistant tries to send a secret OUT via a tool (most
	// importantly `telegram_send` and `board_add_comment`, but also any
	// other custom tool that takes string content). Mutates event.input in
	// place per the ExtensionAPI contract.
	pi.on("tool_call", (event) => {
		if (secrets.length === 0) return;
		scrubInPlace(event.input);
	});
}
