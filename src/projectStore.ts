// Project-file access shared by the Next route handlers (and usable from the
// CLI). Pure Node fs (no Bun globals) so it runs under Next on Bun or Node.
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Actor,
  actorFromEnv,
  appendActionLog,
  summarizeForLog,
} from "./action-log.ts";
import { type Project, ProjectSchema } from "./edl.ts";
import { projectPaths, projectsRoot } from "./paths.ts";
import { withProjectLock } from "./project-lock.ts";

export interface ProjectListing {
  mtimeMs: number;
  slug: string;
}

export function listProjects(): ProjectListing[] {
  const root = projectsRoot();
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .map((n) => ({ n, p: join(root, n) }))
    .filter((d) => {
      try {
        return (
          statSync(d.p).isDirectory() && existsSync(join(d.p, "project.json"))
        );
      } catch {
        return false;
      }
    })
    .map((d) => ({ slug: d.n, mtimeMs: statSync(d.p).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function latestProject(): string | null {
  return listProjects()[0]?.slug ?? null;
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
  const fp = projectPaths(slug).project;
  if (!existsSync(fp)) {
    throw new Error(`project not found: ${slug}`);
  }
  return ProjectSchema.parse(JSON.parse(await readFile(fp, "utf8")));
}

export async function saveProject(
  slug: string,
  project: Project
): Promise<void> {
  await writeFile(projectPaths(slug).project, JSON.stringify(project, null, 2));
}

// Describes a mutation for the per-project action history. Passing meta opts
// the call INTO logging: the project revision is bumped and one entry is
// appended to working/actions.jsonl. Callers that omit meta (background paths
// like asset folder sync) behave exactly as before: no bump, no log line.
export interface MutateMeta {
  /** Action name: a registry action or a stable pseudo-name ("edit-words"). */
  action: string;
  /** Defaults to OPENKLIP_ACTOR when set, else "human". */
  actor?: Actor;
  input?: unknown;
}

// Load → mutate → save inside the per-slug project lock, so concurrent server
// requests (multiple tabs / agent sessions) can't race the read-modify-write
// and lose an edit. `fn` mutates the loaded project in place; its return value
// is passed back to the caller. Use this for every server-side project.json
// mutation instead of open-coding load+save. A throwing `fn` aborts before the
// save, so project.json is untouched and nothing is logged.
export function mutateProject<T>(
  slug: string,
  fn: (project: Project) => T | Promise<T>,
  meta?: MutateMeta
): Promise<T> {
  return withProjectLock(slug, async () => {
    const project = await loadProject(slug);
    const revisionBefore = project.revision ?? 0;
    const result = await fn(project);
    if (meta) {
      project.revision = revisionBefore + 1;
    }
    await saveProject(slug, project);
    if (meta) {
      try {
        await appendActionLog(slug, {
          at: Date.now(),
          action: meta.action,
          actor: meta.actor ?? actorFromEnv() ?? "human",
          input: summarizeForLog(meta.input),
          result: summarizeForLog(result),
          revisionBefore,
          revisionAfter: revisionBefore + 1,
        });
      } catch (err) {
        // History is best-effort: a log write failure must never fail an edit
        // that already saved.
        console.error(`action log append failed for ${slug}:`, err);
      }
    }
    return result;
  });
}
