import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTelegramWebhookUrl, formatTelegramWebhookRedactedDiagnostics, getTelegramPublicUrlConfig, getTelegramWebhookRedactedDiagnostics, getTelegramWebhookSecret, requireTelegramPublicUrl, validateTelegramWebhookPublicUrl } from "./config";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
	if (condition) {
		console.log(`  ✓ ${message}`);
		passed++;
	} else {
		console.error(`  ❌ FAIL: ${message}`);
		failed++;
	}
}

async function withTempCwd<T>(fn: () => Promise<T> | T): Promise<T> {
	const oldCwd = process.cwd();
	const dir = mkdtempSync(join(tmpdir(), "tg-webhook-test-"));
	process.chdir(dir);
	try {
		return await fn();
	} finally {
		process.chdir(oldCwd);
		rmSync(dir, { recursive: true, force: true });
	}
}

async function readReq(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8");
}

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): Promise<{ server: Server; port: number }> {
	const server = createServer((req, res) => void handler(req, res));
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return { server, port: (server.address() as { port: number }).port };
}

async function closeServer(server: Server): Promise<void> {
	await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function postPublicRoute(secretParam: string, headerSecret: string | undefined, body: unknown): Promise<Response> {
	const mod = await import("../../server/app/api/telegram/webhook/[secret]/route.ts");
	return mod.POST(
		new Request(`https://example.test/api/telegram/webhook/${secretParam}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(headerSecret ? { "x-telegram-bot-api-secret-token": headerSecret } : {}),
			},
			body: JSON.stringify(body),
		}),
		{ params: Promise.resolve({ secret: secretParam }) },
	);
}

console.log("Testing Telegram webhook transport...\n");

const startupSource = `${readFileSync(new URL("./index.ts", import.meta.url), "utf8")}\n${readFileSync(new URL("./webhook.ts", import.meta.url), "utf8")}`;
assert(!startupSource.includes("webhook URL diagnostics"), "normal startup does not print webhook URL diagnostics");
assert(!startupSource.includes("webhook DNS preflight"), "normal startup does not print DNS preflight status");
assert(!startupSource.includes("webhook receiver listening"), "normal startup does not print local receiver listening status");

await withTempCwd(async () => {
	delete process.env.TELEGRAM_WEBHOOK_SECRET;
	const secret = getTelegramWebhookSecret();
	assert(secret.length > 20, "webhook secret is generated when missing");
	const env = readFileSync(".env", "utf8");
	assert(env.includes("TELEGRAM_WEBHOOK_SECRET="), "generated secret is persisted to .env");

	process.env.TELEGRAM_WEBHOOK_URL = "https://webhook.example.com/path";
	process.env.AGENTS_TEAM_SERVER_PUBLIC_URL = "https://agents.example.com/path";
	assert(requireTelegramPublicUrl() === "https://webhook.example.com", "Telegram webhook URL overrides and normalizes HTTPS origin");
	const webhookConfig = getTelegramPublicUrlConfig();
	assert(webhookConfig.key === "TELEGRAM_WEBHOOK_URL", "Telegram webhook URL config records the active env key");
	const diagnostics = formatTelegramWebhookRedactedDiagnostics(getTelegramWebhookRedactedDiagnostics(webhookConfig));
	assert(diagnostics.includes("configured=yes") && diagnostics.includes("source=process_env") && diagnostics.includes("hostname_length=19") && diagnostics.includes("path_present=yes"), "redacted diagnostics include structure and source");
	assert(!diagnostics.includes("webhook.example.com") && !diagnostics.includes("/path"), "redacted diagnostics do not echo URL or host");
	assert(buildTelegramWebhookUrl("https://webhook.example.com/", secret).includes(`/api/telegram/webhook/${encodeURIComponent(secret)}`), "webhook registration URL uses public base and path secret");

	delete process.env.TELEGRAM_WEBHOOK_URL;
	assert(requireTelegramPublicUrl() === "https://agents.example.com", "server public URL remains fallback for Telegram webhook delivery");

	delete process.env.AGENTS_TEAM_SERVER_PUBLIC_URL;
	try {
		requireTelegramPublicUrl();
		assert(false, "missing public URL throws");
	} catch (err) {
		assert((err as Error).message.includes("TELEGRAM_WEBHOOK_URL"), "missing public URL has clear error");
	}
	process.env.TELEGRAM_WEBHOOK_URL = "http://agents.example.com";
	try {
		requireTelegramPublicUrl();
		assert(false, "non-HTTPS public URL throws");
	} catch (err) {
		assert((err as Error).message.includes("TELEGRAM_WEBHOOK_URL") && (err as Error).message.includes("https://"), "non-HTTPS webhook URL has clear error");
	}

	process.env.TELEGRAM_WEBHOOK_URL = "https://https://agents.example.com";
	try {
		requireTelegramPublicUrl();
		assert(false, "duplicated scheme webhook URL throws");
	} catch (err) {
		const message = (err as Error).message;
		assert(message.includes("TELEGRAM_WEBHOOK_URL") && message.includes("duplicated scheme") && !message.includes("agents.example.com"), "duplicated scheme error is specific and does not echo URL");
	}

	process.env.TELEGRAM_WEBHOOK_URL = "https://your-cloudflare-tunnel.example.com";
	try {
		requireTelegramPublicUrl();
		assert(false, "placeholder webhook URL throws");
	} catch (err) {
		const message = (err as Error).message;
		assert(message.includes("placeholder") && !message.includes("your-cloudflare-tunnel.example.com"), "placeholder error is clear and does not echo URL");
	}

	process.env.TELEGRAM_WEBHOOK_URL = "\"https://agents.example.com\"";
	try {
		requireTelegramPublicUrl();
		assert(false, "quoted webhook URL throws");
	} catch (err) {
		assert((err as Error).message.includes("quote"), "quoted URL error is clear");
	}

	delete process.env.TELEGRAM_WEBHOOK_URL;
	process.env.AGENTS_TEAM_SERVER_PUBLIC_URL = "http://agents.example.com";
	try {
		requireTelegramPublicUrl();
		assert(false, "non-HTTPS fallback public URL throws");
	} catch (err) {
		assert((err as Error).message.includes("AGENTS_TEAM_SERVER_PUBLIC_URL") && (err as Error).message.includes("https://"), "non-HTTPS fallback public URL has clear error");
	}

	process.env.TELEGRAM_WEBHOOK_URL = "https://definitely-unresolvable.invalid";
	delete process.env.AGENTS_TEAM_SERVER_PUBLIC_URL;
	try {
		await validateTelegramWebhookPublicUrl(getTelegramPublicUrlConfig());
		assert(false, "unresolvable webhook host fails before setWebhook");
	} catch (err) {
		const message = (err as Error).message;
		assert(message.includes("does not resolve") && message.includes("skipping Telegram setWebhook") && !message.includes("definitely-unresolvable"), "DNS validation skips setWebhook without echoing host");
	}
});

await withTempCwd(async () => {
	const state = await import("./state");
	assert(state.tryAcquireReceiverLock(), "receiver lock acquires initially");
	assert(state.tryAcquireReceiverLock(), "receiver lock reacquires for same PID");
	state.releaseReceiverLock();
	assert(state.tryAcquireReceiverLock(), "receiver lock can reacquire after release");
	state.releaseReceiverLock();
});

await withTempCwd(async () => {
	process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
	process.env.TELEGRAM_WEBHOOK_LOCAL_PORT = "65534";
	const down = await postPublicRoute("test-secret", "test-secret", { update_id: 1, message: { text: "/start" } });
	assert(down.status === 503, "public route returns 503 when local receiver is down");

	const badPath = await postPublicRoute("wrong", "test-secret", { update_id: 1 });
	assert(badPath.status === 401, "public route validates path secret");
	const badHeader = await postPublicRoute("test-secret", "wrong", { update_id: 1 });
	assert(badHeader.status === 401, "public route validates Telegram secret-token header");
});

await withTempCwd(async () => {
	process.env.TELEGRAM_WEBHOOK_SECRET = "forward-secret";
	let forwardedBody = "";
	let forwardedHeader = "";
	const { server, port } = await startServer(async (req, res) => {
		forwardedHeader = String(req.headers["x-telegram-bot-api-secret-token"] ?? "");
		forwardedBody = await readReq(req);
		res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
	});
	process.env.TELEGRAM_WEBHOOK_LOCAL_PORT = String(port);
	try {
		const update = { update_id: 42, message: { message_id: 1, chat: { id: 1, type: "private" }, date: 1, text: "/start" } };
		const ok = await postPublicRoute("forward-secret", "forward-secret", update);
		assert(ok.status === 200, "public route accepts valid update");
		assert(forwardedHeader === "forward-secret", "public route forwards local secret header");
		assert(JSON.parse(forwardedBody).update_id === 42, "public route forwards JSON body to local receiver");
	} finally {
		await closeServer(server);
	}
});

console.log(`\n${"-".repeat(60)}`);
if (failed > 0) {
	console.error(`❌ ${failed} failed, ${passed} passed`);
	process.exit(1);
} else {
	console.log(`✅ All ${passed} assertions passed`);
}
