/**
 * Manual smoke tests for the terminal-image extension's pure parsing and file
 * validation helpers.
 *
 * Run with:
 *   $(pnpm root -g 2>/dev/null || echo /opt/homebrew/lib/node_modules)/@earendil-works/pi-coding-agent/node_modules/.bin/jiti \
 *     .pi/extensions/terminal-image/index.test.ts
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as mod from "./index";

const {
	MAX_IMAGE_BYTES,
	detectMimeType,
	findImagePathCandidates,
	loadLocalImage,
	parseAutoImagePrompt,
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

	const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
	const gifHeader = Buffer.from("GIF89a", "ascii");
	const webpHeader = Buffer.from("RIFFxxxxWEBP", "ascii");

	const dir = await mkdtemp(join(tmpdir(), "terminal-image-"));
	try {
		const pngPath = join(dir, "tiny.png");
		const spacedPath = join(dir, "tiny cat.png");
		const secondPath = join(dir, "second.jpg");
		await writeFile(pngPath, Buffer.concat([pngHeader, Buffer.from([0, 0, 0, 0])]));
		await writeFile(spacedPath, Buffer.concat([pngHeader, Buffer.from([1, 1, 1, 1])]));
		await writeFile(secondPath, Buffer.concat([jpegHeader, Buffer.from([2, 2, 2, 2])]));

		eq(parseAutoImagePrompt(`${pngPath} what do u see in this image GPT`, dir), {
			paths: [pngPath],
			question: `${pngPath} what do u see in this image GPT`,
		}, "detects absolute image path plus visual intent");
		eq(parseAutoImagePrompt(`describe \"${spacedPath}\"`, dir), {
			paths: [spacedPath],
			question: `describe \"${spacedPath}\"`,
		}, "detects quoted image path with spaces");
		eq(parseAutoImagePrompt(`${pngPath} and ${secondPath} compare these images`, dir)?.paths, [
			pngPath,
			secondPath,
		], "detects multiple image paths");
		eq(parseAutoImagePrompt(`move ${pngPath} to the archive`, dir), null, "does not attach image for file move prompt");
		eq(parseAutoImagePrompt(`delete ${pngPath}`, dir), null, "does not attach image for delete prompt");
		eq(parseAutoImagePrompt(`please copy ${pngPath} to ${secondPath}`, dir), null, "does not attach image for copy prompt");
		eq(parseAutoImagePrompt(`hello ${pngPath}`, dir), null, "does not attach path without visual intent");
		eq(findImagePathCandidates(`describe ${spacedPath}`, dir).map((c) => c.path), [spacedPath], "detects existing unquoted path with spaces when feasible");

		assert(resolveImagePath("relative.png", "/tmp/pi-test") === "/tmp/pi-test/relative.png", "resolves relative paths against cwd");

		eq(detectMimeType(pngHeader, "x"), "image/png", "detects PNG magic bytes");
		eq(detectMimeType(jpegHeader, "x"), "image/jpeg", "detects JPEG magic bytes");
		eq(detectMimeType(gifHeader, "x"), "image/gif", "detects GIF magic bytes");
		eq(detectMimeType(webpHeader, "x"), "image/webp", "detects WebP magic bytes");
		eq(detectMimeType(Buffer.from("nope"), "x.txt"), undefined, "rejects unknown type");

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
