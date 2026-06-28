import { statSync } from "node:fs";
import { syncAssetsFromFolder } from "@engine/asset-scanner";
import { formatDisplayPath } from "@engine/display-path";
import { projectPaths } from "@engine/paths";
import { loadProject, resolveSlug } from "@engine/projectStore";

export async function loadEditorProject(slugParam?: string | null) {
  const slug = resolveSlug(slugParam);
  try {
    // Best-effort: keep first paint aligned with assets/ without blocking load.
    await syncAssetsFromFolder(slug);
  } catch {
    // A bad drop, proxy build failure, or I/O error must not break the editor.
  }
  const project = await loadProject(slug);
  const paths = projectPaths(slug);
  const mediaVersion = Math.round(statSync(paths.proxy).mtimeMs);
  return {
    ...project,
    dirPath: formatDisplayPath(paths.dir),
    mediaVersion,
  };
}
