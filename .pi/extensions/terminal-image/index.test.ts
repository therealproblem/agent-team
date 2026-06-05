/**
 * Manual smoke tests for the terminal-image extension's pure parsing and file
 * validation helpers.
 *
 * Run with:
 *   $(pnpm root -g 2>/dev/null || echo /opt/homebrew/lib/node_modules)/@earendil-works/pi-coding-agent/node_modules/.bin/jiti \
 *     .pi/extensions/terminal-image/index.test.ts
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import * as mod from "./index";

const {
	MAX_IMAGE_BYTES,
	detectMimeType,
	loadLocalImage,
	parseImageCommand,
	resolveImagePath,
} = mod;

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
	assert(ok, message);
	if (!ok) {
		console.error(`     expected: ${JSON.stringify(expected)}`);
		console.error(`     actual:   ${JSON.stringify(actual)}`);
	}
}

async function rejects(fn: () => Promise<unknown>, pattern: RegExp, message: string): Promise<void> {
	try {
		await fn();
		assert(false, message);
	} catch (err) {
		const text = err instanceof Error ? err.message : String(err);
		assert(pattern.test(text), message);
	}
}

async function run(): Promise<void> {
	console.log("terminal-image smoke tests");

	eq(parseImageCommand("hello /image a.png"), null, "normal chat is not intercepted");
	eq(parseImageCommand("/image /tmp/a.png what do you see?"), {
		path: "/tmp/a.png",
		question: "what do you see?",
	}, "parses absolute path plus question");
	eq(parseImageCommand('/image "/tmp/a b.png" describe it'), {
		path: "/tmp/a b.png",
		question: "describe it",
	}, "parses quoted path with spaces");
	eq(parseImageCommand("/image ./a.png"), {
		path: "./a.png",
		question: "What do you see in this image?",
	}, "defaults missing question");

	assert(resolveImagePath("relative.png", "/tmp/pi-test") === "/tmp/pi-test/relative.png", "resolves relative paths against cwd");

	const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
	const gifHeader = Buffer.from("GIF89a", "ascii");
	const webpHeader = Buffer.from("RIFFxxxxWEBP", "ascii");
	eq(detectMimeType(pngHeader, "x"), "image/png", "detects PNG magic bytes");
	eq(detectMimeType(jpegHeader, "x"), "image/jpeg", "detects JPEG magic bytes");
	eq(detectMimeType(gifHeader, "x"), "image/gif", "detects GIF magic bytes");
	eq(detectMimeType(webpHeader, "x"), "image/webp", "detects WebP magic bytes");
	eq(detectMimeType(Buffer.from("nope"), "x.txt"), undefined, "rejects unknown type");

	const dir = await mkdtemp(join(tmpdir(), "terminal-image-"));
	try {
		const pngPath = join(dir, "tiny.png");
		await writeFile(pngPath, Buffer.concat([pngHeader, Buffer.from([0, 0, 0, 0])]));
		const loaded = await loadLocalImage(pngPath, dir);
		eq(loaded.content.type, "image", "loads image content block");
		eq(loaded.content.mimeType, "image/png", "sets detected MIME type");
		assert(loaded.content.data.length > 0, "base64 encodes bytes");

		await rejects(() => loadLocalImage(join(dir, "missing.png"), dir), /not found/i, "missing file gives helpful error");

		const txtPath = join(dir, "not-image.txt");
		await writeFile(txtPath, "hello");
		await rejects(() => loadLocalImage(txtPath, dir), /Unsupported image type/i, "unsupported MIME gives helpful error");

		const bigPath = join(dir, "big.png");
		await writeFile(bigPath, Buffer.alloc(MAX_IMAGE_BYTES + 1));
		await rejects(() => loadLocalImage(bigPath, dir), /too large/i, "oversized file gives helpful error");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}

	if (failed > 0) {
		console.error(`\n${failed} failed, ${passed} passed`);
		process.exitCode = 1;
	} else {
		console.log(`\nAll ${passed} assertions passed`);
	}
}

// Avoid executing when imported by the extension loader.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	void run();
}
