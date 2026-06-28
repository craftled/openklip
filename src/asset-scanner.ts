import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { withAssetLock } from "./asset-lock.ts";
import { isRecognizedAssetFile, registerAsset } from "./assets.ts";
import type { Asset } from "./edl.ts";
import { projectPaths } from "./paths.ts";
import { loadProject } from "./projectStore.ts";

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

/** Register any files in assets/ that are not yet in project.json. */
export function syncAssetsFromFolder(slug: string): Promise<Asset[]> {
  return withAssetLock(slug, async () => {
    const p = projectPaths(slug);
    await mkdir(p.assets, { recursive: true });
    const project = await loadProject(slug);
    const knownSrc = new Set(project.assets.map((a) => a.src));
    const dropFiles = listAssetDropFiles(slug);

    for (const filePath of dropFiles) {
      if (!knownSrc.has(filePath)) {
        await registerAsset(slug, filePath);
      }
    }

    const refreshed = await loadProject(slug);
    return refreshed.assets;
  });
}
