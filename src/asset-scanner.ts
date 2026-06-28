import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { removeAsset } from "./actions.ts";
import { isRecognizedAssetFile, registerAsset } from "./assets.ts";
import type { Asset, Project } from "./edl.ts";
import { projectPaths } from "./paths.ts";
import { withProjectLock } from "./project-lock.ts";
import { loadProject, saveProject } from "./projectStore.ts";

const SKIP_NAMES = new Set([".DS_Store", ".gitkeep", "README.md"]);

/** Files directly in the user assets/ folder (flat drop zone). */
export function listAssetDropFiles(slug: string): string[] {
  const assetsDir = projectPaths(slug).assets;
  if (!existsSync(assetsDir)) {
    return [];
  }
  return readdirSync(assetsDir)
    .filter((name) => {
      if (name.startsWith(".") || SKIP_NAMES.has(name)) {
        return false;
      }
      if (!isRecognizedAssetFile(name)) {
        return false;
      }
      try {
        return statSync(join(assetsDir, name)).isFile();
      } catch {
        return false;
      }
    })
    .map((name) => join(assetsDir, name));
}

function isAssetSrcInDropZone(slug: string, src: string): boolean {
  const dropRoot = resolve(projectPaths(slug).assets);
  const resolved = resolve(isAbsolute(src) ? src : join(dropRoot, src));
  return resolved === dropRoot || resolved.startsWith(`${dropRoot}${sep}`);
}

/**
 * Drop asset registrations that no longer match the on-disk drop folder.
 * Keeps only entries whose `src` is a file under `projects/<slug>/assets/`.
 * Also prunes b-roll/still overlays that referenced removed assets.
 */
export function pruneStaleAssets(slug: string, project: Project): boolean {
  let changed = false;
  for (const asset of [...project.assets]) {
    const src = asset.src;
    if (
      !src ||
      !isAssetSrcInDropZone(slug, src) ||
      !existsSync(resolve(src))
    ) {
      removeAsset(project, asset.id);
      changed = true;
    }
  }
  return changed;
}

/**
 * Reconcile project.json with the assets/ drop folder:
 * 1. prune stale registrations (external paths, deleted files)
 * 2. register any new files dropped into assets/
 */
export function syncAssetsFromFolder(slug: string): Promise<Asset[]> {
  return withProjectLock(slug, async () => {
    const p = projectPaths(slug);
    await mkdir(p.assets, { recursive: true });
    const project = await loadProject(slug);

    if (pruneStaleAssets(slug, project)) {
      await saveProject(slug, project);
    }

    const knownSrc = new Set(project.assets.map((a) => a.src));
    for (const filePath of listAssetDropFiles(slug)) {
      if (!knownSrc.has(filePath)) {
        await registerAsset(slug, filePath);
      }
    }

    const refreshed = await loadProject(slug);
    return refreshed.assets;
  });
}
