/*
 * POST /api/fix-mermaid — repair a broken Mermaid block on a rendered page.
 *
 * The Mermaid renderer in /v/<slug> calls this when mermaid.render() throws.
 * We locate the Nth fenced ```mermaid``` block in the .mdx file (where N is
 * the chartNumber the user sees in the UI), shell out to pi for a one-shot
 * repair session (no model auth needed — pi handles it), and dual-write the
 * fix back to the .mdx and opportunistically to the source .md.
 *
 * Why shell out to pi instead of calling the Anthropic API directly: this
 * server is a child of the pi process, and pi already has the user's auth
 * set up. Routing through `pi --mode json -p --no-session` reuses that auth
 * so the user doesn't need to configure ANTHROPIC_API_KEY just to get the
 * fix button working.
 *
 * Note on the .md dual-write being opportunistic: the render-html subagent
 * may have *added* the diagram during authoring — in which case the vault
 * source doesn't contain it. We only touch the .md when we find an exact
 * match, so we never corrupt unrelated content.
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { resolveVaultRoot } from "../../../../lib/vault-path";
import { NextResponse } from "next/server";
import matter from "gray-matter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const V_DIR = resolve(process.cwd(), "content", "v");
const VAULT_ROOT = resolveVaultRoot({ cwd: resolve(process.cwd(), "..", "..") });

const PI_TIMEOUT_MS = 60_000;

const REPAIR_PROMPT_PREAMBLE = `Repair the broken Mermaid diagram below. The diagram failed to render with a syntax error.

OUTPUT RULES — these are non-negotiable:
- Output ONLY the fixed Mermaid source. No code fences. No commentary. No "Here is the fix:" prologue. No trailing notes.
- Preserve the diagram type and intent. Do not redesign — make the smallest change that makes it parse.
- Use only documented Mermaid syntax. Link forms: \`-->\`, \`---\`, \`--x\`, \`--o\`, \`-.->\`, \`==>\`, \`~~~\`. Labels via \`A -->|label| B\` or \`A -. label .-> B\`. Node shapes: \`[ ]\`, \`( )\`, \`(( ))\`, \`{ }\`, \`[/ /]\`, \`>\`.
- Do NOT invent combinations like \`-.x.-\`, \`=.->\`, \`~~>\`.
- Do NOT emit \`style NodeId fill:...\` lines, \`%%{init: {...}}%%\` blocks, or per-diagram color literals — the renderer strips them.
- If text labels contain parentheses, quotes, or special characters, wrap the label in double quotes.
- Common fixes: missing diagram header (\`flowchart LR\`, \`sequenceDiagram\`, etc.); unbalanced brackets; invalid node IDs (must start with a letter); label characters that need quoting.

BROKEN SOURCE:`;

interface FixRequestBody {
  slug?: unknown;
  chartNumber?: unknown;
  original?: unknown;
}

interface MermaidBlock {
  fenceStart: number;
  fenceEnd: number;
  body: string;
}

function findMermaidBlocks(text: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  const re = /^```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    blocks.push({
      fenceStart: match.index,
      fenceEnd: match.index + match[0].length,
      body: match[1],
    });
  }
  return blocks;
}

function buildReplacement(newBody: string): string {
  const trimmed = newBody.replace(/[ \t]+$/gm, "").replace(/\s+$/, "");
  return "```mermaid\n" + trimmed + "\n```";
}

function extractFixedSource(modelOutput: string): string {
  let out = modelOutput.trim();
  // Strip an outer ```mermaid ... ``` or ``` ... ``` fence if the model added
  // one despite being told not to. Defensive — keeps the splice robust
  // against minor instruction drift.
  const fenced = out.match(/^```(?:mermaid)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
  if (fenced) out = fenced[1];
  return out.replace(/\s+$/, "");
}

/**
 * Spawn pi in headless JSON-event-stream mode and return the final assistant
 * text. Pi handles auth on its own (it's already configured for the user
 * running pi), so the server process doesn't need ANTHROPIC_API_KEY or any
 * other credential.
 *
 * Flags:
 *   --mode json            line-delimited JSON event stream on stdout
 *   -p                     non-interactive "print" mode
 *   --no-session           ephemeral; don't persist a session record
 *   --no-context-files     skip AGENTS.md/CLAUDE.md; we want a clean turn
 */
async function callPi(prompt: string, signal: AbortSignal): Promise<string> {
  return await new Promise<string>((resolveText, rejectText) => {
    const proc = spawn(
      "pi",
      ["--mode", "json", "-p", "--no-session", "--no-context-files", prompt],
      { stdio: ["ignore", "pipe", "pipe"], shell: false },
    );

    let buffer = "";
    let finalText = "";
    let stderr = "";

    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      const e = event as {
        type?: string;
        message?: {
          role?: string;
          content?: Array<{ type?: string; text?: string }>;
        };
      };
      if (e.type === "message_end" && e.message?.role === "assistant") {
        const text = e.message.content?.find((c) => c.type === "text")?.text;
        if (text) finalText = text;
      }
    };

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (err) => {
      rejectText(new Error(`failed to spawn pi: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (buffer.trim()) processLine(buffer);
      if (code !== 0 && !finalText) {
        rejectText(
          new Error(
            `pi exited with code ${code}${stderr ? `: ${stderr.slice(0, 400)}` : ""}`,
          ),
        );
        return;
      }
      if (!finalText) {
        rejectText(new Error("pi produced no assistant text"));
        return;
      }
      resolveText(finalText);
    });

    const onAbort = () => {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 2000);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function POST(request: Request) {
  let body: FixRequestBody;
  try {
    body = (await request.json()) as FixRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug : null;
  const chartNumber =
    typeof body.chartNumber === "number" && Number.isInteger(body.chartNumber)
      ? body.chartNumber
      : null;
  const original = typeof body.original === "string" ? body.original : null;
  if (!slug || !chartNumber || chartNumber < 1) {
    return NextResponse.json(
      { error: "slug (string) and chartNumber (positive integer) are required" },
      { status: 400 },
    );
  }
  if (slug.includes("/") || slug.includes("..") || slug.includes("\\")) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const mdxPath = join(V_DIR, `${slug}.mdx`);
  let mdxRaw: string;
  try {
    mdxRaw = await fs.readFile(mdxPath, "utf8");
  } catch {
    return NextResponse.json(
      { error: `no rendered page found for slug ${slug}` },
      { status: 404 },
    );
  }

  const parsed = matter(mdxRaw);
  const sourceMdPath =
    typeof parsed.data?.source_md_path === "string"
      ? parsed.data.source_md_path
      : null;
  const bodyStart = mdxRaw.length - parsed.content.length;
  const blocks = findMermaidBlocks(parsed.content);
  if (blocks.length === 0) {
    return NextResponse.json(
      { error: "no Mermaid blocks found in this page" },
      { status: 404 },
    );
  }
  if (chartNumber > blocks.length) {
    return NextResponse.json(
      {
        error: `chartNumber ${chartNumber} out of range (page has ${blocks.length} chart${blocks.length === 1 ? "" : "s"})`,
      },
      { status: 404 },
    );
  }
  const target = blocks[chartNumber - 1];

  if (original && target.body.trim() !== original.trim()) {
    return NextResponse.json(
      {
        error:
          "chart source on disk no longer matches the client view — refresh the page and try again",
      },
      { status: 409 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PI_TIMEOUT_MS);
  let fixedSource: string;
  try {
    const prompt = `${REPAIR_PROMPT_PREAMBLE}\n\n${target.body}`;
    const modelOutput = await callPi(prompt, controller.signal);
    fixedSource = extractFixedSource(modelOutput);
  } catch (e) {
    return NextResponse.json(
      { error: `repair failed: ${(e as Error).message}` },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!fixedSource || fixedSource === target.body) {
    return NextResponse.json(
      { error: "model returned an empty or unchanged repair" },
      { status: 502 },
    );
  }

  const replacement = buildReplacement(fixedSource);
  const newContent =
    parsed.content.slice(0, target.fenceStart) +
    replacement +
    parsed.content.slice(target.fenceEnd);
  const newMdx = mdxRaw.slice(0, bodyStart) + newContent;
  await fs.writeFile(mdxPath, newMdx, "utf8");

  let mdUpdated = false;
  if (sourceMdPath) {
    try {
      const mdAbsolute = sourceMdPath.startsWith("/")
        ? sourceMdPath
        : join(VAULT_ROOT, sourceMdPath);
      const mdRaw = await fs.readFile(mdAbsolute, "utf8");
      const mdBlocks = findMermaidBlocks(mdRaw);
      const matchIdx = mdBlocks.findIndex(
        (b) => b.body.trim() === target.body.trim(),
      );
      if (matchIdx !== -1) {
        const mdTarget = mdBlocks[matchIdx];
        const newMdContent =
          mdRaw.slice(0, mdTarget.fenceStart) +
          replacement +
          mdRaw.slice(mdTarget.fenceEnd);
        await fs.writeFile(mdAbsolute, newMdContent, "utf8");
        mdUpdated = true;
      }
    } catch {
      // .md unreadable / path stale / vault relocated — silently skip; the
      // .mdx fix is still useful on its own.
    }
  }

  return NextResponse.json({
    ok: true,
    chartNumber,
    fixed: fixedSource,
    mdUpdated,
    mdPath: sourceMdPath,
  });
}
