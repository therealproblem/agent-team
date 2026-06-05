/**
 * Manual smoke tests for the server extension's pure health-poll transition
 * helper.
 *
 * Run with:
 *   $(npm root -g)/@earendil-works/pi-coding-agent/node_modules/.bin/jiti \
 *     .pi/extensions/server/index.test.ts
 */

import { nextHealthPollTransition } from "./health";

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

console.log("server health-poll transition tests\n");

{
	let failures = 0;
	let result = nextHealthPollTransition("ready", failures, false);
	failures = result.consecutiveFailures;
	eq(result.transition, null, "first failed probe does not flip ready→down");
	eq(failures, 1, "first failed probe increments failure count");

	result = nextHealthPollTransition("ready", failures, false);
	failures = result.consecutiveFailures;
	eq(result.transition, null, "second failed probe still does not flip ready→down");
	eq(failures, 2, "second failed probe increments failure count");

	result = nextHealthPollTransition("ready", failures, false);
	eq(result, {
		consecutiveFailures: 3,
		transition: { next: "down", shouldSurfaceStopped: true },
	}, "third consecutive failed probe flips ready→down and surfaces warning");
}

{
	let result = nextHealthPollTransition("ready", 2, true);
	eq(result, { consecutiveFailures: 0, transition: null }, "successful probe resets failure count without status change");

	result = nextHealthPollTransition("ready", result.consecutiveFailures, false);
	eq(result, { consecutiveFailures: 1, transition: null }, "failure count restarts after successful probe");
}

{
	const result = nextHealthPollTransition("down", 2, false);
	eq(result, { consecutiveFailures: 3, transition: null }, "sustained down state does not resurface stopped warning");
}

{
	const result = nextHealthPollTransition("down", 3, true);
	eq(result, {
		consecutiveFailures: 0,
		transition: { next: "ready", shouldSurfaceStopped: false },
	}, "successful probe after down flips status back to ready");
}

if (failed > 0) {
	console.error(`\n${failed} server health-poll test(s) failed`);
	process.exit(1);
}

console.log(`\n${passed} server health-poll test(s) passed`);
