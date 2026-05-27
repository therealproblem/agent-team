/**
 * Shared env-first vault path resolution.
 *
 * AGENTS_TEAM_VAULT_PATH is authoritative when it points at an existing
 * directory. Repo-local `vault/` is only a fallback for missing/unavailable
 * env vaults. Never log or surface the configured value from this helper;
 * callers that need a user-facing explanation should mention only the env
 * var name and whether env/fallback was used.
 */

import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

export interface VaultRootOptions {
	/** Directory whose `vault/` child is the fallback. Defaults to process.cwd(). */
	cwd?: string;
	/** Optional env object for tests. Defaults to process.env. */
	env?: NodeJS.ProcessEnv;
}

export interface VaultRootResolution {
	path: string;
	source: "env" | "fallback";
	envConfigured: boolean;
	envAvailable: boolean;
}

function isAvailableDirectory(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isDirectory();
	} catch {
		return false;
	}
}

export function resolveVaultRoot(options: VaultRootOptions = {}): string {
	return resolveVaultRootDetails(options).path;
}

export function resolveVaultRootDetails(options: VaultRootOptions = {}): VaultRootResolution {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const configured = env.AGENTS_TEAM_VAULT_PATH?.trim();
	if (configured) {
		const envPath = resolve(configured);
		if (isAvailableDirectory(envPath)) {
			return {
				path: envPath,
				source: "env",
				envConfigured: true,
				envAvailable: true,
			};
		}
		return {
			path: resolve(cwd, "vault"),
			source: "fallback",
			envConfigured: true,
			envAvailable: false,
		};
	}
	return {
		path: resolve(cwd, "vault"),
		source: "fallback",
		envConfigured: false,
		envAvailable: false,
	};
}

export function resolveVaultRelativePath(inputPath: string, options: VaultRootOptions = {}): string {
	if (isAbsolute(inputPath)) return inputPath;
	const normalized = inputPath.replace(/^vault[\\/]/, "");
	return resolve(resolveVaultRoot(options), normalized);
}

export function toVaultRelativePath(inputPath: string, options: VaultRootOptions = {}): string {
	const abs = resolveVaultRelativePath(inputPath, options);
	const root = resolveVaultRoot(options);
	const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
	if (!abs.startsWith(prefix)) return abs;
	return abs.slice(prefix.length);
}

export function vaultJoin(...segments: string[]): string {
	return join(resolveVaultRoot(), ...segments);
}
