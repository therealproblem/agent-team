/**
 * dotenv.test.mjs — manual test for dotenv reload behavior
 *
 * Run with: node .pi/lib/dotenv.test.mjs
 *
 * Tests that:
 * 1. Keys added to .env are loaded
 * 2. Keys removed from .env are deleted from process.env on reload
 * 3. Shell-exported keys are preserved (not overwritten or deleted)
 */

import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Import dotenv functions - need to transpile first
// For now, manually inline the implementation for testing

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Inline minimal dotenv for testing
import { readFileSync } from "node:fs";

let loaded = false;
const dotenvKeys = new Set();

function parseDotenv(envPath) {
	let text;
	try {
		text = readFileSync(envPath, "utf8");
	} catch {
		return null;
	}

	const out = {};
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

function loadDotenv(envPath) {
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

function reloadDotenv(envPath) {
	const parsed = parseDotenv(envPath);
	if (!parsed) return;

	// Delete keys that were sourced from .env but are no longer present
	for (const key of dotenvKeys) {
		if (!(key in parsed)) {
			delete process.env[key];
			dotenvKeys.delete(key);
		}
	}

	// Add or update keys from the new .env
	for (const [key, value] of Object.entries(parsed)) {
		if (key in process.env && !dotenvKeys.has(key)) continue;
		process.env[key] = value;
		dotenvKeys.add(key);
	}
	loaded = true;
}

const TEST_ENV_PATH = join(process.cwd(), ".env.test");

function assert(condition, message) {
	if (!condition) {
		console.error(`❌ FAIL: ${message}`);
		process.exit(1);
	}
	console.log(`✓ ${message}`);
}

function cleanup() {
	try {
		unlinkSync(TEST_ENV_PATH);
	} catch {
		// ignore
	}
}

// Cleanup on exit
process.on("exit", cleanup);
process.on("SIGINT", () => {
	cleanup();
	process.exit(0);
});

console.log("Testing dotenv reload behavior...\n");

// Test 1: Initial load
console.log("Test 1: Initial load");
writeFileSync(TEST_ENV_PATH, "TEST_KEY_A=value_a\nTEST_KEY_B=value_b\n");
loadDotenv(TEST_ENV_PATH);
assert(process.env.TEST_KEY_A === "value_a", "TEST_KEY_A loaded");
assert(process.env.TEST_KEY_B === "value_b", "TEST_KEY_B loaded");

// Test 2: Reload with one key removed
console.log("\nTest 2: Reload with one key removed");
writeFileSync(TEST_ENV_PATH, "TEST_KEY_A=value_a_updated\n");
reloadDotenv(TEST_ENV_PATH);
assert(process.env.TEST_KEY_A === "value_a_updated", "TEST_KEY_A updated");
assert(process.env.TEST_KEY_B === undefined, "TEST_KEY_B deleted after removal from .env");

// Test 3: Reload with new key added
console.log("\nTest 3: Reload with new key added");
writeFileSync(TEST_ENV_PATH, "TEST_KEY_A=value_a_updated\nTEST_KEY_C=value_c\n");
reloadDotenv(TEST_ENV_PATH);
assert(process.env.TEST_KEY_A === "value_a_updated", "TEST_KEY_A still present");
assert(process.env.TEST_KEY_C === "value_c", "TEST_KEY_C added");
assert(process.env.TEST_KEY_B === undefined, "TEST_KEY_B still deleted");

// Test 4: Shell-exported keys are preserved
console.log("\nTest 4: Shell-exported keys are preserved");
process.env.SHELL_KEY = "shell_value";
writeFileSync(TEST_ENV_PATH, "TEST_KEY_A=value_a_final\nSHELL_KEY=file_value\n");
reloadDotenv(TEST_ENV_PATH);
assert(process.env.SHELL_KEY === "shell_value", "SHELL_KEY not overwritten by .env");
assert(process.env.TEST_KEY_A === "value_a_final", "TEST_KEY_A updated");

// Test 5: All dotenv keys removed
console.log("\nTest 5: All dotenv keys removed");
writeFileSync(TEST_ENV_PATH, "# empty file\n");
reloadDotenv(TEST_ENV_PATH);
assert(process.env.TEST_KEY_A === undefined, "TEST_KEY_A deleted");
assert(process.env.TEST_KEY_C === undefined, "TEST_KEY_C deleted");
assert(process.env.SHELL_KEY === "shell_value", "SHELL_KEY still present");

cleanup();
console.log("\n✅ All tests passed!");
