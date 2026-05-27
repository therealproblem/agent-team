/**
 * show-md — open a vault markdown file in a tmux side pane via `leaf`.
 *
 * Registers a single tool, `show_md`, that calls
 *   tmux split-window -h -d 'leaf <abs-path>'
 * against the current tmux session. The `tmux-host` extension guarantees Pi
 * is running inside tmux for every interactive invocation, so the split is
 * almost always available. When it isn't (headless / cron / --no-session),
 * the tool returns a silent no-op result — no error, no narration.
 *
 * Vault path resolution mirrors the `obsidian-vault` extension: relative
 * paths resolve against $AGENTS_TEAM_VAULT_PATH or <repo>/vault, absolute
 * paths pass through.
 */

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { loadDotenv } from "../../lib/dotenv";
import { resolveVaultRoot } from "../../lib/vault-path";
import { Type } from "@earendil-works/pi-ai";
import {
	defineTool,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

loadDotenv();

const REPO_ROOT = resolve(process.cwd());
const VAULT_ROOT = resolveVaultRoot({ cwd: REPO_ROOT });

function shellQuote(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`;
}

const showMd = defineTool({
	name: "show_md",
	label: "Show markdown in side pane",
	description:
		"Open a vault markdown file in a tmux side pane using `leaf`. Default display surface for any vault markdown the agent wants the user to read. Always call AFTER `note-taker` has saved the file. Silent no-op when Pi is not running inside tmux (headless / --no-session / cron).",
	parameters: Type.Object({
		md_path: Type.String({
			description:
				"Vault-relative or absolute path to the markdown file (e.g. `inbox/2026-05-17-foo.md` or `/abs/path/to/foo.md`).",
		}),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		if (!process.env.TMUX) {
			return {
				content: [
					{ type: "text", text: "not_in_tmux — pane not opened" },
				],
				details: { opened: false, reason: "not_in_tmux" },
			};
		}

		const abs = isAbsolute(params.md_path)
			? params.md_path
			: resolve(VAULT_ROOT, params.md_path);

		if (!existsSync(abs)) {
			return {
				content: [{ type: "text", text: `file not found: ${abs}` }],
				details: { opened: false, reason: "not_found", path: abs },
				isError: true,
			};
		}

		try {
			await new Promise<void>((res, rej) => {
				const p = spawn(
					"tmux",
					["split-window", "-h", `leaf ${shellQuote(abs)}`],
					{ stdio: "ignore" },
				);
				p.on("error", rej);
				p.on("exit", (code) =>
					code === 0
						? res()
						: rej(new Error(`tmux split-window exited ${code}`)),
				);
			});
		} catch (e) {
			const message = (e as Error).message;
			return {
				content: [
					{ type: "text", text: `Failed to open side pane: ${message}` },
				],
				details: { opened: false, reason: "tmux_error", error: message },
				isError: true,
			};
		}

		return {
			content: [
				{
					type: "text",
					text: `Opened ${abs} in side pane (focused). Press \`q\` to close, or \`Ctrl-b x\` to kill the pane. \`Ctrl-b o\` jumps back to the Pi pane.`,
				},
			],
			details: { opened: true, path: abs, focused: true },
		};
	},
});

export default function (pi: ExtensionAPI): void {
	pi.registerTool(showMd);
}
