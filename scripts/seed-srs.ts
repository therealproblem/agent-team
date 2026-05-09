#!/usr/bin/env node
/**
 * One-off seeder for the Language agent's SRS deck.
 *
 * Reads upstream JLPT data from `data/jlpt/` (fetched via curl) and writes
 * the SRS state file at `.pi/state/srs.json` directly. Bypasses the LLM —
 * inserting ~10k items via the add_item tool would be prohibitively slow.
 *
 * Usage:
 *   tsx scripts/seed-srs.ts            # overwrite existing state
 *   tsx scripts/seed-srs.ts --append   # append, error on duplicate IDs
 *
 * Sources (both MIT-licensed):
 *   Vocab: github.com/jamsinclair/open-anki-jlpt-decks
 *   Kanji: github.com/davidluzgouveia/kanji-data
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type SrsLevel = "N5" | "N4" | "N3" | "N2" | "N1";
type SrsType = "vocab" | "kanji" | "grammar";

interface SrsItem {
	id: string;
	type: SrsType;
	level: SrsLevel;
	front: string;
	back: string;
	notes?: string;
	ease: number;
	interval_days: number;
	due_at: string;
	reps: number;
	lapses: number;
}

// Anchor on process.cwd() — script must be run from repo root.
const REPO_ROOT = resolve(process.cwd());
const DATA_DIR = resolve(REPO_ROOT, "data", "jlpt");
const STATE_FILE = resolve(REPO_ROOT, ".pi", "state", "srs.json");

const APPEND = process.argv.includes("--append");

// -----------------------------------------------------------------------------
// CSV parsing (RFC 4180, handles quoted fields with commas)
// -----------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		const next = text[i + 1];

		if (inQuotes) {
			if (c === '"' && next === '"') {
				field += '"';
				i++;
			} else if (c === '"') {
				inQuotes = false;
			} else {
				field += c;
			}
		} else {
			if (c === '"') {
				inQuotes = true;
			} else if (c === ",") {
				row.push(field);
				field = "";
			} else if (c === "\n") {
				row.push(field);
				rows.push(row);
				row = [];
				field = "";
			} else if (c === "\r") {
				// skip
			} else {
				field += c;
			}
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

// -----------------------------------------------------------------------------
// Vocab loading (5 CSVs, one per level)
// -----------------------------------------------------------------------------

function loadVocab(): SrsItem[] {
	const items: SrsItem[] = [];
	const seenIds = new Set<string>();
	const now = new Date().toISOString();

	for (const level of ["N5", "N4", "N3", "N2", "N1"] as const) {
		const filename = `n${level.slice(1)}.csv`;
		const path = resolve(DATA_DIR, filename);
		if (!existsSync(path)) {
			throw new Error(`Missing vocab file: ${path}`);
		}
		const rows = parseCsv(readFileSync(path, "utf8"));
		const header = rows.shift();
		if (!header || header[0] !== "expression") {
			throw new Error(`Unexpected header in ${filename}: ${header}`);
		}
		const expressionCol = header.indexOf("expression");
		const readingCol = header.indexOf("reading");
		const meaningCol = header.indexOf("meaning");
		const guidCol = header.indexOf("guid");

		for (const row of rows) {
			if (row.length < 4) continue;
			const expression = row[expressionCol]?.trim();
			const reading = row[readingCol]?.trim();
			const meaning = row[meaningCol]?.trim();
			const guid = row[guidCol]?.trim();
			if (!expression || !meaning) continue;

			// Some vocab items have non-kanji front (kana-only), in which case
			// reading == expression. Avoid showing it twice on the back.
			const back = reading && reading !== expression
				? `${reading} — ${meaning}`
				: meaning;

			const id = `vocab:${level}:${guid || expression}`;
			if (seenIds.has(id)) continue;
			seenIds.add(id);

			items.push({
				id,
				type: "vocab",
				level,
				front: expression,
				back,
				ease: 2.5,
				interval_days: 0,
				due_at: now,
				reps: 0,
				lapses: 0,
			});
		}
	}

	return items;
}

// -----------------------------------------------------------------------------
// Kanji loading (single JSON keyed by character)
// -----------------------------------------------------------------------------

interface KanjiEntry {
	jlpt_new: number | null;
	meanings: string[];
	readings_on: string[];
	readings_kun: string[];
	strokes?: number;
}

function loadKanji(): SrsItem[] {
	const path = resolve(DATA_DIR, "kanji.json");
	if (!existsSync(path)) {
		throw new Error(`Missing kanji file: ${path}`);
	}
	const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, KanjiEntry>;
	const items: SrsItem[] = [];
	const now = new Date().toISOString();

	for (const [kanji, entry] of Object.entries(data)) {
		if (entry.jlpt_new == null) continue;
		if (entry.jlpt_new < 1 || entry.jlpt_new > 5) continue;

		const level = `N${entry.jlpt_new}` as SrsLevel;
		const onPart = entry.readings_on.length
			? `On: ${entry.readings_on.join("、")}`
			: "";
		const kunPart = entry.readings_kun.length
			? `Kun: ${entry.readings_kun.join("、")}`
			: "";
		const meaningPart = entry.meanings.length
			? `Meaning: ${entry.meanings.join(", ")}`
			: "";
		const back = [onPart, kunPart, meaningPart].filter(Boolean).join("\n");

		items.push({
			id: `kanji:${kanji}`,
			type: "kanji",
			level,
			front: kanji,
			back,
			notes: entry.strokes ? `Strokes: ${entry.strokes}` : undefined,
			ease: 2.5,
			interval_days: 0,
			due_at: now,
			reps: 0,
			lapses: 0,
		});
	}

	return items;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function summarize(items: SrsItem[]): string {
	const buckets: Record<SrsType, Record<SrsLevel, number>> = {
		vocab: { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0 },
		kanji: { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0 },
		grammar: { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0 },
	};
	for (const item of items) buckets[item.type][item.level]++;

	const lines: string[] = [`\nTotal items: ${items.length}\n`];
	for (const type of ["vocab", "kanji", "grammar"] as const) {
		const total = Object.values(buckets[type]).reduce((a, b) => a + b, 0);
		if (total === 0) continue;
		lines.push(`${type}: ${total}`);
		for (const level of ["N5", "N4", "N3", "N2", "N1"] as const) {
			lines.push(`  ${level}: ${buckets[type][level]}`);
		}
	}
	return lines.join("\n");
}

function main() {
	console.log(`Reading from ${DATA_DIR}…`);
	const vocab = loadVocab();
	const kanji = loadKanji();
	const fresh = [...vocab, ...kanji];
	console.log(summarize(fresh));

	let final = fresh;
	if (APPEND && existsSync(STATE_FILE)) {
		const existing = JSON.parse(readFileSync(STATE_FILE, "utf8")) as SrsItem[];
		const existingIds = new Set(existing.map((i) => i.id));
		const overlap = fresh.filter((i) => existingIds.has(i.id));
		if (overlap.length > 0) {
			throw new Error(
				`--append refused: ${overlap.length} duplicate IDs would clash. ` +
					`Run without --append to overwrite, or remove conflicting items.`,
			);
		}
		final = [...existing, ...fresh];
		console.log(`\nAppended to existing ${existing.length} items.`);
	}

	if (!existsSync(dirname(STATE_FILE))) {
		mkdirSync(dirname(STATE_FILE), { recursive: true });
	}
	writeFileSync(STATE_FILE, JSON.stringify(final, null, 2));
	console.log(`\nWrote ${final.length} item(s) to ${STATE_FILE}`);
}

main();
