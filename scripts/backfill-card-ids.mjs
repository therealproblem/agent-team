#!/usr/bin/env node
/**
 * backfill-card-ids.mjs — one-shot migration that stamps a UUID v4 `id:`
 * into every card frontmatter that doesn't already have one.
 *
 * Run from the repo root:   node scripts/backfill-card-ids.mjs
 * Or via `npm` if you wire it up.
 *
 * Idempotent: cards that already carry a valid `id:` are left alone.
 * Skips `_archive/` directories and dotfiles.
 *
 * The script imports `gray-matter` from `.pi/server/node_modules` so it
 * doesn't need its own install — same dep the server uses for parsing.
 */

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SERVER_DIR = join(REPO_ROOT, ".pi", "server");

// Resolve gray-matter from .pi/server so we don't need a top-level install.
const requireFromServer = createRequire(join(SERVER_DIR, "package.json"));
const matter = requireFromServer("gray-matter");

const VAULT_ROOT = process.env.AGENTS_TEAM_VAULT_PATH || join(REPO_ROOT, "vault");
const PROJECTS_DIR = join(VAULT_ROOT, "projects");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function listProjects() {
  let entries;
  try {
    entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch (e) {
    console.error(`Cannot read ${PROJECTS_DIR}: ${e.message}`);
    process.exit(1);
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
    .map((e) => e.name);
}

async function listCards(projectSlug) {
  const boardDir = join(PROJECTS_DIR, projectSlug, "board");
  let entries;
  try {
    entries = await fs.readdir(boardDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(
      (e) => e.isFile() && e.name.endsWith(".md") && !e.name.startsWith("."),
    )
    .map((e) => join(boardDir, e.name));
}

async function backfillCard(filePath, seenIds) {
  const raw = await fs.readFile(filePath, "utf8");
  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    return { status: "parse_error", error: e.message };
  }
  const data = { ...(parsed.data || {}) };
  const existing = typeof data.id === "string" ? data.id.trim().toLowerCase() : "";
  if (existing && UUID_RE.test(existing)) {
    if (seenIds.has(existing)) {
      return { status: "duplicate", id: existing };
    }
    seenIds.add(existing);
    return { status: "skip", id: existing };
  }
  let id;
  do {
    id = randomUUID();
  } while (seenIds.has(id));
  seenIds.add(id);
  // Place `id` first so it sits at the top of the frontmatter when serialized.
  const reordered = { id, ...data };
  delete reordered.id; // remove and re-add to force key order
  const newData = { id, ...data };
  const newRaw = matter.stringify(parsed.content, newData);
  await fs.writeFile(filePath, newRaw, "utf8");
  return { status: "added", id };
}

async function main() {
  const projects = await listProjects();
  const seenIds = new Set();
  let scanned = 0;
  let added = 0;
  let skipped = 0;
  let errors = 0;
  let duplicates = 0;

  for (const projectSlug of projects) {
    const cards = await listCards(projectSlug);
    for (const cardPath of cards) {
      scanned++;
      const rel = cardPath.slice(REPO_ROOT.length + 1);
      try {
        const res = await backfillCard(cardPath, seenIds);
        if (res.status === "added") {
          added++;
          console.log(`+ ${rel}  ${res.id}`);
        } else if (res.status === "skip") {
          skipped++;
        } else if (res.status === "duplicate") {
          duplicates++;
          console.error(`! duplicate id ${res.id} at ${rel}`);
        } else if (res.status === "parse_error") {
          errors++;
          console.error(`x parse error at ${rel}: ${res.error}`);
        }
      } catch (e) {
        errors++;
        console.error(`x ${rel}: ${e.message}`);
      }
    }
  }

  console.log(
    `\n${scanned} card${scanned === 1 ? "" : "s"} scanned · ${added} backfilled · ${skipped} already had ids · ${duplicates} duplicates · ${errors} errors`,
  );
  if (errors > 0 || duplicates > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
