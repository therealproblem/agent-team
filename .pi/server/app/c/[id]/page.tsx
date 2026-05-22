import { notFound, redirect } from "next/navigation";
import { findCardById } from "@/lib/board";

export const dynamic = "force-dynamic";

/**
 * Short-link resolver: `/c/<uuid>` → `/projects/<projectSlug>?card=<cardSlug>`.
 *
 * The card's `id` is the only globally-unique handle (slugs collide across
 * projects). We scan every project's `board/` for a frontmatter `id` match
 * and redirect to that project's board with the card dialog deep-linked open.
 *
 * 404 for ids that don't match any card. Archived cards aren't reachable
 * because the loader skips `_archive/`.
 */
export default async function CardResolverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const match = await findCardById(id);
  if (!match) notFound();
  redirect(`/projects/${match.projectSlug}?card=${match.cardSlug}`);
}
