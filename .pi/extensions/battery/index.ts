/**
 * battery — adds a right-aligned `| BAT NN%` cell to the TUI footer,
 * matching the `NEWS | REM | SRV` idiom rendered by the statusline
 * extension. Charging state is shown with a trailing `⚡` glyph.
 *
 * Polls `pmset -g batt` every 30s. On machines with no battery
 * (desktop Macs, the `pmset` output omits the percent line) the
 * status is cleared so nothing renders — same fall-through used
 * when the spawn itself fails. Linux/Windows installs short-circuit
 * at session_start since pmset is macOS-only.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";

const KEY = "4batt";
const POLL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;

function readBattery(): Promise<{ percent: number; charging: boolean } | null> {
	return new Promise((resolve) => {
		execFile("/usr/bin/pmset", ["-g", "batt"], { timeout: 2000 }, (err, stdout) => {
			if (err || typeof stdout !== "string") return resolve(null);
			const charging = /'AC Power'/.test(stdout);
			const m = stdout.match(/(\d+)%/);
			if (!m) return resolve(null);
			resolve({ percent: Number(m[1]), charging });
		});
	});
}

async function update(ctx: ExtensionContext): Promise<void> {
	try {
		const b = await readBattery();
		if (!b) {
			ctx.ui.setStatus(KEY, undefined);
			return;
		}
		const glyph = b.charging ? "⚡" : "";
		ctx.ui.setStatus(KEY, `| BAT ${b.percent}%${glyph}`);
	} catch {
		// best-effort
	}
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (event, ctx) => {
		if (event.reason !== "startup" && event.reason !== "resume") return;
		if (process.platform !== "darwin") return;
		void update(ctx);
		if (!timer) {
			timer = setInterval(() => void update(ctx), POLL_MS);
			timer.unref?.();
		}
	});
}
