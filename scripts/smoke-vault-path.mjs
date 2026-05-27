#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVaultRootDetails } from "../.pi/lib/vault-path.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

const root = mkdtempSync(join(tmpdir(), "pi-vault-path-smoke-"));
const repoRoot = join(root, "repo");
const envVault = join(root, "env-vault");
mkdirSync(repoRoot, { recursive: true });
mkdirSync(envVault, { recursive: true });

try {
  const envFirst = resolveVaultRootDetails({
    cwd: repoRoot,
    env: { AGENTS_TEAM_VAULT_PATH: envVault },
  });
  assert(envFirst.source === "env", "configured available vault wins");
  assert(envFirst.path === envVault, "env-first path is selected without printing it");

  const unavailable = resolveVaultRootDetails({
    cwd: repoRoot,
    env: { AGENTS_TEAM_VAULT_PATH: join(root, "missing-vault") },
  });
  assert(unavailable.source === "fallback", "missing configured vault falls back");
  assert(unavailable.envConfigured && !unavailable.envAvailable, "unavailable env vault is detected");

  const unset = resolveVaultRootDetails({ cwd: repoRoot, env: {} });
  assert(unset.source === "fallback", "unset vault uses fallback");

  console.log("Vault path smoke passed (env values not printed).");
} finally {
  rmSync(root, { recursive: true, force: true });
}
