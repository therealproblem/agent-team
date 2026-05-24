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
 * Pick the chat id PM should notify on Telegram. We use the first entry in
 * TELEGRAM_ALLOWED_CHATS as the "primary" chat; if the user has multiple
 * allowed chats they're treated as peers and PM only pings the first.
 * Returns null when no allowlist is configured (PM's telegram_send tool
 * then no-ops cleanly).
 */
function pmTelegramChatId(): string | null {
  const allowed = process.env.TELEGRAM_ALLOWED_CHATS;
  if (!allowed) return null;
  const first = allowed.split(",").map((s) => s.trim()).find(Boolean);
  return first ?? null;
}

/**
 * Best-effort frontmatter read for the card's `id` and `title`. Used to
 * build the deep link PM embeds in its Telegram notice. Returns empty
 * strings on any failure — the caller falls back to slug-based values.
 */
async function readCardMeta(
  projectSlug: string,
  cardSlug: string,
): Promise<{ id: string; title: string }> {
  try {
    const raw = await fs.readFile(cardPath(projectSlug, cardSlug), "utf8");
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const id = typeof data.id === "string" ? data.id : "";
    // Squash to a single line and trim so the value drops cleanly into the
    // prompt template (and into the Telegram message PM will compose).
    const rawTitle = typeof data.title === "string" ? data.title : "";
    const title = rawTitle.replace(/\s+/g, " ").trim();
    return { id, title };
  } catch {
    return { id: "", title: "" };
  }
}

/**
 * Build the URL PM should include in its Telegram notice. Mirrors the
 * convention used by board tools: `/c/<id>` when the card has been
 * assigned a stable id, otherwise fall back to `/projects/<slug>?card=<slug>`.
 */
function buildCardUrl(projectSlug: string, cardSlug: string, cardId: string): string {
  const base = (
    process.env.AGENTS_TEAM_SERVER_PUBLIC_URL ||
    `http://localhost:${process.env.AGENTS_TEAM_SERVER_PORT || "8080"}`
  ).replace(/\/+$/, "");
  return cardId
    ? `${base}/c/${cardId}`
    : `${base}/projects/${projectSlug}?card=${cardSlug}`;
}

/**
 * Fire-and-forget `pi --no-session` that tells PM to read the card and
 * post a reply via `board_add_comment`. Pi's extensions (including
 * `board_add_comment` and `subagent`) load even in --no-session mode, so
 * PM can spawn engineer for feasibility if needed.
 *
 * The spawn env carries TELEGRAM_REPLY_CHAT_ID so PM's `telegram_send`
 * tool resolves to the user's primary chat without PM having to know the
 * id. PM is instructed to call the tool after posting its reply.
 */
async function spawnPmReply(projectSlug: string, cardSlug: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const vaultPath = `projects/${projectSlug}/board/${cardSlug}.md`;
  const replyChatId = pmTelegramChatId();
  const meta = await readCardMeta(projectSlug, cardSlug);
  const cardUrl = buildCardUrl(projectSlug, cardSlug, meta.id);
  const displayTitle = meta.title || cardSlug;
  const prompt = [
    "You are the PM persona. A user comment thread on a kanban card needs your reply.",
    "",
    `Project: ${projectSlug}`,
    `Card slug: ${cardSlug}`,
    `Card path: vault/${vaultPath}`,
    `Card title: ${displayTitle}`,
    `Card URL: ${cardUrl}`,
    "",
    "Steps:",
    `1. Read \`vault/${vaultPath}\` end-to-end — frontmatter, body, every comment.`,
    "2. Identify what's unanswered. The unread bucket is every user comment after the most recent pm/engineer comment (or all user comments if there are no pm/engineer comments yet).",
    "3. If the question is implementation-level, spawn the engineer subagent with a feasibility brief and weave its one-line outcome into your reply.",
    "4. Post ONE reply via the `board_add_comment` tool with `role: pm`. Address the whole burst of unread comments together, not one at a time. Be terse — match the tone of the user's comments. No reasoning history, no preamble.",
    "5. If the comment doesn't actually need a reply (a passing remark, a 'noted', etc.), still post a one-line acknowledgement so the user knows you saw it.",
    "6. After board_add_comment succeeds, call the `telegram_send` tool. Format the `text` parameter EXACTLY as the three lines below (replace `<reply summary>` with one short sentence summarising your reply; leave the title and URL exactly as shown):",
    "",
    `   💬 PM on ${displayTitle}: <reply summary>`,
    `   ${cardUrl}`,
    "",
    "   Omit `chat_id`; the env carries it. Skip this step only if telegram_send returns a \"(skipped)\" result.",
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

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AGENTS_TEAM_NO_TMUX_REEXEC: "1",
    };
    if (replyChatId) env.TELEGRAM_REPLY_CHAT_ID = replyChatId;

    let child;
    try {
      child = spawn("pi", ["--no-session", "-p", prompt], {
        timeout: PI_SPAWN_TIMEOUT_MS,
        env,
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

async function fireReply(projectSlug: string, cardSlug: string, shouldRevalidate: boolean): Promise<void> {
  pending.delete(cardKey(projectSlug, cardSlug));
  try {
    const res = await spawnPmReply(projectSlug, cardSlug);
    // PM's board_add_comment call already wrote the comment + bumped
    // `updated:`. Clear the pending flag here so the polling client stops,
    // whether pi succeeded or failed (failure: user can re-comment to retry).
    await setPendingFlag(projectSlug, cardSlug, false);
    if (!res.ok) {
      // Failure already logged in spawnPmReply's `close` handler.
    }
  } catch (e) {
    console.error("[pm-reply] fireReply crashed:", (e as Error).message);
    await setPendingFlag(projectSlug, cardSlug, false).catch(() => {});
  }
  // Revalidate only when called from scheduleReply's timer (not from sweep).
  // Sweep is called lazily from addComment and may happen during a page
  // render; calling revalidatePath there would trigger Next.js errors.
  if (shouldRevalidate) {
    try {
      revalidatePath(`/projects/${projectSlug}`);
    } catch (e) {
      console.warn(`[pm-reply] revalidation failed:`, (e as Error).message);
    }
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
    await fireReply(projectSlug, cardSlug, true);
    return;
  }

  const timer = setTimeout(() => {
    void fireReply(projectSlug, cardSlug, true);
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
          // Don't revalidate from sweep — it may be called during a render.
          // The user's next addComment or a manual page refresh will pick up
          // the PM's reply.
          void fireReply(projectSlug, cardSlug, false);
        }
      } catch {
        // Parse failure — skip.
      }
    }
  }
}
