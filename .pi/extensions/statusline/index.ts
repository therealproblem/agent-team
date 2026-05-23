/**
 * statusline — replaces Pi's default footer with a two-line layout:
 *
 *   Line 1: pwd (left)                                            context%/window  model (right)
 *   Line 2: pm | educator | ...        (active-project)            NEWS N REM M SRV port
 *
 * Active persona is detected by hooking the `tool_call` event: when the
 * agent `read`s `.pi/skills/<persona>/SKILL.md`, that persona becomes
 * active for the rest of this session (matching the adoption protocol in
 * `.pi/SYSTEM.md`). Deliberately **not persisted** — every session starts
 * personaless, which matches the root-agent's actual state on a fresh
 * boot. The earlier file-based approach leaked stale personas into new
 * sessions where the agent had not actually adopted anything.
 *
 * Active project is detected the same way — Pi handles many projects in
 * parallel, and PM in particular needs to be visibly grounded so the user
 * can spot when it's reasoning against the wrong project and redirect.
 * Signals (most-recent wins): `board_create_card` / `board_add_comment`
 * (explicit `project_slug` arg), or any `read`/`edit`/`write` whose path
 * sits under `vault/projects/<slug>/`. Reset on session_start.
 *
 * Pi's built-in `FooterComponent` is bypassed entirely — we render both
 * lines ourselves. Line 1 reuses the same data sources Pi reads
 * (`ctx.getContextUsage`, `ctx.model`, `ctx.sessionManager.getCwd`).
 *
 * The only public API for changing the footer is `ctx.ui.setFooter`, so
 * we hook that on session_start; the factory returns our Component.
 * Re-renders are triggered by Pi's `setExtensionStatus` (which calls
 * `requestRender`), so persona changes piggyback by toggling a sentinel
 * status key after updating module state.
 *
 * Personas and labels are loaded from `.pi/state/persona-registry.json` —
 * the canonical registry. Adding/removing/renaming a persona requires
 * updating only that file plus the persona's SKILL.md.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type Theme,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";

interface PersonaRegistryEntry {
	label: string;
	skillPath: string;
	description: string;
	innerSkills?: string[];
}

interface PersonaRegistry {
	personas: Record<string, PersonaRegistryEntry>;
	subagents: Record<string, unknown>;
}

let PERSONAS: readonly string[];
let PERSONA_LABELS: Record<string, string>;
let SKILL_REGEX: RegExp;

function loadRegistry(): void {
	const registryPath = resolve(process.cwd(), ".pi/state/persona-registry.json");
	const registry: PersonaRegistry = JSON.parse(readFileSync(registryPath, "utf-8"));
	PERSONAS = Object.keys(registry.personas);
	PERSONA_LABELS = Object.fromEntries(
		PERSONAS.map((key) => [key, registry.personas[key].label]),
	);
	// No escaping needed — persona keys are alphanumeric slugs
	const pattern = PERSONAS.join("|");
	SKILL_REGEX = new RegExp("\\.pi/skills/(" + pattern + ")/SKILL\\.md$");
}

loadRegistry();

type Persona = string;

let activePersona: Persona | null = null;
let activeProject: string | null = null;

/** Matches `vault/projects/<slug>/...` in both relative and absolute paths. */
const PROJECT_PATH_REGEX = /(?:^|\/)vault\/projects\/([a-z0-9][a-z0-9-]*)(?:\/|$)/;
/** Project-aware tools that carry an explicit `project_slug` arg. */
const PROJECT_TOOLS = new Set(["board_create_card", "board_add_comment"]);

/** Sanitiser matching what Pi applies internally to extension statuses. */
function sanitiseStatus(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

/** Compact token formatter matching Pi's footer style. */
function formatTokens(n: number): string {
	if (n < 1000) return String(n);
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	if (n < 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	return `${Math.round(n / 1_000_000)}M`;
}

class TwoLineFooter implements Component {
	constructor(
		private ctx: ExtensionContext,
		private theme: Theme,
		private footerData: ReadonlyFooterDataProvider,
	) {}

	invalidate(): void {
		// Nothing cached; render reads everything fresh each call.
	}

	private renderLine1(width: number): string {
		const sm = this.ctx.sessionManager;
		let pwd = sm.getCwd();
		const home = process.env.HOME || process.env.USERPROFILE;
		if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
		const branch = this.footerData.getGitBranch();
		if (branch) pwd = `${pwd} (${branch})`;
		const sessionName = sm.getSessionName();
		if (sessionName) pwd = `${pwd} • ${sessionName}`;

		const usage = this.ctx.getContextUsage();
		const contextWindow =
			usage?.contextWindow ?? this.ctx.model?.contextWindow ?? 0;
		const pctValue = usage?.percent;
		const pctStr =
			pctValue === null || pctValue === undefined
				? "?"
				: `${pctValue.toFixed(1)}%`;
		const windowStr = contextWindow > 0 ? formatTokens(contextWindow) : "?";

		let pctColored: string;
		if (typeof pctValue === "number" && pctValue > 90) {
			pctColored = this.theme.fg("error", pctStr);
		} else if (typeof pctValue === "number" && pctValue > 70) {
			pctColored = this.theme.fg("warning", pctStr);
		} else {
			pctColored = this.theme.fg("dim", pctStr);
		}
		const model = this.ctx.model?.id ?? "no-model";
		const rightPlain = `${pctStr}/${windowStr}  ${model}`;
		const right = `${pctColored}${this.theme.fg("dim", `/${windowStr}  ${model}`)}`;

		const pwdLeft = this.theme.fg("dim", pwd);
		const pwdW = visibleWidth(pwd);
		const rightW = visibleWidth(rightPlain);
		if (pwdW + 2 + rightW <= width) {
			return pwdLeft + " ".repeat(width - pwdW - rightW) + right;
		}
		// Doesn't fit — drop pwd and ellipsis-truncate the right chunk.
		return rightW <= width
			? " ".repeat(width - rightW) + right
			: truncateToWidth(right, width, this.theme.fg("dim", "..."));
	}

	private renderLine2(width: number): string {
		const sep = this.theme.fg("dim", " | ");
		const personaCells = PERSONAS.map((p) => {
			const label = PERSONA_LABELS[p];
			return p === activePersona
				? this.theme.fg("accent", this.theme.bold(label))
				: this.theme.fg("dim", label);
		});
		const personasLeft = personaCells.join(sep);
		const personasW =
			PERSONAS.reduce((acc, p) => acc + PERSONA_LABELS[p].length, 0) +
			(PERSONAS.length - 1) * 3; // " | " is 3 visible cols each

		const statuses = this.footerData.getExtensionStatuses();
		const extPlain =
			statuses.size === 0
				? ""
				: Array.from(statuses.entries())
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([, text]) => sanitiseStatus(text))
						.join(" ");
		// Dim the statuses so they match the rest of the footer's tone.
		const extStatuses = extPlain ? this.theme.fg("dim", extPlain) : "";
		const extW = visibleWidth(extPlain);

		// Project indicator sits between personas (left) and statuses (right).
		// Rendered in accent (no bold) so it's visibly the "thing I'm grounded
		// on" without competing with the active persona's accent+bold.
		const projectPlain = activeProject ? `(${activeProject})` : "";
		const projectCell = activeProject
			? this.theme.fg("accent", projectPlain)
			: "";
		const projectW = visibleWidth(projectPlain);

		// Layout priority: if all three fit with a 2-col gap on each side of
		// the project cell, render the three-column layout (centered project).
		if (projectW > 0 && personasW + 2 + projectW + 2 + extW <= width) {
			const gap = width - personasW - projectW - extW;
			const leftGap = Math.floor(gap / 2);
			const rightGap = gap - leftGap;
			return (
				personasLeft +
				" ".repeat(leftGap) +
				projectCell +
				" ".repeat(rightGap) +
				extStatuses
			);
		}

		if (personasW + 2 + extW <= width) {
			return personasLeft + " ".repeat(width - personasW - extW) + extStatuses;
		}
		// Personas + statuses don't fit on one line. Prioritise statuses:
		// drop personas first, ellipsis-truncate statuses only if still too wide.
		return extW <= width
			? " ".repeat(width - extW) + extStatuses
			: truncateToWidth(extStatuses, width, this.theme.fg("dim", "..."));
	}

	render(width: number): string[] {
		return [this.renderLine1(width), this.renderLine2(width)];
	}
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		// Always start personaless / projectless. Adoption / project pickup
		// happens only via the agent's own tool calls within the session
		// (handler below) — never inherited across sessions.
		activePersona = null;
		activeProject = null;
		ctx.ui.setFooter((_tui, theme, footerData) => {
			return new TwoLineFooter(ctx, theme, footerData);
		});
	});

	pi.on("tool_call", (event, ctx) => {
		let changed = false;

		// Persona adoption: agent reads `.pi/skills/<persona>/SKILL.md`.
		// Matches the protocol in .pi/SYSTEM.md ("Adopt one of these by loading
		// its skill — read its SKILL.md and follow its instructions").
		if (event.toolName === "read") {
			const input = event.input as { path?: string; file_path?: string };
			const raw = input.file_path ?? input.path;
			if (typeof raw === "string") {
				const m = raw.match(SKILL_REGEX);
				if (m && activePersona !== m[1]) {
					activePersona = m[1];
					changed = true;
				}
			}
		}

		// Project pickup: most recent signal wins.
		//   - board_create_card / board_add_comment carry `project_slug`
		//     directly. Authoritative.
		//   - read / edit / write whose path sits under `vault/projects/<slug>/`
		//     is a reliable signal too (PM reads `project.md` on adoption,
		//     edits cards under `board/`, etc.).
		// Other tools (ls, grep, find, bash) are noisy — skipped.
		let detectedProject: string | null = null;
		if (PROJECT_TOOLS.has(event.toolName)) {
			const input = event.input as { project_slug?: unknown };
			if (typeof input.project_slug === "string" && input.project_slug.trim()) {
				detectedProject = input.project_slug.trim();
			}
		} else if (
			event.toolName === "read" ||
			event.toolName === "edit" ||
			event.toolName === "write"
		) {
			const input = event.input as { path?: string; file_path?: string };
			const raw = input.file_path ?? input.path;
			if (typeof raw === "string") {
				const m = raw.match(PROJECT_PATH_REGEX);
				if (m) detectedProject = m[1];
			}
		}
		if (detectedProject && detectedProject !== activeProject) {
			activeProject = detectedProject;
			changed = true;
		}

		if (changed) {
			// Trigger a footer re-render. setStatus calls requestRender
			// even when the underlying map doesn't change.
			ctx.ui.setStatus("9render", undefined);
		}
		return undefined;
	});
}
