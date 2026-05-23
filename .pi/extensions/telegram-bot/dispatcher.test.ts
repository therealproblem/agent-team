/**
 * dispatcher.test.ts — manual test for image-bearing update routing.
 *
 * Run with: NODE_OPTIONS='--import tsx/esm' node .pi/extensions/telegram-bot/dispatcher.test.ts
 *
 * If tsx isn't installed locally, fall back to the jiti runner that ships
 * with pi:
 *   $(npm root -g)/@earendil-works/pi-coding-agent/node_modules/.bin/jiti \
 *     .pi/extensions/telegram-bot/dispatcher.test.ts
 *
 * Tests the pure `decide()` function for the photo / image-document / sticker
 * branches added in the image-input feature. Does not exercise the driver
 * (which would need to mock pi + Telegram).
 *
 * `decide()` reads `loadChatState` from disk for the reply-to-bot, private,
 * and "group with image" branches; we use fresh chat_ids that have no state
 * file so the default empty state is returned (which is what production sees
 * for first contact too).
 */

import type {
	PhotoSize,
	TelegramDocument,
	TelegramMessage,
	TelegramSticker,
	TelegramUpdate,
} from "./api";
import { type DispatcherContext, decide } from "./dispatcher";

const BOT = "TestBot";
const ALLOWED_PRIVATE = 555_000_001;
const ALLOWED_GROUP = -100_555_000_002;
const BLOCKED_CHAT = 999_999_999;
const ctx: DispatcherContext = {
	allowedChats: new Set([ALLOWED_PRIVATE, ALLOWED_GROUP]),
	botUsername: BOT,
};

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

function eq<T>(actual: T, expected: T, message: string): void {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		console.log(`  ✓ ${message}`);
		passed++;
	} else {
		console.error(`  ❌ FAIL: ${message}`);
		console.error(`     expected: ${JSON.stringify(expected)}`);
		console.error(`     actual:   ${JSON.stringify(actual)}`);
		failed++;
	}
}

// ---------- fixture helpers ----------

function photo(fileId: string, width = 1280, height = 960): PhotoSize {
	return { file_id: fileId, file_unique_id: `u-${fileId}`, width, height };
}

function doc(fileId: string, mime?: string): TelegramDocument {
	return {
		file_id: fileId,
		file_unique_id: `u-${fileId}`,
		mime_type: mime,
		file_name: `f-${fileId}`,
	};
}

function sticker(fileId: string, opts: { animated?: boolean; video?: boolean } = {}): TelegramSticker {
	return {
		file_id: fileId,
		file_unique_id: `u-${fileId}`,
		type: "regular",
		is_animated: opts.animated ?? false,
		is_video: opts.video ?? false,
		width: 512,
		height: 512,
	};
}

function mkMessage(
	chatId: number,
	chatType: "private" | "group" | "supergroup",
	overrides: Partial<TelegramMessage> = {},
): TelegramMessage {
	return {
		message_id: 1,
		from: { id: 1, is_bot: false, first_name: "Alice", username: "alice" },
		chat: { id: chatId, type: chatType, title: chatType === "private" ? undefined : "Test Group" },
		date: Math.floor(Date.now() / 1000),
		...overrides,
	};
}

function mkUpdate(msg: TelegramMessage): TelegramUpdate {
	return { update_id: 1, message: msg };
}

// ---------- tests ----------

console.log("Testing dispatcher image-input routing...\n");

console.log("Test 1: Photo with /engineer caption — persona-slash invoke");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", {
		photo: [photo("ph-small", 90, 67), photo("ph-big", 1280, 960)],
		caption: "/engineer describe this UI",
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke");
	if (d.kind === "invoke") {
		eq(d.persona, "engineer", "persona is engineer");
		eq(d.line, "describe this UI", "line strips /engineer prefix");
		eq(d.attachments?.length, 1, "one attachment");
		eq(d.attachments?.[0].source, "photo", "source is photo");
		eq(d.attachments?.[0].fileId, "ph-big", "largest photo file_id picked");
	}
}

console.log("\nTest 2: Photo with @pm mention — persona-mention invoke");
{
	const msg = mkMessage(ALLOWED_GROUP, "supergroup", {
		photo: [photo("p1")],
		caption: "@pm thoughts on this?",
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke");
	if (d.kind === "invoke") {
		eq(d.persona, "pm", "persona is pm");
		assert(d.line.includes("@pm"), "line preserves @-mention");
		eq(d.attachments?.[0].source, "photo", "attachment is photo");
	}
}

console.log("\nTest 3: Captionless photo in private chat");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", { photo: [photo("only")] });
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke");
	if (d.kind === "invoke") {
		eq(d.line, "(image)", "line falls back to (image)");
		eq(d.attachments?.length, 1, "attachment present");
	}
}

console.log("\nTest 4: Captionless photo in group — invokes (new behavior)");
{
	const msg = mkMessage(ALLOWED_GROUP, "supergroup", { photo: [photo("g1")] });
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "image in group triggers invoke instead of ingest");
	if (d.kind === "invoke") {
		eq(d.persona, "engineer", "default persona is engineer");
		eq(d.line, "(image)", "line is (image)");
		eq(d.attachments?.[0].source, "photo", "photo attached");
	}
}

console.log("\nTest 5: Photo with /stop caption — /stop wins, no attachments leaked");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", {
		photo: [photo("p")],
		caption: "/stop",
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "stop", "kind is stop");
	assert(!("attachments" in d), "no attachments field on stop decision");
}

console.log("\nTest 6: Image document (image/png) with caption");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", {
		document: doc("doc-png", "image/png"),
		caption: "/engineer what is this?",
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke");
	if (d.kind === "invoke") {
		eq(d.persona, "engineer", "persona is engineer");
		eq(d.attachments?.length, 1, "one attachment");
		eq(d.attachments?.[0].source, "document", "source is document");
		eq(d.attachments?.[0].mimeHint, "image/png", "mimeHint preserved");
	}
}

console.log("\nTest 7: Non-image document (application/pdf) — no attachments");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", {
		document: doc("doc-pdf", "application/pdf"),
		caption: "look at this pdf",
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke (private chat)");
	if (d.kind === "invoke") {
		assert(d.attachments === undefined, "no attachments for non-image document");
		eq(d.line, "look at this pdf", "caption flows through as text");
	}
}

console.log("\nTest 8: Static sticker (not animated, not video)");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", { sticker: sticker("st1") });
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke");
	if (d.kind === "invoke") {
		eq(d.attachments?.length, 1, "one attachment");
		eq(d.attachments?.[0].source, "sticker", "source is sticker");
		eq(d.attachments?.[0].mimeHint, "image/webp", "mimeHint is image/webp");
	}
}

console.log("\nTest 9: Animated sticker — excluded");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", {
		sticker: sticker("anim", { animated: true }),
		text: "hi",
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke (private chat)");
	if (d.kind === "invoke") {
		assert(d.attachments === undefined, "animated sticker not attached");
	}
}

console.log("\nTest 10: Video sticker — excluded");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", {
		sticker: sticker("vid", { video: true }),
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke");
	if (d.kind === "invoke") {
		assert(d.attachments === undefined, "video sticker not attached");
		eq(d.line, "", "captionless video sticker has empty line (no image fallback either)");
	}
}

console.log("\nTest 11: Multi-resolution photo array — largest by area is picked");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", {
		photo: [
			photo("s90", 90, 90),
			photo("s320", 320, 240),
			photo("s1280", 1280, 960),
			photo("s800", 800, 600),
		],
		caption: "/pm scale check",
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke");
	if (d.kind === "invoke") {
		eq(d.attachments?.length, 1, "exactly one attachment from the array");
		eq(d.attachments?.[0].fileId, "s1280", "largest-by-area file_id picked");
	}
}

console.log("\nTest 12: Photo from non-allowlisted chat — ignore, no file_id leak");
{
	const msg = mkMessage(BLOCKED_CHAT, "supergroup", { photo: [photo("blocked")] });
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "ignore", "kind is ignore");
	const serialised = JSON.stringify(d);
	assert(!serialised.includes("blocked"), "file_id 'blocked' not in serialised decision");
}

console.log("\nTest 13: Photo + caption '/new' — control command, no attachments");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", {
		photo: [photo("p")],
		caption: "/new",
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "control", "kind is control");
	assert(!("attachments" in d), "no attachments field on control decision");
}

console.log("\nTest 14: Text-only message — no attachments field");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", { text: "hello" });
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke");
	if (d.kind === "invoke") {
		assert(d.attachments === undefined, "attachments is undefined for text-only");
		eq(d.line, "hello", "line is the text body");
	}
}

console.log("\nTest 15: Photo + image document on same message — both attached");
{
	const msg = mkMessage(ALLOWED_PRIVATE, "private", {
		photo: [photo("ph")],
		document: doc("d", "image/jpeg"),
		caption: "/engineer",
	});
	const d = decide(mkUpdate(msg), ctx);
	assert(d.kind === "invoke", "kind is invoke");
	if (d.kind === "invoke") {
		eq(d.attachments?.length, 2, "both photo and image document attached");
		eq(d.attachments?.[0].source, "photo", "first is photo");
		eq(d.attachments?.[1].source, "document", "second is document");
	}
}

console.log(`\n${"-".repeat(60)}`);
if (failed > 0) {
	console.error(`❌ ${failed} failed, ${passed} passed`);
	process.exit(1);
} else {
	console.log(`✅ All ${passed} assertions passed`);
}
