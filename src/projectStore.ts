// Project-file access shared by the Next route handlers (and usable from the
// CLI). Pure Node fs (no Bun globals) so it runs under Next on Bun or Node.
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Project, ProjectSchema } from "./edl.ts";
import { PROJECTS_ROOT, projectPaths } from "./paths.ts";

export function latestProject(): string | null {
  if (!existsSync(PROJECTS_ROOT)) {
    return null;
  }
  const dirs = readdirSync(PROJECTS_ROOT)
    .map((n) => ({ n, p: join(PROJECTS_ROOT, n) }))
    .filter((d) => {
      try {
        return (
          statSync(d.p).isDirectory() && existsSync(join(d.p, "project.json"))
        );
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(b.p).mtimeMs - statSync(a.p).mtimeMs);
  return dirs[0]?.n ?? null;
}

// Which project a request targets: explicit ?slug=, else the slug the CLI
// pinned via OPENKLIP_SLUG when it launched the server, else the most recent.
export function resolveSlug(slugParam?: string | null): string {
  const slug = slugParam || process.env.OPENKLIP_SLUG || latestProject();
  if (!slug) {
    throw new Error("no projects found. Run: bun run ingest <video>");
  }
  if (!existsSync(projectPaths(slug).project)) {
    throw new Error(`project not found: ${slug}`);
  }
  return slug;
}

export async function loadProject(slug: string): Promise<Project> {
  return ProjectSchema.parse(
    JSON.parse(await readFile(projectPaths(slug).project, "utf8"))
  );
}

export async function saveProject(
  slug: string,
  project: Project
): Promise<void> {
  await writeFile(projectPaths(slug).project, JSON.stringify(project, null, 2));
}
