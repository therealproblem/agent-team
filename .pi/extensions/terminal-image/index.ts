/**
 * terminal-image — automatic local image attachment from terminal prompts.
 *
 * UX: paste/type a local image path with visual intent, e.g.
 *   /Users/joseph/Downloads/cat.jpg what do you see in this image?
 *
 * Pi already supports ImageContent once a caller supplies structured image
 * blocks. This extension is only the terminal adapter: it validates local
 * images and transforms visual-evaluation prompts into text + ImageContent,
 * while leaving normal file-operation prompts as plain text.
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CUSTOM_TYPE = "terminal-image";
const MAX_AUTO_IMAGES = 3;

// Keep comfortably below common provider limits after base64 expansion.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
]);

const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp|gif)\b/i;
const VISUAL_INTENT_RE = /\b(?:what\s+(?:do\s+)?(?:you\s+)?see|describe|caption|compare|analy[sz]e|inspect|look\s+at|view|identify|recognize|read|ocr|transcribe|extract|what(?:'s|\s+is)\s+(?:in|on)|in\s+this\s+(?:image|picture|photo|screenshot)|this\s+(?:image|picture|photo|screenshot)|picture|photo|screenshot|visual|diagram|chart)\b/i;
const FILE_OPERATION_RE = /\b(?:move|mv|copy|cp|delete|del|remove|rm|archive|zip|tar|compress|rename|ren|open|edit|write|save|upload|download|attach|send|email|share|chmod|chown|mkdir|touch|find|locate|list|ls|cat|tail|head|convert|resize|crop|optimi[sz]e)\b/i;

export interface AutoImagePrompt {
	paths: string[];
	question: string;
}

export interface LoadedImage {
	content: ImageContent;
	bytes: number;
}

function surface(pi: ExtensionAPI, text: string, details?: object): void {
	pi.sendMessage(
		{
			customType: CUSTOM_TYPE,
			content: text,
			display: true,
			details,
		},
		{ triggerTurn: false },
	);
}

function modelName(ctx: ExtensionContext): string {
	return ctx.model?.id ?? "the active model";
}

function supportsImages(ctx: ExtensionContext): boolean {
	return ctx.model?.input?.includes("image") === true;
}

function formatBytes(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
	const kb = bytes / 1024;
	if (kb >= 1) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
	return `${bytes} B`;
}

function unescapeQuoted(value: string): string {
	return value.replace(/\\([\\"'])/g, "$1");
}

function isBoundary(ch: string | undefined): boolean {
	return ch === undefined || /\s|["'`“”‘’()\[\]{}<>]/.test(ch);
}

function maybePathEnd(ch: string | undefined): boolean {
	return ch === undefined || /\s|["'`“”‘’()\[\]{}<>,;!?]/.test(ch);
}

function stripTrailingPunctuation(value: string): string {
	return value.replace(/[.,;:!?]+$/g, "");
}

function containsVisualIntent(text: string): boolean {
	return VISUAL_INTENT_RE.test(text);
}

function textWithoutQuotedSpans(text: string): string {
	return text.replace(/(["'`])[^"'`]*\1/g, " ");
}

function containsFileOperationIntent(text: string): boolean {
	return FILE_OPERATION_RE.test(textWithoutQuotedSpans(text));
}

function appendCandidate(
	candidates: Array<{ path: string; start: number; end: number }>,
	candidate: { path: string; start: number; end: number },
): void {
	if (!IMAGE_EXT_RE.test(candidate.path)) return;
	if (candidates.some((existing) => existing.start === candidate.start && existing.end === candidate.end)) return;
	candidates.push(candidate);
}

export function findImagePathCandidates(
	text: string,
	cwd = process.cwd(),
): Array<{ path: string; start: number; end: number }> {
	const candidates: Array<{ path: string; start: number; end: number }> = [];

	const quoted = /(["'`])([^"'`]*?\.(?:jpe?g|png|webp|gif))\1/gi;
	for (const match of text.matchAll(quoted)) {
		const raw = match[2] ?? "";
		appendCandidate(candidates, {
			path: unescapeQuoted(raw),
			start: (match.index ?? 0) + 1,
			end: (match.index ?? 0) + 1 + raw.length,
		});
	}

	for (let start = 0; start < text.length; start++) {
		if (!isBoundary(text[start - 1])) continue;
		const startsHome = text[start] === "~" && text[start + 1] === "/";
		const startsAbsolute = text[start] === "/";
		const startsRelative = text[start] === "." && text[start + 1] === "/";
		if (!startsHome && !startsAbsolute && !startsRelative) continue;

		const slice = text.slice(start);
		const ext = slice.match(IMAGE_EXT_RE);
		if (!ext || ext.index === undefined) continue;

		const minEnd = start + ext.index + ext[0].length;
		if (!maybePathEnd(text[minEnd])) continue;

		let best: { path: string; end: number } | undefined;
		for (let end = minEnd; end <= text.length; end++) {
			if (!maybePathEnd(text[end])) continue;
			const raw = stripTrailingPunctuation(text.slice(start, end));
			if (!raw || !IMAGE_EXT_RE.test(raw)) continue;
			const absolutePath = resolveImagePath(raw, cwd);
			if (existsSync(absolutePath)) best = { path: raw, end: start + raw.length };
		}

		if (best) {
			appendCandidate(candidates, { path: best.path, start, end: best.end });
			start = Math.max(start, best.end - 1);
		} else {
			const raw = stripTrailingPunctuation(text.slice(start, minEnd));
			appendCandidate(candidates, { path: raw, start, end: start + raw.length });
			start = Math.max(start, minEnd - 1);
		}
	}

	return candidates.sort((a, b) => a.start - b.start);
}

export function parseAutoImagePrompt(text: string, cwd = process.cwd()): AutoImagePrompt | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	if (!containsVisualIntent(trimmed)) return null;
	if (containsFileOperationIntent(trimmed)) return null;

	const candidates = findImagePathCandidates(trimmed, cwd);
	if (candidates.length === 0) return null;

	return {
		paths: candidates.map((candidate) => candidate.path),
		question: trimmed,
	};
}

export function detectMimeType(bytes: Uint8Array, filePath: string): string | undefined {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg";
	}
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return "image/png";
	}
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp";
	}
	if (
		bytes.length >= 6 &&
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return "image/gif";
	}

	// SVG is text, but common vision providers accept it as image/svg+xml only
	// inconsistently. Keep v1 to the binary image formats above.
	const lower = filePath.toLowerCase();
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".gif")) return "image/gif";
	return undefined;
}

export function resolveImagePath(inputPath: string, cwd: string): string {
	if (inputPath.startsWith("~/")) {
		const home = process.env.HOME;
		if (home) return resolve(home, inputPath.slice(2));
	}
	return isAbsolute(inputPath) ? inputPath : resolve(cwd, inputPath);
}

export async function loadLocalImage(inputPath: string, cwd: string): Promise<LoadedImage> {
	if (!inputPath.trim()) {
		throw new Error("Image path is empty.");
	}

	const absolutePath = resolveImagePath(inputPath, cwd);
	if (!existsSync(absolutePath)) {
		throw new Error(`Image file not found: ${inputPath}`);
	}

	const info = await stat(absolutePath);
	if (!info.isFile()) {
		throw new Error(`Image path is not a file: ${inputPath}`);
	}
	if (info.size > MAX_IMAGE_BYTES) {
		throw new Error(
			`Image is too large (${formatBytes(info.size)}). Maximum supported size is ${formatBytes(MAX_IMAGE_BYTES)}.`,
		);
	}
	if (info.size === 0) {
		throw new Error(`Image file is empty: ${inputPath}`);
	}

	const buffer = await readFile(absolutePath);
	const mimeType = detectMimeType(buffer, absolutePath);
	if (!mimeType || !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
		throw new Error(
			`Unsupported image type for ${inputPath}. Supported types: JPEG, PNG, WebP, GIF.`,
		);
	}

	return {
		bytes: buffer.byteLength,
		content: { type: "image", data: buffer.toString("base64"), mimeType },
	};
}

async function handleAutoImagePrompt(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	parsed: AutoImagePrompt,
): Promise<void> {
	if (parsed.paths.length > MAX_AUTO_IMAGES) {
		surface(
			pi,
			`I found ${parsed.paths.length} image paths. Please narrow the request to ${MAX_AUTO_IMAGES} or fewer images.`,
			{ count: parsed.paths.length, max: MAX_AUTO_IMAGES },
		);
		return;
	}

	if (!supportsImages(ctx)) {
		surface(
			pi,
			`Image prompts require an image-capable model. ${modelName(ctx)} reports text-only input; switch models and retry.`,
			{ model: ctx.model?.id, input: ctx.model?.input },
		);
		return;
	}

	try {
		const loaded = await Promise.all(
			parsed.paths.map((path) => loadLocalImage(path, ctx.cwd ?? process.cwd())),
		);
		await pi.sendUserMessage([
			{ type: "text", text: parsed.question },
			...loaded.map((image) => image.content),
		]);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		surface(pi, `Image prompt: ${message}`);
	}
}

export default function (pi: ExtensionAPI): void {
	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive") return { action: "continue" };
		if (event.images && event.images.length > 0) return { action: "continue" };

		const parsed = parseAutoImagePrompt(event.text, ctx.cwd ?? process.cwd());
		if (!parsed) return { action: "continue" };

		await handleAutoImagePrompt(pi, ctx, parsed);
		return { action: "handled" };
	});
}
