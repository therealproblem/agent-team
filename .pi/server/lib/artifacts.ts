import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { V_DIR } from "@/lib/mdx";

export const EXPORT_ROOT = process.env.AGENTS_TEAM_EXPORT_PATH
  ? path.resolve(process.env.AGENTS_TEAM_EXPORT_PATH)
  : path.resolve(process.cwd(), "..", "..", "exports");

export interface ArtifactListItem {
  slug: string;
  title: string;
  href: string;
  updatedAt: Date | null;
}

function titleFromSlug(slug: string): string {
  return slug
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/-\d{9,}$/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || slug;
}

function compareByUpdatedThenTitle(a: ArtifactListItem, b: ArtifactListItem): number {
  const aTime = a.updatedAt?.getTime() ?? 0;
  const bTime = b.updatedAt?.getTime() ?? 0;
  if (aTime !== bTime) return bTime - aTime;
  return a.title.localeCompare(b.title);
}

export async function listRenderArtifacts(): Promise<ArtifactListItem[]> {
  try {
    const entries = await fs.readdir(V_DIR, { withFileTypes: true });
    const items = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^[A-Za-z0-9][A-Za-z0-9._-]*\.mdx$/.test(entry.name))
        .map(async (entry) => {
          const slug = entry.name.replace(/\.mdx$/, "");
          const filePath = path.join(V_DIR, entry.name);
          let title = titleFromSlug(slug);
          let updatedAt: Date | null = null;

          try {
            const [raw, stat] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
            const parsed = matter(raw);
            if (typeof parsed.data.title === "string" && parsed.data.title.trim()) {
              title = parsed.data.title.trim();
            }
            updatedAt = stat.mtime;
          } catch {
            // Ignore unreadable metadata and keep the slug-derived fallback.
          }

          return {
            slug,
            title,
            href: `/v/${encodeURIComponent(slug)}`,
            updatedAt,
          } satisfies ArtifactListItem;
        }),
    );

    return items.sort(compareByUpdatedThenTitle);
  } catch {
    return [];
  }
}

export async function listPdfArtifacts(): Promise<ArtifactListItem[]> {
  try {
    const entries = await fs.readdir(EXPORT_ROOT, { withFileTypes: true });
    const items = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/i.test(entry.name))
        .map(async (entry) => {
          const slug = entry.name;
          const baseSlug = slug.replace(/\.pdf$/i, "");
          const filePath = path.join(EXPORT_ROOT, entry.name);
          let updatedAt: Date | null = null;

          try {
            updatedAt = (await fs.stat(filePath)).mtime;
          } catch {
            // Leave updatedAt empty if the file disappears between readdir/stat.
          }

          return {
            slug,
            title: titleFromSlug(baseSlug),
            href: `/p/${encodeURIComponent(slug)}`,
            updatedAt,
          } satisfies ArtifactListItem;
        }),
    );

    return items.sort(compareByUpdatedThenTitle);
  } catch {
    return [];
  }
}
