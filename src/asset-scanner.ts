import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { removeAsset } from "./actions.ts";
import { isRecognizedAssetFile, registerAsset } from "./assets.ts";
import type { Asset, Project } from "./edl.ts";
import { projectPaths } from "./paths.ts";
import { loadProject, mutateProject } from "./projectStore.ts";

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

// Shared predicate between the read-only precheck (hasStaleAssets) and the
// actual prune (pruneStaleAssets) below, so the two can never disagree about
// what counts as stale.
function isAssetStale(slug: string, asset: Asset): boolean {
  const src = asset.src;
  return !(src && isAssetSrcInDropZone(slug, src) && existsSync(resolve(src)));
}

// Ids of registrations pruneStaleAssets would remove, in project.assets
// order. Used both by hasStaleAssets (boolean precheck) and by
// syncAssetsFromFolder to log which assets a prune removed.
function staleAssetIds(slug: string, project: Project): string[] {
  return project.assets
    .filter((asset) => isAssetStale(slug, asset))
    .map((asset) => asset.id);
}

/**
 * Read-only precheck: true when pruneStaleAssets would change anything.
 * Lets syncAssetsFromFolder skip the locked mutateProject round trip
 * entirely on the common case (nothing to prune) instead of rewriting an
 * unchanged project.json on every poll.
 */
export function hasStaleAssets(slug: string, project: Project): boolean {
  return staleAssetIds(slug, project).length > 0;
}

/**
 * Drop asset registrations that no longer match the on-disk drop folder.
 * Keeps only entries whose `src` is a file under `projects/<slug>/assets/`.
 * Also prunes b-roll/still overlays that referenced removed assets.
 */
export function pruneStaleAssets(slug: string, project: Project): boolean {
  let changed = false;
  for (const asset of [...project.assets]) {
    if (isAssetStale(slug, asset)) {
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
export async function syncAssetsFromFolder(slug: string): Promise<Asset[]> {
  const p = projectPaths(slug);
  await mkdir(p.assets, { recursive: true });

  // Cheap read-only precheck (no lock) before paying for the locked
  // mutateProject round trip below: most polls have nothing stale, and
  // mutateProject always rewrites project.json even when fn is a no-op, so
  // skipping the call entirely (rather than calling it and letting fn find
  // nothing to do) is what actually avoids the pointless disk write. A
  // mutation landing between this read and the lock below just means a
  // newly-stale asset waits for the next poll to be pruned - the same
  // eventually-consistent contract this background sync already has.
  const preview = await loadProject(slug);
  const staleIds = staleAssetIds(slug, preview);
  if (staleIds.length > 0) {
    // Prune is its own locked mutation. It IS logged (actor "system"): a
    // registration can vanish here with no human or agent action behind it
    // (e.g. reverting an asset-rm whose files deleteAsset already unlinked
    // makes the restored registration stale on the very next poll), and an
    // unlogged disappearance reads as data loss to a user who just saw
    // "revert succeeded". It must run to completion (lock released) BEFORE
    // registerAsset below, which acquires the SAME per-slug lock itself via
    // its own mutateProject call - holding one lock across both steps here
    // would deadlock (see project-lock.ts).
    await mutateProject(
      slug,
      (project) => {
        pruneStaleAssets(slug, project);
      },
      { action: "asset-prune", actor: "system", input: { removed: staleIds } }
    );
  }

  const known = await loadProject(slug);
  const knownSrc = new Set(known.assets.map((a) => a.src));
  for (const filePath of listAssetDropFiles(slug)) {
    if (!knownSrc.has(filePath)) {
      await registerAsset(slug, filePath);
    }
  }

  const refreshed = await loadProject(slug);
  return refreshed.assets;
}
