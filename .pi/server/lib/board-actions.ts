"use server";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import matter from "gray-matter";
import { getProjectsDir } from "@/lib/board";
import { STATUSES } from "@/lib/board-types";

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_SLUG_LENGTH = 60;
const TITLE_GEN_TIMEOUT_MS = 45_000;

export interface SubmitRequestInput {
  projectSlug: string;
  description: string;
}

export interface SubmitRequestResult {
  ok: boolean;
  cardSlug?: string;
  title?: string;
  error?: string;
}

function truncateWords(s: string, words: number, maxChars: number): string {
  const w = s.trim().split(/\s+/).slice(0, words).join(" ");
  return w.length > maxChars ? w.slice(0, maxChars).replace(/\s+\S*$/, "") : w;
}

async function generateTitle(description: string): Promise<string> {
  const fallback = truncateWords(description, 8, 80) || "New request";
  const prompt = [
    "Generate a concise kanban card title (5–12 words, no quotes, no markdown, no trailing punctuation, no leading verb like \"Add\" / \"Implement\" unless it reads more natural that way).",
    "Output ONLY the title — nothing else, no preamble.",
    "",
    "USER REQUEST:",
    '"""',
    description,
    '"""',
    "",
    "TITLE:",
  ].join("\n");

  return new Promise<string>((resolve) => {
    let settled = false;
    const settle = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        "pi",
        ["--no-session", "--model", "ELICE_GPT_5_MINI/openai/gpt-5-mini", "-p", prompt],
        {
          timeout: TITLE_GEN_TIMEOUT_MS,
          env: { ...process.env, AGENTS_TEAM_NO_TMUX_REEXEC: "1" },
          // Pi reads from stdin during init in some paths; close it so it
          // doesn't block waiting for input.
          stdio: ["ignore", "pipe", "pipe"],
          cwd: path.resolve(process.cwd(), "..", ".."),
        },
      );
    } catch {
      settle(fallback);
      return;
    }

    let out = "";
    let err = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("error", (e) => {
      console.error("[submitRequest] pi spawn error:", e.message);
      settle(fallback);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(
          "[submitRequest] pi exited with code",
          code,
          "stderr:",
          err.slice(0, 500),
          "stdout:",
          out.slice(0, 200),
        );
        return settle(fallback);
      }
      const lastLine = out
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .pop();
      if (!lastLine) return settle(fallback);
      const cleaned = lastLine
        .replace(/^["'`*_]+|["'`*_]+$/g, "")
        .replace(/[.!?]+$/g, "")
        .trim()
        .slice(0, MAX_TITLE_LENGTH);
      settle(cleaned || fallback);
    });
  });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

function isValidProjectSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) && !slug.includes("..");
}

function isValidCardSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) && !slug.includes("..");
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

function escapeYamlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function placeholderTitle(description: string): string {
  return truncateWords(description, 8, 80) || "New request";
}

async function updateCardTitle(
  projectSlug: string,
  cardSlug: string,
  title: string,
): Promise<void> {
  const filePath = path.join(getProjectsDir(), projectSlug, "board", `${cardSlug}.md`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (e) {
    console.error("[submitRequest] cannot read card to update title:", e);
    return;
  }
  const parsed = matter(raw);
  const data = { ...(parsed.data as Record<string, unknown>) };
  data.title = title;
  data.updated = new Date().toLocaleDateString("en-CA");
  delete data.title_pending;
  const newRaw = matter.stringify(parsed.content, data);
  await fs.writeFile(filePath, newRaw, "utf8");
}

async function clearTitlePending(projectSlug: string, cardSlug: string): Promise<void> {
  const filePath = path.join(getProjectsDir(), projectSlug, "board", `${cardSlug}.md`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }
  const parsed = matter(raw);
  const data = { ...(parsed.data as Record<string, unknown>) };
  delete data.title_pending;
  const newRaw = matter.stringify(parsed.content, data);
  await fs.writeFile(filePath, newRaw, "utf8");
}

async function generateTitleInBackground(
  projectSlug: string,
  cardSlug: string,
  description: string,
): Promise<void> {
  try {
    const title = await generateTitle(description);
    if (!title || title === placeholderTitle(description)) {
      await clearTitlePending(projectSlug, cardSlug);
    } else {
      await updateCardTitle(projectSlug, cardSlug, title);
    }
  } catch (e) {
    console.error("[submitRequest] background title gen failed:", e);
    await clearTitlePending(projectSlug, cardSlug).catch(() => {});
  }
  revalidatePath(`/board/${projectSlug}`);
  revalidatePath("/board");
}

export async function submitRequest(input: SubmitRequestInput): Promise<SubmitRequestResult> {
  const { projectSlug, description } = input;

  if (!isValidProjectSlug(projectSlug)) {
    return { ok: false, error: "Invalid project." };
  }
  const trimmedDescription = description.trim();
  if (!trimmedDescription) {
    return { ok: false, error: "Description is required." };
  }
  if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `Description too long (max ${MAX_DESCRIPTION_LENGTH} chars).`,
    };
  }

  const projectsDir = getProjectsDir();
  const projectDir = path.join(projectsDir, projectSlug);
  try {
    const stat = await fs.stat(projectDir);
    if (!stat.isDirectory()) return { ok: false, error: "Project not found." };
  } catch {
    return { ok: false, error: "Project not found." };
  }

  const boardDir = path.join(projectDir, "board");
  await fs.mkdir(boardDir, { recursive: true });

  const provisional = placeholderTitle(trimmedDescription);
  const baseSlug = slugify(provisional) || "request";
  let cardSlug = baseSlug;
  let filePath = path.join(boardDir, `${cardSlug}.md`);
  for (let i = 0; i < 5; i++) {
    try {
      await fs.access(filePath);
      cardSlug = `${baseSlug}-${randomSuffix()}`;
      filePath = path.join(boardDir, `${cardSlug}.md`);
    } catch {
      break;
    }
  }

  const resolved = path.resolve(filePath);
  const resolvedBoardDir = path.resolve(boardDir);
  if (!resolved.startsWith(resolvedBoardDir + path.sep)) {
    return { ok: false, error: "Invalid card path." };
  }

  const today = new Date().toLocaleDateString("en-CA");
  const frontmatter = [
    "---",
    `title: "${escapeYamlString(provisional)}"`,
    "status: request",
    "priority: p3",
    `created: ${today}`,
    `updated: ${today}`,
    "tags: [request]",
    "title_pending: true",
    "---",
    "",
  ].join("\n");

  const body = `## Request\n\n${trimmedDescription}\n`;

  await fs.writeFile(filePath, frontmatter + body, "utf8");
  revalidatePath(`/board/${projectSlug}`);
  revalidatePath("/board");

  // Fire and forget — the response goes back to the client now; Pi keeps
  // running and rewrites the card title when it returns.
  void generateTitleInBackground(projectSlug, cardSlug, trimmedDescription);

  return { ok: true, cardSlug, title: provisional };
}

const MAX_COMMENT_LENGTH = 4000;

interface ActionResult {
  ok: boolean;
  error?: string;
}

function cardFilePath(projectSlug: string, cardSlug: string): string {
  return path.join(getProjectsDir(), projectSlug, "board", `${cardSlug}.md`);
}

async function readCardFile(projectSlug: string, cardSlug: string) {
  const filePath = cardFilePath(projectSlug, cardSlug);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  return { filePath, parsed, data: { ...(parsed.data as Record<string, unknown>) } };
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

export async function addComment(input: {
  projectSlug: string;
  cardSlug: string;
  body: string;
}): Promise<ActionResult> {
  const { projectSlug, cardSlug } = input;
  if (!isValidProjectSlug(projectSlug)) return { ok: false, error: "Invalid project." };
  if (!isValidCardSlug(cardSlug)) return { ok: false, error: "Invalid card." };
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Comment cannot be empty." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Comment too long (max ${MAX_COMMENT_LENGTH} chars).` };
  }

  let card;
  try {
    card = await readCardFile(projectSlug, cardSlug);
  } catch {
    return { ok: false, error: "Card not found." };
  }
  const { filePath, parsed, data } = card;

  const comments = Array.isArray(data.comments) ? [...(data.comments as unknown[])] : [];
  comments.push({
    author: "joseph",
    role: "user",
    ts: new Date().toISOString(),
    body,
  });
  data.comments = comments;
  data.updated = todayIso();

  await fs.writeFile(filePath, matter.stringify(parsed.content, data), "utf8");
  revalidatePath(`/board/${projectSlug}`);
  return { ok: true };
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function deleteCard(input: {
  projectSlug: string;
  cardSlug: string;
}): Promise<ActionResult> {
  const { projectSlug, cardSlug } = input;
  if (!isValidProjectSlug(projectSlug)) return { ok: false, error: "Invalid project." };
  if (!isValidCardSlug(cardSlug)) return { ok: false, error: "Invalid card." };

  const src = cardFilePath(projectSlug, cardSlug);
  const archiveDir = path.join(getProjectsDir(), projectSlug, "board", "_archive");
  const dst = path.join(archiveDir, `${cardSlug}.md`);

  // Sandbox check — both paths must live inside the project's board dir.
  const boardDir = path.resolve(path.join(getProjectsDir(), projectSlug, "board"));
  if (!path.resolve(src).startsWith(boardDir + path.sep)) {
    return { ok: false, error: "Invalid card path." };
  }

  try {
    await fs.access(src);
  } catch {
    return { ok: false, error: "Card not found." };
  }
  await ensureDir(archiveDir);
  await fs.rename(src, dst);
  revalidatePath(`/board/${projectSlug}`);
  revalidatePath("/board");
  return { ok: true };
}

export async function deleteProject(input: { projectSlug: string }): Promise<ActionResult> {
  const { projectSlug } = input;
  if (!isValidProjectSlug(projectSlug)) return { ok: false, error: "Invalid project." };

  const projectsDir = getProjectsDir();
  const src = path.join(projectsDir, projectSlug);
  // Sandbox.
  const root = path.resolve(projectsDir);
  if (!path.resolve(src).startsWith(root + path.sep)) {
    return { ok: false, error: "Invalid project path." };
  }
  try {
    const stat = await fs.stat(src);
    if (!stat.isDirectory()) return { ok: false, error: "Project not found." };
  } catch {
    return { ok: false, error: "Project not found." };
  }

  const archiveDir = path.join(projectsDir, "_archive");
  await ensureDir(archiveDir);
  // Stamp the project file so the archived snapshot reflects the new status.
  const projectMd = path.join(src, "project.md");
  try {
    const raw = await fs.readFile(projectMd, "utf8");
    const parsed = matter(raw);
    const data = { ...(parsed.data as Record<string, unknown>) };
    data.status = "archived";
    data.updated = todayIso();
    await fs.writeFile(projectMd, matter.stringify(parsed.content, data), "utf8");
  } catch {
    // No project.md or write failed — still archive the directory.
  }

  // Avoid clobbering an existing archived copy with the same slug.
  let target = path.join(archiveDir, projectSlug);
  let suffix = 1;
  while (await pathExists(target)) {
    target = path.join(archiveDir, `${projectSlug}-${suffix++}`);
  }
  await fs.rename(src, target);
  revalidatePath("/board");
  return { ok: true };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function unblockCard(input: {
  projectSlug: string;
  cardSlug: string;
  comment: string;
}): Promise<ActionResult> {
  const { projectSlug, cardSlug } = input;
  if (!isValidProjectSlug(projectSlug)) return { ok: false, error: "Invalid project." };
  if (!isValidCardSlug(cardSlug)) return { ok: false, error: "Invalid card." };
  const comment = input.comment.trim();
  if (!comment) {
    return { ok: false, error: "An unblock comment is required." };
  }
  if (comment.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Comment too long (max ${MAX_COMMENT_LENGTH} chars).` };
  }

  let card;
  try {
    card = await readCardFile(projectSlug, cardSlug);
  } catch {
    return { ok: false, error: "Card not found." };
  }
  const { filePath, parsed, data } = card;

  if (data.status !== "blocked") {
    return { ok: false, error: "Card is not blocked." };
  }
  if (!(STATUSES as readonly string[]).includes("backlog")) {
    return { ok: false, error: "Unknown target status." };
  }

  const comments = Array.isArray(data.comments) ? [...(data.comments as unknown[])] : [];
  comments.push({
    author: "joseph",
    role: "user",
    ts: new Date().toISOString(),
    body: `Unblocked: ${comment}`,
  });
  data.comments = comments;
  data.status = "backlog";
  data.updated = todayIso();

  await fs.writeFile(filePath, matter.stringify(parsed.content, data), "utf8");
  revalidatePath(`/board/${projectSlug}`);
  return { ok: true };
}
