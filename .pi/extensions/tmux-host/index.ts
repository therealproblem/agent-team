/**
 * tmux-host — boot Pi inside tmux.
 *
 * When `pi` is launched from a plain terminal (no `$TMUX`) and the invocation
 * is interactive (not `--no-session` / `-p` / `--prompt`), this extension
 * re-execs the process as `tmux new-session -A -s pi pi <args>`. The result:
 * every interactive Pi session lives inside a tmux session named `pi`, which
 * the `show-md` skill relies on for its side-pane markdown viewer.
 *
 * The re-exec runs at module-load time — before any other extension's
 * `session_start` handler has fired — so we don't waste startup work (port
 * binding, Camoufox warm-up, etc.) on the outer process that's about to be
 * replaced.
 *
 * Skip conditions (any one returns control to normal Pi startup):
 *   - $TMUX is already set (we're already inside tmux)
 *   - AGENTS_TEAM_NO_TMUX_REEXEC=1 (sentinel / loop-guard, set on re-exec)
 *   - argv contains --no-session, -p, or --prompt (headless invocations)
 *
 * `spawnSync` with `stdio: "inherit"` is the Node-equivalent of `execvp`: it
 * blocks the outer process, hands the TTY to tmux, and only returns once
 * tmux exits. We then forward tmux's exit code to our parent shell.
 */

import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SESSION_NAME = "pi";
const REENTRY_SENTINEL = "AGENTS_TEAM_NO_TMUX_REEXEC";

function shouldSkip(argv: readonly string[]): boolean {
	return (
		argv.includes("--no-session") ||
		argv.includes("-p") ||
		argv.includes("--prompt")
	);
}

if (
	!process.env.TMUX &&
	process.env[REENTRY_SENTINEL] !== "1" &&
	!shouldSkip(process.argv)
) {
	const args = process.argv.slice(2);
	const result = spawnSync(
		"tmux",
		["new-session", "-A", "-s", SESSION_NAME, "pi", ...args],
		{
			stdio: "inherit",
			env: { ...process.env, [REENTRY_SENTINEL]: "1" },
		},
	);
	if (result.error) {
		// tmux missing or unspawnable — fall through to normal Pi startup so
		// the user isn't left with a broken `pi` command.
		// eslint-disable-next-line no-console
		console.error(
			`tmux-host: could not spawn tmux (${result.error.message}). Continuing without tmux.`,
		);
	} else {
		process.exit(result.status ?? (result.signal ? 1 : 0));
	}
}

export default function (_pi: ExtensionAPI): void {
	// No-op. Either we re-execed at module load above, or we're already
	// inside tmux / running headless — no per-session work needed.
}
