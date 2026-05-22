import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import {
  COMMENT_ROLES,
  PERSONAS,
  PRIORITIES,
  PROJECT_STATUSES,
  STATUSES,
  type Card,
  type Comment,
  type CommentRole,
  type Persona,
  type Priority,
  type Project,
  type ProjectStatus,
  type Status,
} from "./board-types";

export * from "./board-types";

function getVaultRoot(): string {
  if (process.env.AGENTS_TEAM_VAULT_PATH) return process.env.AGENTS_TEAM_VAULT_PATH;
  // Next.js server runs from .pi/server/. Repo root is two levels up.
  return path.resolve(process.cwd(), "..", "..", "vault");
}

export function getProjectsDir(): string {
  return path.join(getVaultRoot(), "projects");
}

const commentSchema = z.object({
  author: z.string().optional(),
  role: z.string().optional(),
  ts: z.union([z.string(), z.date()]).optional(),
  body: z.string().optional(),
});

const cardFrontmatterSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  persona: z.string().optional(),
  sub_persona: z.string().optional(),
  link: z.string().optional(),
  priority: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created: z.union([z.string(), z.date()]).optional(),
  updated: z.union([z.string(), z.date()]).optional(),
  title_pending: z.boolean().optional(),
  comments: z.array(commentSchema).optional(),
});

// UUID v4, case-insensitive. Stored verbatim — `/c/<id>` route does a direct
// string compare so anything outside this shape can never resolve.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function coerceCardId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s.toLowerCase() : null;
}

const projectFrontmatterSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).optional(),
  created: z.union([z.string(), z.date()]).optional(),
  updated: z.union([z.string(), z.date()]).optional(),
});

function toIsoDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v;
  return null;
}

function coerceStatus(s: unknown): { status: Status; warning: string | null } {
  if (typeof s === "string" && (STATUSES as readonly string[]).includes(s)) {
    return { status: s as Status, warning: null };
  }
  return {
    status: "backlog",
    warning: s ? `Unknown status: ${String(s)}` : "Missing status",
  };
}

function coercePersona(p: unknown): Persona | null {
  if (typeof p === "string" && (PERSONAS as readonly string[]).includes(p)) {
    return p as Persona;
  }
  return null;
}

function coerceProjectStatus(s: unknown): ProjectStatus {
  if (typeof s === "string" && (PROJECT_STATUSES as readonly string[]).includes(s)) {
    return s as ProjectStatus;
  }
  return "active";
}

function coercePriority(p: unknown): Priority | null {
  if (typeof p === "string" && (PRIORITIES as readonly string[]).includes(p)) {
    return p as Priority;
  }
  return null;
}

function coerceCommentRole(r: unknown): CommentRole {
  if (typeof r === "string" && (COMMENT_ROLES as readonly string[]).includes(r)) {
    return r as CommentRole;
  }
  return "user";
}

function coerceTs(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v.trim()) return v;
  return "";
}

function coerceComments(input: unknown): Comment[] {
  if (!Array.isArray(input)) return [];
  const out: Comment[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const body = typeof c.body === "string" ? c.body.trim() : "";
    if (!body) continue;
    out.push({
      author: typeof c.author === "string" && c.author.trim() ? c.author : "unknown",
      role: coerceCommentRole(c.role),
      ts: coerceTs(c.ts),
      body,
    });
  }
  return out;
}

async function parseCard(filePath: string): Promise<Card | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const slug = path.basename(filePath, ".md");
  let data: Record<string, unknown> = {};
  let body = raw;
  let parseError: string | null = null;
  try {
    const parsed = matter(raw);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (e) {
    parseError = `Frontmatter parse error: ${e instanceof Error ? e.message : "unknown"}`;
  }
  if (parseError) {
    return {
      slug,
      id: null,
      title: slug,
      status: "backlog",
      persona: null,
      sub_persona: null,
      link: null,
      priority: null,
      tags: [],
      created: null,
      updated: null,
      body: raw.trim(),
      comments: [],
      titlePending: false,
      warning: parseError,
    };
  }
  const fm = cardFrontmatterSchema.safeParse(data);
  const obj = fm.success ? fm.data : {};
  const { status, warning } = coerceStatus(obj.status);
  return {
    slug,
    id: coerceCardId(obj.id),
    title: (typeof obj.title === "string" && obj.title.trim()) || slug,
    status,
    persona: coercePersona(obj.persona),
    sub_persona: typeof obj.sub_persona === "string" ? obj.sub_persona : null,
    link: typeof obj.link === "string" ? obj.link : null,
    priority: coercePriority(obj.priority),
    tags: Array.isArray(obj.tags) ? obj.tags : [],
    created: toIsoDate(obj.created),
    updated: toIsoDate(obj.updated),
    body: body.trim(),
    comments: coerceComments(obj.comments),
    titlePending: obj.title_pending === true,
    warning: warning ?? (fm.success ? null : "Invalid frontmatter shape"),
  };
}

/**
 * Resolve a card by its globally-unique frontmatter `id`. Walks every
 * project's `board/` (skipping `_archive/` and dotfiles), parses each card,
 * and returns the first match. The scan is O(cards) but bounded — a personal
 * vault tops out at thousands. Returns `null` if no card carries that id.
 */
export async function findCardById(
  id: string,
): Promise<{ projectSlug: string; cardSlug: string } | null> {
  if (!UUID_RE.test(id)) return null;
  const want = id.toLowerCase();
  const projectsDir = getProjectsDir();
  let projectEntries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    projectEntries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const proj of projectEntries) {
    if (!proj.isDirectory()) continue;
    const projectSlug = proj.name;
    if (projectSlug.startsWith(".") || projectSlug.startsWith("_")) continue;
    const boardDir = path.join(projectsDir, projectSlug, "board");
    let cardEntries: Array<{ name: string; isFile(): boolean }>;
    try {
      cardEntries = await fs.readdir(boardDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const c of cardEntries) {
      if (!c.isFile() || !c.name.endsWith(".md") || c.name.startsWith(".")) continue;
      const card = await parseCard(path.join(boardDir, c.name));
      if (card?.id === want) {
        return { projectSlug, cardSlug: card.slug };
      }
    }
  }
  return null;
}

async function readProjectMeta(slug: string, projectDir: string): Promise<Project> {
  const projectMdPath = path.join(projectDir, "project.md");
  let raw: string | null = null;
  try {
    raw = await fs.readFile(projectMdPath, "utf8");
  } catch {
    raw = null;
  }
  let data: Record<string, unknown> = {};
  let body = "";
  if (raw !== null) {
    try {
      const parsed = matter(raw);
      data = parsed.data as Record<string, unknown>;
      body = parsed.content.trim();
    } catch {
      body = raw.trim();
    }
  }
  const fm = projectFrontmatterSchema.safeParse(data);
  const obj = fm.success ? fm.data : {};
  return {
    slug,
    name: (typeof obj.name === "string" && obj.name.trim()) || slug,
    status: coerceProjectStatus(obj.status),
    owner: coercePersona(obj.owner),
    tags: Array.isArray(obj.tags) ? obj.tags : [],
    created: toIsoDate(obj.created),
    updated: toIsoDate(obj.updated),
    description: (typeof obj.description === "string" && obj.description.trim()) || "",
    body,
    cardCounts: emptyCardCounts(),
  };
}

async function listCardsInProject(projectDir: string): Promise<Card[]> {
  const boardDir = path.join(projectDir, "board");
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await fs.readdir(boardDir, { withFileTypes: true });
  } catch {
    return [];
  }
  // Skip _archive/ and dotfiles — archived cards live in board/_archive/<slug>.md.
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && !e.name.startsWith("."))
    .map((e) => e.name);
  const cards = await Promise.all(
    files.map((f) => parseCard(path.join(boardDir, f))),
  );
  return cards.filter((c): c is Card => c !== null);
}

const STATUS_ORDER: Record<Status, number> = {
  request: 0,
  triage: 1,
  backlog: 2,
  blocked: 3,
  in_progress: 4,
  in_review: 5,
  done: 6,
};

const PRIORITY_ORDER: Record<Priority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    const ap = a.priority ? PRIORITY_ORDER[a.priority] : 99;
    const bp = b.priority ? PRIORITY_ORDER[b.priority] : 99;
    if (ap !== bp) return ap - bp;
    const au = a.updated ?? "";
    const bu = b.updated ?? "";
    if (au !== bu) return bu.localeCompare(au);
    return a.title.localeCompare(b.title);
  });
}

const PROJECT_STATUS_ORDER: Record<ProjectStatus, number> = {
  active: 0,
  paused: 1,
  done: 2,
  archived: 3,
};

function emptyCardCounts(): Record<Status, number> {
  return Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
}

function countCards(cards: Card[]): Record<Status, number> {
  const counts = emptyCardCounts();
  for (const c of cards) counts[c.status]++;
  return counts;
}

export async function listProjects(): Promise<Project[]> {
  const projectsDir = getProjectsDir();
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const projects: Project[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    // Skip dotfiles, the template, and the _archive sink.
    if (slug.startsWith(".") || slug.startsWith("_")) continue;
    const projectDir = path.join(projectsDir, slug);
    const project = await readProjectMeta(slug, projectDir);
    if (project.status === "archived") continue;
    const cards = await listCardsInProject(projectDir);
    project.cardCounts = countCards(cards);
    projects.push(project);
  }
  projects.sort((a, b) => {
    const s = PROJECT_STATUS_ORDER[a.status] - PROJECT_STATUS_ORDER[b.status];
    if (s !== 0) return s;
    const au = a.updated ?? "";
    const bu = b.updated ?? "";
    if (au !== bu) return bu.localeCompare(au);
    return a.name.localeCompare(b.name);
  });
  return projects;
}

export async function loadProject(slug: string): Promise<{ project: Project; cards: Card[] } | null> {
  if (slug.startsWith("_") || slug.startsWith(".")) return null;
  const projectDir = path.join(getProjectsDir(), slug);
  try {
    const stat = await fs.stat(projectDir);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  const project = await readProjectMeta(slug, projectDir);
  if (project.status === "archived") return null;
  const cards = sortCards(await listCardsInProject(projectDir));
  project.cardCounts = countCards(cards);
  return { project, cards };
}
