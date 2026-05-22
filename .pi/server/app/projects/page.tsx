import { listProjects } from "@/lib/board";
import { ProjectIndex } from "@/components/blocks/board/ProjectIndex";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Projects",
};

export default async function BoardIndexPage() {
  const projects = await listProjects();
  return <ProjectIndex projects={projects} />;
}
