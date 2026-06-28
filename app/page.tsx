import { listProjects } from "@engine/projectStore";
import { App } from "@/app";
import { EmptyWorkspace } from "@/components/empty-workspace";
import { loadEditorChats } from "./lib/editor-chats";
import { loadEditorProject } from "./lib/project-data";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ slug?: string }>;
}

export default async function Page({ searchParams }: Props) {
  const projects = listProjects();
  if (projects.length === 0) {
    return <EmptyWorkspace />;
  }

  const { slug } = await searchParams;
  const project = await loadEditorProject(slug ?? null);
  const initialChats = await loadEditorChats(project.slug);
  return (
    <App
      initialChats={initialChats}
      initialProject={project}
      key={project.slug}
      projects={projects}
    />
  );
}
