import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import {
  PERSONAS,
  PRIORITIES,
  PROJECT_STATUSES,
  STATUSES,
  type Card,
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

const cardFrontmatterSchema = z.object({
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
});

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
      titlePending: false,
      warning: parseError,
    };
  }
  const fm = cardFrontmatterSchema.safeParse(data);
  const obj = fm.success ? fm.data : {};
  const { status, warning } = coerceStatus(obj.status);
  return {
    slug,
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
    titlePending: obj.title_pending === true,
    warning: warning ?? (fm.success ? null : "Invalid frontmatter shape"),
  };
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
    cardCounts: { backlog: 0, in_progress: 0, in_review: 0, blocked: 0, done: 0 },
  };
}

async function listCardsInProject(projectDir: string): Promise<Card[]> {
  const boardDir = path.join(projectDir, "board");
  let entries: string[];
  try {
    entries = await fs.readdir(boardDir);
  } catch {
    return [];
  }
  const cards = await Promise.all(
    entries.filter((f) => f.endsWith(".md")).map((f) => parseCard(path.join(boardDir, f))),
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

function countCards(cards: Card[]): Record<Status, number> {
  const counts: Record<Status, number> = {
    backlog: 0,
    in_progress: 0,
    in_review: 0,
    blocked: 0,
    done: 0,
  };
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
    if (slug.startsWith(".")) continue;
    const projectDir = path.join(projectsDir, slug);
    const project = await readProjectMeta(slug, projectDir);
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
  const projectDir = path.join(getProjectsDir(), slug);
  try {
    const stat = await fs.stat(projectDir);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  const project = await readProjectMeta(slug, projectDir);
  const cards = sortCards(await listCardsInProject(projectDir));
  project.cardCounts = countCards(cards);
  return { project, cards };
}
