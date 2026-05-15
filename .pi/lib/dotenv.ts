/**
 * dotenv — minimal `.env` loader for in-repo extensions.
 *
 * Reads `<cwd>/.env` once on first call and merges any keys that are not
 * already present in `process.env`. Shell-exported values therefore win over
 * file values — that mirrors standard dotenv semantics and lets ad-hoc shell
 * overrides take effect without editing the file.
 *
 * Kept tiny on purpose: no dependency on the `dotenv` npm package (the `.pi`
 * extension tree has no package.json, and adding one for ~15 lines isn't
 * worth it). Recognises `KEY=value`, `KEY="value"`, `KEY='value'`, blank
 * lines, and `#` comments. Does not expand `$VAR` interpolation — values are
 * taken verbatim.
 *
 * Idempotent: subsequent calls in the same process are no-ops.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

export function loadDotenv(envPath: string = join(process.cwd(), ".env")): void {
	if (loaded) return;
	loaded = true;

	let text: string;
	try {
		text = readFileSync(envPath, "utf8");
	} catch {
		return;
	}

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		const key = line.slice(0, eq).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
		if (key in process.env) continue;
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}
