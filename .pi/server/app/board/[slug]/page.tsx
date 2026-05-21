import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { loadProject } from "@/lib/board";
import { compileMarkdownString, compileMdxString } from "@/lib/mdx";
import { BoardView } from "@/components/blocks/board/BoardView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loaded = await loadProject(slug);
  return { title: loaded ? loaded.project.name : "Board" };
}

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loaded = await loadProject(slug);
  if (!loaded) notFound();
  const details = loaded.project.body ? await compileMdxString(loaded.project.body) : null;
  const compiled = await Promise.all(
    loaded.cards.map(async (c) =>
      c.body ? [c.slug, await compileMarkdownString(c.body)] as const : null,
    ),
  );
  const cardBodies: Record<string, ReactNode> = {};
  for (const entry of compiled) {
    if (entry) cardBodies[entry[0]] = entry[1];
  }
  return (
    <BoardView
      project={loaded.project}
      cards={loaded.cards}
      details={details}
      cardBodies={cardBodies}
    />
  );
}
