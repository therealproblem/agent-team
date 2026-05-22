import "server-only";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { revalidatePath } from "next/cache";
import { getProjectsDir } from "@/lib/board";

/**
 * Coordinates PM replies to user comments on kanban cards.
 *
 * When a `role: user` comment lands on a card, the server flags the card
 * `pm_reply_pending: true` and schedules a per-card debounce timer. Each new
 * user comment on the same card resets the timer; when it elapses, we fire
 * one `pi --no-session` against the card with a prompt that tells the PM
 * persona to read the thread and post a reply via `board_add_comment`.
 *
 * Why debounce instead of fire-per-comment: the user often leaves several
 * comments in a row ("oh and also…"). Coalescing them into one PM round-trip
 * is cheaper and produces a coherent reply that addresses the whole burst,
 * not a chain of fragments.
 *
 * Restart safety: timers live in this module's memory. If the Next.js
 * server restarts mid-window, the in-flight timer is lost. On the next
 * `addComment` call we call `sweepStalePendings()` which walks the vault
 * and re-fires any card whose `pm_reply_pending` flag is still set. The
 * stale comment thread is older than the debounce, so it fires immediately.
 */

const DEFAULT_DEBOUNCE_MS = 30_000;
const PI_SPAWN_TIMEOUT_MS = 5 * 60_000; // 5 min — PM reply may spawn engineer
const TELEGRAM_PUSH_TIMEOUT_MS = 5_000;

function debounceMs(): number {
  const v = process.env.AGENTS_TEAM_PM_REPLY_DEBOUNCE_MS;
  if (!v) return DEFAULT_DEBOUNCE_MS;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_DEBOUNCE_MS;
  return n;
}

interface PendingEntry {
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingEntry>();

function cardKey(projectSlug: string, cardSlug: string): string {
  return `${projectSlug}/${cardSlug}`;
}

function cardPath(projectSlug: string, cardSlug: string): string {
  return path.join(getProjectsDir(), projectSlug, "board", `${cardSlug}.md`);
}

async function setPendingFlag(
  projectSlug: string,
  cardSlug: string,
  value: boolean,
): Promise<void> {
  const filePath = cardPath(projectSlug, cardSlug);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }
  let parsed;
  try {
    parsed = matter(raw);
  } catch {
    return;
  }
  const data = { ...(parsed.data as Record<string, unknown>) };
  if (value) {
    if (data.pm_reply_pending === true) return; // already set; no write
    data.pm_reply_pending = true;
  } else {
    if (!("pm_reply_pending" in data)) return; // already absent; no write
    delete data.pm_reply_pending;
  }
  await fs.writeFile(filePath, matter.stringify(parsed.content, data), "utf8");
}

function repoRoot(): string {
  // Next.js server runs from .pi/server/. Repo root is two levels up.
  return path.resolve(process.cwd(), "..", "..");
}

/**
 * Fire-and-forget `pi --no-session` that tells PM to read the card and
 * post a reply via `board_add_comment`. Pi's extensions (including
 * `board_add_comment` and `subagent`) load even in --no-session mode, so
 * PM can spawn engineer for feasibility if needed.
 */
function spawnPmReply(projectSlug: string, cardSlug: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const vaultPath = `projects/${projectSlug}/board/${cardSlug}.md`;
  const prompt = [
    "You are the PM persona. A user comment thread on a kanban card needs your reply.",
    "",
    `Project: ${projectSlug}`,
    `Card slug: ${cardSlug}`,
    `Card path: vault/${vaultPath}`,
    "",
    "Steps:",
    `1. Read \`vault/${vaultPath}\` end-to-end — frontmatter, body, every comment.`,
    "2. Identify what's unanswered. The unread bucket is every user comment after the most recent pm/engineer comment (or all user comments if there are no pm/engineer comments yet).",
    "3. If the question is implementation-level, spawn the engineer subagent with a feasibility brief and weave its one-line outcome into your reply.",
    "4. Post ONE reply via the `board_add_comment` tool with `role: pm`. Address the whole burst of unread comments together, not one at a time. Be terse — match the tone of the user's comments. No reasoning history, no preamble.",
    "5. If the comment doesn't actually need a reply (a passing remark, a 'noted', etc.), still post a one-line acknowledgement so the user knows you saw it.",
    "",
    "Adopt the pm persona first (read .pi/skills/pm/SKILL.md), then act. Surface nothing in chat — your output is the comment.",
  ].join("\n");

  return new Promise((resolve) => {
    let settled = false;
    const settle = (res: { ok: boolean; stdout: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    let child;
    try {
      child = spawn("pi", ["--no-session", "-p", prompt], {
        timeout: PI_SPAWN_TIMEOUT_MS,
        env: { ...process.env, AGENTS_TEAM_NO_TMUX_REEXEC: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        cwd: repoRoot(),
      });
    } catch (e) {
      console.error("[pm-reply] spawn error:", (e as Error).message);
      return settle({ ok: false, stdout: "", stderr: (e as Error).message });
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
      console.error("[pm-reply] pi error:", e.message);
      settle({ ok: false, stdout: out, stderr: err + "\n" + e.message });
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(
          "[pm-reply] pi exited with code",
          code,
          "stderr:",
          err.slice(0, 500),
          "stdout:",
          out.slice(0, 200),
        );
      }
      settle({ ok: code === 0, stdout: out, stderr: err });
    });
  });
}

/**
 * Push a notification to every allowed Telegram chat that PM replied on a
 * card. Best-effort — failures (no token, no allowlist, network) are
 * swallowed so the main flow isn't blocked.
 */
async function pushTelegramNotice(projectSlug: string, cardSlug: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowed = process.env.TELEGRAM_ALLOWED_CHATS;
  if (!token || !allowed) return;

  const chats = allowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (chats.length === 0) return;

  // Reconstruct the short URL from the freshly-read card so we get the id
  // even if it landed via backfill.
  let cardId: string | null = null;
  let title = cardSlug;
  try {
    const raw = await fs.readFile(cardPath(projectSlug, cardSlug), "utf8");
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    if (typeof data.id === "string") cardId = data.id;
    if (typeof data.title === "string" && data.title.trim()) title = data.title.trim();
  } catch {
    // Best-effort — fall through with what we have.
  }

  const base = (
    process.env.AGENTS_TEAM_SERVER_PUBLIC_URL ||
    `http://localhost:${process.env.AGENTS_TEAM_SERVER_PORT || "8080"}`
  ).replace(/\/+$/, "");
  const url = cardId
    ? `${base}/c/${cardId}`
    : `${base}/projects/${projectSlug}?card=${cardSlug}`;

  const safeTitle = title.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const text = `💬 PM replied on <b>${safeTitle}</b>\n<a href="${url}">Open card</a>`;

  await Promise.all(
    chats.map(async (chatId) => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), TELEGRAM_PUSH_TIMEOUT_MS);
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        }).finally(() => clearTimeout(t));
      } catch (e) {
        console.error("[pm-reply] telegram push failed for chat", chatId, (e as Error).message);
      }
    }),
  );
}

async function fireReply(projectSlug: string, cardSlug: string): Promise<void> {
  pending.delete(cardKey(projectSlug, cardSlug));
  try {
    const res = await spawnPmReply(projectSlug, cardSlug);
    if (res.ok) {
      // PM's board_add_comment call already wrote the comment + bumped
      // `updated:`. Clear the pending flag here so the polling client stops.
      await setPendingFlag(projectSlug, cardSlug, false);
      await pushTelegramNotice(projectSlug, cardSlug);
    } else {
      // Pi failed — clear the pending flag so the UI doesn't hang forever.
      // The user can re-comment to retry.
      await setPendingFlag(projectSlug, cardSlug, false);
    }
  } catch (e) {
    console.error("[pm-reply] fireReply crashed:", (e as Error).message);
    await setPendingFlag(projectSlug, cardSlug, false).catch(() => {});
  } finally {
    revalidatePath(`/projects/${projectSlug}`);
  }
}

/**
 * Public entry point — called by `addComment` after a `role: user` comment
 * is appended to the card. Stamps `pm_reply_pending: true` and (re)starts
 * the debounce timer.
 */
export async function scheduleReply(
  projectSlug: string,
  cardSlug: string,
): Promise<void> {
  await setPendingFlag(projectSlug, cardSlug, true);

  const key = cardKey(projectSlug, cardSlug);
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);

  const ms = debounceMs();
  if (ms === 0) {
    // Test hook — fire synchronously.
    pending.delete(key);
    void fireReply(projectSlug, cardSlug);
    return;
  }

  const timer = setTimeout(() => {
    void fireReply(projectSlug, cardSlug);
  }, ms);
  // Don't keep the process alive just for this timer.
  if (typeof timer.unref === "function") timer.unref();
  pending.set(key, { timer });
}

/**
 * Walk every card looking for `pm_reply_pending: true` that has no live
 * timer in memory — these are leftovers from a server restart. Fire them
 * immediately (the debounce already elapsed while we were down).
 *
 * Called from `addComment` on every user write so it self-heals lazily
 * without needing a startup hook into Next.js.
 */
let sweptOnce = false;
export async function sweepStalePendings(): Promise<void> {
  if (sweptOnce) return;
  sweptOnce = true;

  const projectsDir = getProjectsDir();
  let projEntries;
  try {
    projEntries = await fs.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const proj of projEntries) {
    if (!proj.isDirectory()) continue;
    const projectSlug = proj.name;
    if (projectSlug.startsWith(".") || projectSlug.startsWith("_")) continue;
    const boardDir = path.join(projectsDir, projectSlug, "board");
    let cardEntries;
    try {
      cardEntries = await fs.readdir(boardDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const c of cardEntries) {
      if (!c.isFile() || !c.name.endsWith(".md") || c.name.startsWith(".")) continue;
      const cardSlug = c.name.replace(/\.md$/, "");
      const filePath = path.join(boardDir, c.name);
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = matter(raw);
        const data = parsed.data as Record<string, unknown>;
        if (data.pm_reply_pending === true && !pending.has(cardKey(projectSlug, cardSlug))) {
          console.log(`[pm-reply] sweeping stale pending: ${projectSlug}/${cardSlug}`);
          void fireReply(projectSlug, cardSlug);
        }
      } catch {
        // Parse failure — skip.
      }
    }
  }
}
