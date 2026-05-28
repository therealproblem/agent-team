/*
 * /p/<slug>.pdf — PDF route handler.
 *
 * Why this exists rather than serving via public/p:
 *
 *   Next.js's production server (`next start`) only serves files that were
 *   in the public/ directory at build time. The export tool writes PDFs to
 *   the vault's artifacts/exports/ directory at runtime, long after
 *   `pnpm build` has run. The `public/p` symlink resolves on disk, but
 *   Next caches the public-files manifest at build time and serves a
 *   prerendered 404 for anything that wasn't there yet. Symptom: every
 *   freshly-exported PDF returns 404.
 *
 * This route reads the file from disk on each request, bypassing the
 * static-file manifest entirely. URLs include a unique Unix-epoch suffix
 * per export and the prior file is auto-pruned by write_export_pdf, so the
 * content at any given URL is genuinely immutable — cache aggressively at
 * the edge (Cloudflare et al.).
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveVaultRoot } from "../../../../lib/vault-path";
import { NextResponse } from "next/server";

// Mirror the env-var convention from .pi/extensions/obsidian-vault/index.ts.
// process.cwd() for `next start` is .pi/server/, so the default walks up
// two levels to the repo root, into the vault, then into artifacts/exports/.
// AGENTS_TEAM_EXPORT_PATH still wins outright; otherwise exports track the
// configured vault location via AGENTS_TEAM_VAULT_PATH (or <repo>/vault).
const VAULT_ROOT = resolveVaultRoot({ cwd: resolve(process.cwd(), "..", "..") });

const EXPORT_ROOT = process.env.AGENTS_TEAM_EXPORT_PATH
  ? resolve(process.env.AGENTS_TEAM_EXPORT_PATH)
  : join(VAULT_ROOT, "artifacts", "exports");

// Never let Next prerender 404s for unknown slugs — every request must
// re-check the export root, since the file set changes at runtime.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Slug whitelist — printable ASCII, dot, hyphen, underscore. Defends
  // against path traversal and against accidentally exposing other files
  // in the export root that aren't PDFs. The actual generated slugs match
  // <YYYY-MM-DD>-<title-slug>-<epoch>.pdf which is well inside this set.
  if (!/^[A-Za-z0-9._-]+\.pdf$/.test(slug)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const filePath = join(EXPORT_ROOT, slug);

  try {
    const file = await readFile(filePath);
    return new NextResponse(file as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${slug}"`,
        // Each URL embeds the export epoch and the file at that URL is
        // never overwritten (auto-prune deletes the *prior* epoch's file,
        // not the current one). The content is genuinely immutable, so
        // edge caches can keep it for a year.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
