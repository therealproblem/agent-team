/**
 * terminal-image — explicit local image attachment from the terminal.
 *
 * UX: /image <path> <question>
 *
 * Pi already supports ImageContent once a caller supplies structured image
 * blocks. This extension is only the terminal adapter: it keeps normal chat
 * path mentions as text, validates an explicitly requested local image, and
 * transforms that one TUI input into text + ImageContent before the model turn.
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
const COMMAND = "/image";
const CUSTOM_TYPE = "terminal-image";
const DEFAULT_QUESTION = "What do you see in this image?";

// Keep comfortably below common provider limits after base64 expansion.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
]);

export interface ParsedImageCommand {
	path: string;
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

/**
 * Parse `/image <path> <question>`.
 *
 * Supports quoted paths for spaces (`/image "~/Desktop/a b.png" ...`). Unquoted
 * paths intentionally stop at whitespace; users with spaces should quote.
 */
export function parseImageArgs(args: string): ParsedImageCommand {
	let rest = args.trimStart();
	if (!rest) return { path: "", question: "" };

	let path = "";
	const quote = rest[0];
	if (quote === "\"" || quote === "'") {
		let escaped = false;
		let end = -1;
		for (let i = 1; i < rest.length; i++) {
			const ch = rest[i];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === "\\") {
				escaped = true;
				continue;
			}
			if (ch === quote) {
				end = i;
				break;
			}
		}
		if (end === -1) {
			path = unescapeQuoted(rest.slice(1));
			rest = "";
		} else {
			path = unescapeQuoted(rest.slice(1, end));
			rest = rest.slice(end + 1).trimStart();
		}
	} else {
		const match = rest.match(/^(\S+)(?:\s+([\s\S]*))?$/);
		path = match?.[1] ?? "";
		rest = match?.[2]?.trimStart() ?? "";
	}

	return { path, question: rest || DEFAULT_QUESTION };
}

export function parseImageCommand(text: string): ParsedImageCommand | null {
	if (text !== COMMAND && !text.startsWith(`${COMMAND} `)) return null;
	return parseImageArgs(text.slice(COMMAND.length));
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
		throw new Error("Usage: /image <path> <question>");
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

async function handleImageCommand(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	args: string,
): Promise<void> {
	const parsed = parseImageArgs(args);

	if (!supportsImages(ctx)) {
		surface(
			pi,
			`/image requires an image-capable model. ${modelName(ctx)} reports text-only input; switch models and retry.`,
			{ model: ctx.model?.id, input: ctx.model?.input },
		);
		return;
	}

	try {
		const loaded = await loadLocalImage(parsed.path, ctx.cwd ?? process.cwd());
		await pi.sendUserMessage([
			{ type: "text", text: parsed.question },
			loaded.content,
		]);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		surface(pi, `/image: ${message}`);
	}
}

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("image", {
		description: "Attach a local image to the next model turn: /image <path> <question>",
		handler: async (args, ctx) => {
			await handleImageCommand(pi, ctx, args);
		},
	});
}
