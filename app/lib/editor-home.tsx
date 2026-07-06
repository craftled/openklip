import { listProjects } from "@engine/projectStore";
import { App } from "@/app";
import { loadEditorChats } from "./editor-chats";
import { loadEditorProject } from "./project-data";

export async function EditorHome({ slug }: { slug?: string | null }) {
  const projects = listProjects();
  if (projects.length === 0) {
    const { EmptyWorkspace } = await import("@/components/empty-workspace");
    return <EmptyWorkspace />;
  }

  const project = await loadEditorProject(slug ?? null);
  const initialChats = await loadEditorChats(project.slug);
  return (
    <App
      initialChats={initialChats}
      initialProject={project}
      key={project.slug}
      projects={projects}
      visionFocusAvailable={process.platform === "darwin"}
    />
  );
}
