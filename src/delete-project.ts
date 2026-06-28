import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { assertValidSlug, projectDir, projectPaths, projectsRoot } from "./paths.ts";
import { withProjectLock } from "./project-lock.ts";

/** Permanently remove a project directory from disk. */
export async function deleteProject(slug: string): Promise<void> {
  const safeSlug = assertValidSlug(slug);
  const dir = resolve(projectDir(safeSlug));
  const root = resolve(projectsRoot());
  if (dir !== root && !dir.startsWith(`${root}${sep}`)) {
    throw new Error(`invalid project path: ${JSON.stringify(slug)}`);
  }

  await withProjectLock(safeSlug, async () => {
    if (!existsSync(projectPaths(safeSlug).project)) {
      throw new Error(`project not found: ${safeSlug}`);
    }
    await rm(dir, { recursive: true, force: true });
  });
}
