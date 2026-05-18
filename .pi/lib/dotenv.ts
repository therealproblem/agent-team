/**
 * dotenv — minimal `.env` loader for in-repo extensions.
 *
 * Reads `<cwd>/.env` on first call and merges any keys that are not already
 * present in `process.env`. Shell-exported values therefore win over file
 * values — that mirrors standard dotenv semantics and lets ad-hoc shell
 * overrides take effect without editing the file.
 *
 * Kept tiny on purpose: no dependency on the `dotenv` npm package (the `.pi`
 * extension tree has no package.json, and adding one for ~15 lines isn't
 * worth it). Recognises `KEY=value`, `KEY="value"`, `KEY='value'`, blank
 * lines, and `#` comments. Does not expand `$VAR` interpolation — values are
 * taken verbatim.
 *
 * `loadDotenv()` is idempotent: subsequent calls in the same process are
 * no-ops. Use `reloadDotenv()` to re-read the file mid-process; it only
 * overwrites keys that were previously sourced from `.env` (tracked in
 * `dotenvKeys`), so shell-exported values keep winning.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;
const dotenvKeys = new Set<string>();

function parseDotenv(envPath: string): Record<string, string> | null {
	let text: string;
	try {
		text = readFileSync(envPath, "utf8");
	} catch {
		return null;
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

export function loadDotenv(envPath: string = join(process.cwd(), ".env")): void {
	if (loaded) return;
	loaded = true;

	const parsed = parseDotenv(envPath);
	if (!parsed) return;

	for (const [key, value] of Object.entries(parsed)) {
		if (key in process.env) continue;
		process.env[key] = value;
		dotenvKeys.add(key);
	}
}

/**
 * Re-read `.env` mid-process. Overwrites `process.env` entries that this
 * module previously sourced from `.env` (so a `.env` edit after pi launched
 * is picked up), but leaves shell-exported values alone — if a key was set
 * in the shell before pi started, it never entered `dotenvKeys`, so we
 * won't touch it. Also picks up keys newly added to `.env` since the last
 * load. If the file goes away on reload, prior dotenv-sourced keys are
 * left in place rather than deleted (avoids surprising disappearance).
 */
export function reloadDotenv(envPath: string = join(process.cwd(), ".env")): void {
	const parsed = parseDotenv(envPath);
	if (!parsed) return;

	for (const [key, value] of Object.entries(parsed)) {
		if (key in process.env && !dotenvKeys.has(key)) continue;
		process.env[key] = value;
		dotenvKeys.add(key);
	}
	loaded = true;
}
