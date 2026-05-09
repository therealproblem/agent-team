/**
 * meta-logger — Layer 0 observation hook.
 *
 * Subscribes to `session_shutdown` and appends a JSONL line per session
 * to `.pi/meta-logs/<YYYY-MM>.jsonl`. The log is the substrate Meta uses
 * (via a periodic review skill in the root session) to surface
 * system-level patterns: which agents are heavily used, common routing
 * mistakes, repeat failures.
 */

import { existsSync } from "node:fs";
import { mkdir, appendFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const REPO_ROOT = resolve(process.cwd());
const LOG_DIR = join(REPO_ROOT, ".pi", "meta-logs");

function logPath(date: Date): string {
	const yyyy = date.getUTCFullYear();
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	return join(LOG_DIR, `${yyyy}-${mm}.jsonl`);
}

export default function (pi: ExtensionAPI): void {
	const startedAt = new Date().toISOString();

	pi.on("session_shutdown", async (_event, _ctx) => {
		try {
			const endedAt = new Date().toISOString();
			const path = logPath(new Date(endedAt));
			if (!existsSync(dirname(path))) {
				await mkdir(dirname(path), { recursive: true });
			}
			const line =
				JSON.stringify({
					v: 1,
					started_at: startedAt,
					ended_at: endedAt,
					duration_ms: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
				}) + "\n";
			await appendFile(path, line, { encoding: "utf8" });
		} catch {
			// Logging failure must not crash shutdown.
		}
	});
}
