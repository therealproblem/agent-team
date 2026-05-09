/**
 * srs — spaced-repetition state store for the Language agent.
 *
 * Holds vocab / kanji / grammar items, schedules reviews, records grades.
 * Implements a minimal SM-2-style scheduler. State persists as JSON under
 * `.pi/state/srs.json` so it survives across Pi sessions.
 *
 * Seeding (e.g. importing a JLPT N3 vocab list) is a separate task — see TODO.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Grade = "again" | "hard" | "good" | "easy";

interface SrsItem {
	id: string;
	type: "vocab" | "kanji" | "grammar";
	level: "N5" | "N4" | "N3" | "N2" | "N1";
	front: string;
	back: string;
	notes?: string;
	ease: number;
	interval_days: number;
	due_at: string;
	reps: number;
	lapses: number;
	last_grade?: Grade;
}

const STATE_FILE = resolve(process.cwd(), ".pi", "state", "srs.json");

async function loadState(): Promise<SrsItem[]> {
	if (!existsSync(STATE_FILE)) return [];
	const buf = await readFile(STATE_FILE, "utf8");
	return JSON.parse(buf);
}

async function saveState(items: SrsItem[]): Promise<void> {
	if (!existsSync(dirname(STATE_FILE))) {
		await mkdir(dirname(STATE_FILE), { recursive: true });
	}
	await writeFile(STATE_FILE, JSON.stringify(items, null, 2));
}

function applyGrade(item: SrsItem, grade: Grade): SrsItem {
	let { ease, interval_days, reps, lapses } = item;
	switch (grade) {
		case "again":
			lapses += 1;
			interval_days = 1;
			ease = Math.max(1.3, ease - 0.2);
			reps = 0;
			break;
		case "hard":
			interval_days = Math.max(1, Math.round(interval_days * 1.2));
			ease = Math.max(1.3, ease - 0.15);
			reps += 1;
			break;
		case "good":
			interval_days = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval_days * ease);
			reps += 1;
			break;
		case "easy":
			interval_days = reps === 0 ? 4 : Math.round(interval_days * ease * 1.3);
			ease += 0.15;
			reps += 1;
			break;
	}
	const due = new Date(Date.now() + interval_days * 24 * 60 * 60 * 1000);
	return { ...item, ease, interval_days, due_at: due.toISOString(), reps, lapses, last_grade: grade };
}

const listDue = defineTool({
	name: "list_due",
	label: "List Due SRS Items",
	description: "List SRS items due now for review.",
	parameters: Type.Object({
		type: Type.Optional(
			Type.Union([Type.Literal("vocab"), Type.Literal("kanji"), Type.Literal("grammar")]),
		),
		level: Type.Optional(
			Type.Union([
				Type.Literal("N5"),
				Type.Literal("N4"),
				Type.Literal("N3"),
				Type.Literal("N2"),
				Type.Literal("N1"),
			]),
		),
		limit: Type.Optional(Type.Number()),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const all = await loadState();
		const now = Date.now();
		const due = all
			.filter((i) => Date.parse(i.due_at) <= now)
			.filter((i) => !params.type || i.type === params.type)
			.filter((i) => !params.level || i.level === params.level)
			.slice(0, params.limit ?? 50);
		const lines = [`${due.length} item(s) due.`, ""];
		for (const item of due) {
			lines.push(
				`- [${item.id}] ${item.type} ${item.level} | ${item.front} → ${item.back.replace(/\n/g, " | ")}`,
			);
		}
		return {
			content: [{ type: "text", text: lines.join("\n") }],
			details: { items: due, total_due: due.length },
		};
	},
});

const recordGrade = defineTool({
	name: "record",
	label: "Record SRS Grade",
	description: "Record a grade for an SRS item; reschedules.",
	parameters: Type.Object({
		item_id: Type.String(),
		grade: Type.Union([
			Type.Literal("again"),
			Type.Literal("hard"),
			Type.Literal("good"),
			Type.Literal("easy"),
		]),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const all = await loadState();
		const idx = all.findIndex((i) => i.id === params.item_id);
		if (idx === -1) {
			return {
				content: [{ type: "text", text: `Unknown item ${params.item_id}` }],
				details: { error: "not_found" },
				isError: true,
			};
		}
		all[idx] = applyGrade(all[idx], params.grade as Grade);
		await saveState(all);
		return {
			content: [{ type: "text", text: `Recorded ${params.grade}; next due ${all[idx].due_at}.` }],
			details: { item: all[idx] },
		};
	},
});

const addItem = defineTool({
	name: "add_item",
	label: "Add SRS Item",
	description: "Add a new SRS item (vocab / kanji / grammar). Used to seed decks.",
	parameters: Type.Object({
		id: Type.String(),
		type: Type.Union([Type.Literal("vocab"), Type.Literal("kanji"), Type.Literal("grammar")]),
		level: Type.Union([
			Type.Literal("N5"),
			Type.Literal("N4"),
			Type.Literal("N3"),
			Type.Literal("N2"),
			Type.Literal("N1"),
		]),
		front: Type.String(),
		back: Type.String(),
		notes: Type.Optional(Type.String()),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
		const all = await loadState();
		if (all.some((i) => i.id === params.id)) {
			return {
				content: [{ type: "text", text: `Item ${params.id} already exists` }],
				details: { error: "duplicate" },
				isError: true,
			};
		}
		const item: SrsItem = {
			id: params.id,
			type: params.type as SrsItem["type"],
			level: params.level as SrsItem["level"],
			front: params.front,
			back: params.back,
			notes: params.notes,
			ease: 2.5,
			interval_days: 0,
			due_at: new Date().toISOString(),
			reps: 0,
			lapses: 0,
		};
		all.push(item);
		await saveState(all);
		return {
			content: [{ type: "text", text: `Added ${params.id} (${params.type}, ${params.level}).` }],
			details: { item },
		};
	},
});

export default function (pi: ExtensionAPI): void {
	pi.registerTool(listDue);
	pi.registerTool(recordGrade);
	pi.registerTool(addItem);
}

// TODO: importer for JLPT level vocab/kanji lists (CSV → add_item batch).
