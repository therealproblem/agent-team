/**
 * working-mood — replaces Pi's default braille spinner + "Working..." text
 * with a slow-rotating kaomoji + verb (à la Claude Code's mood line) plus a
 * live elapsed-time counter so you can see how long the current turn has
 * been running.
 *
 * Layout: `(◕‿◕) Dreaming.. 12s`
 *   - frame (kaomoji + verb + "..") rotates every FRAME_INTERVAL_MS,
 *     rendered as the loader's accent-colored indicator
 *   - elapsed time updates every TICK_INTERVAL_MS, rendered as the loader's
 *     muted-color message (loader joins indicator + " " + message)
 *
 * Hooks:
 *   - session_start: install the indicator, clear stale tick state
 *   - agent_start:   stamp start time, begin the 1-second tick
 *   - agent_end:     stop the tick (avoids a leaked setInterval after Pi
 *                    tears the loader down)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const FRAMES = [
	"(~0.0)~ Synthesizing...",
	"(◕‿◕) Dreaming...",
	"(⌐■_■) Pondering...",
	"(¬‿¬) Scheming...",
	"(◔_◔) Wondering...",
	"(✿◠‿◠) Marinating...",
	"(っ˘ω˘ς) Mulling...",
	"( ・ω・) Cogitating...",
	"(◠‿◠) Brainstorming...",
	"(づ◕‿◕)づ Tinkering...",
	"(￣ω￣;) Musing...",
	"(*≧ω≦) Conjuring...",
	"(✧ω✧) Crystallizing...",
	"(¬､¬) Sleuthing...",
	"(◡‿◡) Daydreaming...",
	"(▰˘◡˘▰) Drifting...",
	"(✪‿✪) Stargazing...",
	"ヾ(＾∇＾) Whirring...",
	"(◞‸◟) Ruminating...",
	"(˘･_･˘) Cerebrating...",
	"(´◔ω◔｀) Percolating...",
	"(￣▽￣) Noodling...",
	"( °▿° ) Hatching...",
	"(•́⌣•̀) Plotting...",
	"ʕ•ᴥ•ʔ Threading...",
	"ᕦ(ò_óˇ)ᕤ Forging...",
	"(✿◕‿◕) Brewing...",
	"(´｡• ᵕ •｡) Distilling...",
];

const FRAME_INTERVAL_MS = 5000;
const TICK_INTERVAL_MS = 1000;

let tickTimer: ReturnType<typeof setInterval> | null = null;
let startedAt: number | null = null;

function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes < 60) return `${minutes}m ${seconds}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

function stopTick(): void {
	if (tickTimer) {
		clearInterval(tickTimer);
		tickTimer = null;
	}
	startedAt = null;
}

function startTick(ctx: ExtensionContext): void {
	stopTick();
	startedAt = Date.now();
	ctx.ui.setWorkingMessage(formatElapsed(0));
	tickTimer = setInterval(() => {
		if (startedAt === null) return;
		ctx.ui.setWorkingMessage(formatElapsed(Date.now() - startedAt));
	}, TICK_INTERVAL_MS);
	tickTimer.unref?.();
}

function installIndicator(ctx: ExtensionContext): void {
	ctx.ui.setWorkingIndicator({ frames: FRAMES, intervalMs: FRAME_INTERVAL_MS });
	ctx.ui.setWorkingMessage("");
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		stopTick();
		installIndicator(ctx);
	});
	pi.on("agent_start", (_event, ctx) => {
		startTick(ctx);
	});
	pi.on("agent_end", () => {
		stopTick();
	});
}
