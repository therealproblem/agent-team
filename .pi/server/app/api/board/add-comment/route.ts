/*
 * POST /api/board/add-comment — agent-side comment poster.
 *
 * Sibling to `addComment` in board-actions.ts. That server action is for the
 * user: it appends a `role: user` comment and fires the PM reply pipeline.
 * This route is for the **agent** (PM or engineer): it appends a `role: pm`
 * or `role: engineer` comment and explicitly does NOT trigger another reply
 * — that would loop forever.
 *
 * When `role: pm`, the route also clears `pm_reply_pending` so the UI
 * spinner stops. (For `role: engineer`, the flag is left alone — engineer
 * comments don't conclude the user-facing reply cycle.)
 *
 * The extension `board_add_comment` tool POSTs here so the YAML rewrite
 * lives where `gray-matter` is installed (the server, not Pi's runtime).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import matter from "gray-matter";
import { revalidatePath } from "next/cache";
import { getProjectsDir } from "@/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_LENGTH = 4_000;
const VALID_ROLES = new Set(["pm", "engineer"]);

function isValidSlug(s: string): boolean {
  return typeof s === "string" && /^[a-z0-9][a-z0-9-]*$/.test(s) && !s.includes("..");
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

export async function POST(req: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const projectSlug = String(payload.project_slug ?? "");
  const cardSlug = String(payload.card_slug ?? "");
  const body = String(payload.body ?? "").trim();
  const role = String(payload.role ?? "");
  const author = typeof payload.author === "string" && payload.author.trim() ? payload.author.trim() : role;

  if (!isValidSlug(projectSlug)) {
    return NextResponse.json({ ok: false, error: "Invalid project_slug." }, { status: 400 });
  }
  if (!isValidSlug(cardSlug)) {
    return NextResponse.json({ ok: false, error: "Invalid card_slug." }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ ok: false, error: "body is required." }, { status: 400 });
  }
  if (body.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `body too long (max ${MAX_BODY_LENGTH} chars).` },
      { status: 400 },
    );
  }
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json(
      { ok: false, error: 'role must be "pm" or "engineer".' },
      { status: 400 },
    );
  }

  const filePath = path.join(getProjectsDir(), projectSlug, "board", `${cardSlug}.md`);

  // Sandbox: the resolved path must stay under the project's board dir.
  const boardDir = path.resolve(path.join(getProjectsDir(), projectSlug, "board"));
  if (!path.resolve(filePath).startsWith(boardDir + path.sep)) {
    return NextResponse.json({ ok: false, error: "Invalid card path." }, { status: 400 });
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return NextResponse.json({ ok: false, error: "Card not found." }, { status: 404 });
  }

  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Frontmatter parse error: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const data = { ...(parsed.data as Record<string, unknown>) };
  const comments = Array.isArray(data.comments) ? [...(data.comments as unknown[])] : [];
  comments.push({
    author,
    role,
    ts: new Date().toISOString(),
    body,
  });
  data.comments = comments;
  data.updated = todayIso();
  // Clear the pending flag iff PM is the one replying. Engineer comments are
  // intermediate (PM still owes the user a reply that weaves engineer's
  // findings in), so they shouldn't take the spinner down.
  if (role === "pm" && "pm_reply_pending" in data) {
    delete data.pm_reply_pending;
  }

  await fs.writeFile(filePath, matter.stringify(parsed.content, data), "utf8");
  revalidatePath(`/projects/${projectSlug}`);

  return NextResponse.json({
    ok: true,
    projectSlug,
    cardSlug,
    role,
    commentIndex: comments.length - 1,
  });
}
