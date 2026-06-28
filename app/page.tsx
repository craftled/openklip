import { listProjects } from "@engine/projectStore";
import { App } from "@/app";
import { NoProjectsLanding } from "@/components/no-projects";
import { loadEditorProject } from "./lib/project-data";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ slug?: string }>;
}

export default async function Page({ searchParams }: Props) {
  const projects = listProjects();
  if (projects.length === 0) {
    return <NoProjectsLanding />;
  }

  const { slug } = await searchParams;
  const project = await loadEditorProject(slug ?? null);
  return (
    <App initialProject={project} key={project.slug} projects={projects} />
  );
}
