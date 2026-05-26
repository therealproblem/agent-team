#!/usr/bin/env node
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseDotenv(path = join(process.cwd(), ".env")) {
	if (!existsSync(path)) return {};
	const out = {};
	for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
		out[key] = value;
	}
	return out;
}

function fingerprint(input) {
	return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

function sanitizedCode(err) {
	const raw = err && typeof err === "object" && "code" in err ? String(err.code) : "DNS_LOOKUP_FAILED";
	return /^[A-Z0-9_]+$/.test(raw) ? raw : "DNS_LOOKUP_FAILED";
}

const dotenv = parseDotenv();
const originalEnv = { ...process.env };
for (const [key, value] of Object.entries(dotenv)) {
	if (!(key in process.env)) process.env[key] = value;
}

const key = process.env.TELEGRAM_WEBHOOK_URL?.trim() ? "TELEGRAM_WEBHOOK_URL" : process.env.AGENTS_TEAM_SERVER_PUBLIC_URL?.trim() ? "AGENTS_TEAM_SERVER_PUBLIC_URL" : undefined;
const raw = key ? process.env[key] ?? "" : "";
const fileValue = key ? dotenv[key] : undefined;
const source = !key ? undefined : typeof fileValue !== "string" ? "process_env" : originalEnv[key] === raw && fileValue !== raw ? "process_env_overrides_dotenv" : "dotenv";
const schemePresent = /^https?:\/\//i.test(raw.trim());

let url;
try {
	url = raw.trim() ? new URL(raw.trim()) : undefined;
} catch {
	url = undefined;
}

const diagnostics = [
	`configured=${key ? "yes" : "no"}`,
	...(key ? [`key=${key}`, `source=${source}`] : []),
	`scheme_present=${schemePresent ? "yes" : "no"}`,
	...(url ? [`scheme=${url.protocol.replace(/:$/, "")}`, `hostname_length=${url.hostname.length}`] : []),
	`path_present=${url && url.pathname.replace(/\/+$/, "") !== "" ? "yes" : "no"}`,
	...(url ? [`url_fp=${fingerprint(url.origin.toLowerCase())}`, `host_fp=${fingerprint(url.hostname.toLowerCase())}`] : []),
	...(key ? [`env_overrides_dotenv=${source === "process_env_overrides_dotenv" ? "yes" : "no"}`] : []),
];

console.log(`telegram webhook URL diagnostics: ${diagnostics.join(" ")}`);

if (!url) {
	console.error("telegram webhook URL validation: no valid URL object could be built; inspect TELEGRAM_WEBHOOK_URL locally without sharing it");
	process.exit(1);
}

const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);
let timeout;
try {
	await Promise.race([
		resolver.resolve(url.hostname).catch((err) => {
			const code = sanitizedCode(err);
			if (code === "ENODATA" || code === "ENOTFOUND") return resolver.resolve6(url.hostname);
			throw err;
		}),
		new Promise((_, reject) => {
			timeout = setTimeout(() => {
				resolver.cancel();
				reject(Object.assign(new Error("DNS timeout"), { code: "DNS_TIMEOUT" }));
			}, 8000);
		}),
	]);
	console.log("telegram webhook DNS preflight: pass");
} catch (err) {
	console.log(`telegram webhook DNS preflight: fail code=${sanitizedCode(err)}`);
	process.exit(1);
} finally {
	if (timeout) clearTimeout(timeout);
}
