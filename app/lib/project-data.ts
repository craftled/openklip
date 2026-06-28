import { statSync } from "node:fs";
import { homedir } from "node:os";
import { syncAssetsFromFolder } from "@engine/asset-scanner";
import { projectPaths } from "@engine/paths";
import { loadProject, resolveSlug } from "@engine/projectStore";

export function formatDisplayPath(absPath: string): string {
  const home = homedir();
  if (absPath === home) {
    return "~";
  }
  if (absPath.startsWith(`${home}/`)) {
    return `~${absPath.slice(home.length)}`;
  }
  return absPath;
}

export async function loadEditorProject(slugParam?: string | null) {
  const slug = resolveSlug(slugParam);
  // Keep the first paint aligned with the on-disk assets/ drop folder.
  await syncAssetsFromFolder(slug);
  const project = await loadProject(slug);
  const paths = projectPaths(slug);
  const mediaVersion = Math.round(statSync(paths.proxy).mtimeMs);
  return {
    ...project,
    dirPath: formatDisplayPath(paths.dir),
    mediaVersion,
  };
}
