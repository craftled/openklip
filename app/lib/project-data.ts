import { statSync } from "node:fs";
import { projectPaths } from "@engine/paths";
import { loadProject, resolveSlug } from "@engine/projectStore";

export async function loadEditorProject(slugParam?: string | null) {
  const slug = resolveSlug(slugParam);
  const project = await loadProject(slug);
  const mediaVersion = Math.round(statSync(projectPaths(slug).proxy).mtimeMs);
  return { ...project, mediaVersion };
}
