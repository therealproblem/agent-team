import { notFound } from "next/navigation";
import { loadProject } from "@/lib/board";
import { compileMdxString } from "@/lib/mdx";
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
  return <BoardView project={loaded.project} cards={loaded.cards} details={details} />;
}
