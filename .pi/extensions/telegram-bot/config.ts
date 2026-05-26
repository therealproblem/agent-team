import { createHash, randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
type ErrnoLike = Error & { code?: string };
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_LOCAL_PORT = 8765;
const SECRET_KEY = "TELEGRAM_WEBHOOK_SECRET";

type PublicUrlConfigKey = "TELEGRAM_WEBHOOK_URL" | "AGENTS_TEAM_SERVER_PUBLIC_URL";

type PublicUrlConfigSource = "dotenv" | "process_env" | "process_env_overrides_dotenv";

type PublicUrlConfig = {
	key: PublicUrlConfigKey;
	baseUrl: string;
	fileValueDiffersFromActiveEnv: boolean;
	source: PublicUrlConfigSource;
};

export type TelegramWebhookRedactedDiagnostics = {
	configured: boolean;
	key?: PublicUrlConfigKey;
	source?: PublicUrlConfigSource;
	schemePresent: boolean;
	scheme?: string;
	hostnameLength?: number;
	pathPresent: boolean;
	urlFingerprint?: string;
	hostFingerprint?: string;
	fileValueDiffersFromActiveEnv?: boolean;
};

export type TelegramWebhookDnsPreflightResult =
	| { ok: true }
	| { ok: false; code: string };

function envPath(): string {
	return join(process.cwd(), ".env");
}

function readDotenvValue(key: string): string | undefined {
	let text: string;
	try {
		text = readFileSync(envPath(), "utf8");
	} catch {
		return undefined;
	}
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		if (line.slice(0, eq).trim() !== key) continue;
		let value = line.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		return value;
	}
	return undefined;
}

function writeEnvVar(key: string, value: string): void {
	if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`unsafe env key: ${key}`);
	const path = envPath();
	const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
	const re = new RegExp(`^${key}=.*$`, "m");
	const next = re.test(existing)
		? existing.replace(re, `${key}=${value}`)
		: `${existing}${existing.length > 0 && !existing.endsWith("\n") ? "\n" : ""}${key}=${value}\n`;
	if (next === existing) return;
	writeFileSync(`${path}.tmp`, next);
	renameSync(`${path}.tmp`, path);
}

export function getTelegramWebhookSecret(): string {
	const existing = process.env[SECRET_KEY]?.trim();
	if (existing) return existing;
	const generated = randomBytes(32).toString("base64url");
	writeEnvVar(SECRET_KEY, generated);
	process.env[SECRET_KEY] = generated;
	return generated;
}

export function getTelegramWebhookLocalPort(): number {
	const raw = process.env.TELEGRAM_WEBHOOK_LOCAL_PORT?.trim();
	if (!raw) return DEFAULT_LOCAL_PORT;
	const port = Number(raw);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		throw new Error("TELEGRAM_WEBHOOK_LOCAL_PORT must be an integer between 1 and 65535");
	}
	return port;
}

function safeWebhookUrlError(key: string, reason: string): Error {
	return new Error(`${key} is invalid for Telegram webhook delivery: ${reason}`);
}

function requireHttpsOrigin(key: string, raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) throw safeWebhookUrlError(key, "value is empty");
	if (trimmed !== raw) {
		throw safeWebhookUrlError(key, "remove leading/trailing whitespace or newlines");
	}
	if (/^['"]|['"]$/.test(trimmed)) {
		throw safeWebhookUrlError(key, "remove literal quote characters around the URL");
	}
	if (!/^https?:\/\//i.test(trimmed)) {
		throw safeWebhookUrlError(key, "include an https:// scheme");
	}

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw safeWebhookUrlError(key, "must be a valid public HTTPS URL");
	}
	if (url.protocol !== "https:") {
		throw safeWebhookUrlError(key, "must use https://, not http://");
	}
	if (!url.hostname || /^(https?|www)$/i.test(url.hostname)) {
		throw safeWebhookUrlError(key, "host looks malformed; check for a duplicated scheme such as https://https://...");
	}
	if (/[<>]/.test(trimmed) || /(^|[.-])your-cloudflare-tunnel([.-]|$)/i.test(url.hostname)) {
		throw safeWebhookUrlError(key, "replace the placeholder host with your real public tunnel host");
	}
	if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(url.hostname)) {
		throw safeWebhookUrlError(key, "host must be public, not localhost");
	}
	if (!url.hostname.includes(".")) {
		throw safeWebhookUrlError(key, "host must be a resolvable public DNS name");
	}
	return url.origin;
}

function fileValueDiffersFromActiveEnv(key: string, active: string): boolean {
	const fileValue = readDotenvValue(key);
	return typeof fileValue === "string" && fileValue !== active;
}

function detectConfigSource(key: string, active: string): PublicUrlConfigSource {
	const fileValue = readDotenvValue(key);
	if (typeof fileValue !== "string") return "process_env";
	if (fileValue === active) return "dotenv";
	return "process_env_overrides_dotenv";
}

function configFor(key: PublicUrlConfigKey, raw: string): PublicUrlConfig {
	return {
		key,
		baseUrl: requireHttpsOrigin(key, raw),
		fileValueDiffersFromActiveEnv: fileValueDiffersFromActiveEnv(key, raw),
		source: detectConfigSource(key, raw),
	};
}

export function getTelegramPublicUrlConfig(): PublicUrlConfig {
	const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
	if (webhookUrl?.trim()) return configFor("TELEGRAM_WEBHOOK_URL", webhookUrl);

	const serverPublicUrl = process.env.AGENTS_TEAM_SERVER_PUBLIC_URL;
	if (serverPublicUrl?.trim()) return configFor("AGENTS_TEAM_SERVER_PUBLIC_URL", serverPublicUrl);

	throw new Error("TELEGRAM_WEBHOOK_URL or AGENTS_TEAM_SERVER_PUBLIC_URL must be set to a public HTTPS URL for Telegram webhook delivery");
}

export function requireTelegramPublicUrl(): string {
	return getTelegramPublicUrlConfig().baseUrl;
}

function shortFingerprint(input: string): string {
	return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

function normalizeUrlForFingerprint(raw: string): string | undefined {
	try {
		const url = new URL(raw.trim());
		url.hash = "";
		url.search = "";
		return url.toString().replace(/\/+$/, "").toLowerCase();
	} catch {
		return undefined;
	}
}

export function getTelegramWebhookRedactedDiagnostics(config?: PublicUrlConfig): TelegramWebhookRedactedDiagnostics {
	let activeConfig = config;
	try {
		activeConfig = activeConfig ?? getTelegramPublicUrlConfig();
	} catch {
		const raw = process.env.TELEGRAM_WEBHOOK_URL || process.env.AGENTS_TEAM_SERVER_PUBLIC_URL || "";
		return {
			configured: Boolean(raw.trim()),
			schemePresent: /^https?:\/\//i.test(raw.trim()),
			pathPresent: false,
		};
	}

	const raw = process.env[activeConfig.key] ?? activeConfig.baseUrl;
	const normalized = normalizeUrlForFingerprint(activeConfig.baseUrl) ?? activeConfig.baseUrl.toLowerCase();
	const url = new URL(activeConfig.baseUrl);
	return {
		configured: true,
		key: activeConfig.key,
		source: activeConfig.source,
		schemePresent: /^https?:\/\//i.test(raw.trim()),
		scheme: url.protocol.replace(/:$/, ""),
		hostnameLength: url.hostname.length,
		pathPresent: (() => {
			try {
				return new URL(raw.trim()).pathname.replace(/\/+$/, "") !== "";
			} catch {
				return false;
			}
		})(),
		urlFingerprint: shortFingerprint(normalized),
		hostFingerprint: shortFingerprint(url.hostname.toLowerCase()),
		fileValueDiffersFromActiveEnv: activeConfig.fileValueDiffersFromActiveEnv,
	};
}

export function formatTelegramWebhookRedactedDiagnostics(diag: TelegramWebhookRedactedDiagnostics): string {
	if (!diag.configured) {
		return `configured=no scheme_present=${diag.schemePresent ? "yes" : "no"} path_present=${diag.pathPresent ? "yes" : "no"}`;
	}
	return [
		"configured=yes",
		`key=${diag.key}`,
		`source=${diag.source}`,
		`scheme_present=${diag.schemePresent ? "yes" : "no"}`,
		`scheme=${diag.scheme ?? "unknown"}`,
		`hostname_length=${diag.hostnameLength ?? "unknown"}`,
		`path_present=${diag.pathPresent ? "yes" : "no"}`,
		`url_fp=${diag.urlFingerprint ?? "unknown"}`,
		`host_fp=${diag.hostFingerprint ?? "unknown"}`,
		`env_overrides_dotenv=${diag.fileValueDiffersFromActiveEnv ? "yes" : "no"}`,
	].join(" ");
}

function sanitizeDnsErrorCode(err: unknown): string {
	const raw = err instanceof Error && "code" in err ? String((err as ErrnoLike).code) : "DNS_LOOKUP_FAILED";
	return /^[A-Z0-9_]+$/.test(raw) ? raw : "DNS_LOOKUP_FAILED";
}

export async function checkTelegramWebhookPublicUrlDns(config: PublicUrlConfig): Promise<TelegramWebhookDnsPreflightResult> {
	const hostname = new URL(config.baseUrl).hostname;
	const resolver = new Resolver();
	resolver.setServers(["1.1.1.1", "8.8.8.8"]);
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			resolver.resolve(hostname).catch((err) => {
				const code = sanitizeDnsErrorCode(err);
				if (code === "ENODATA" || code === "ENOTFOUND") return resolver.resolve6(hostname);
				throw err;
			}),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => {
					resolver.cancel();
					reject(Object.assign(new Error("DNS timeout"), { code: "DNS_TIMEOUT" }));
				}, 8000);
			}),
		]);
		return { ok: true };
	} catch (err) {
		return { ok: false, code: sanitizeDnsErrorCode(err) };
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export async function validateTelegramWebhookPublicUrl(config: PublicUrlConfig): Promise<void> {
	const dns = await checkTelegramWebhookPublicUrlDns(config);
	if (!dns.ok) {
		const overrideHint = config.fileValueDiffersFromActiveEnv
			? " The active environment value differs from .env; unset the shell-exported value or restart the shell if .env has the intended URL."
			: "";
		throw safeWebhookUrlError(
			config.key,
			`configured host does not resolve in local DNS (${dns.code}); skipping Telegram setWebhook.${overrideHint}`,
		);
	}
}

export function buildTelegramWebhookUrl(publicBaseUrl: string, secret: string): string {
	return `${publicBaseUrl.replace(/\/+$/, "")}/api/telegram/webhook/${encodeURIComponent(secret)}`;
}

export function explainTelegramSetWebhookFailure(message: string): string {
	if (/bad webhook/i.test(message) && /failed to resolve host|name or service not known|host/i.test(message)) {
		return `${message} — Telegram could not resolve the configured webhook host. Check TELEGRAM_WEBHOOK_URL for a real public DNS host, no duplicated scheme, no placeholder, and no extra quotes/whitespace. If .env was updated but this persists, unset any shell-exported TELEGRAM_WEBHOOK_URL that may be overriding .env.`;
	}
	return message;
}
