// Project-file access shared by the Next route handlers (and usable from the
// CLI). Pure Node fs (no Bun globals) so it runs under Next on Bun or Node.
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Actor,
  actorFromEnv,
  appendActionLog,
  summarizeForLog,
} from "./action-log.ts";
import { type Project, ProjectSchema } from "./edl.ts";
import { projectPaths, projectsRoot } from "./paths.ts";
import { acquireProjectFileLock } from "./project-file-lock.ts";
import { withProjectLock } from "./project-lock.ts";
import {
  resolveProvenance,
  stampProvenanceFromMutation,
} from "./provenance.ts";

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
  agentSurface?: string;
  /** Override author identity (OPENKLIP_AUTHOR_ID). */
  authorId?: string;
  input?: unknown;
  model?: string;
  /** Spawned agent task this mutation ran under, when any (OPENKLIP_TASK_ID). */
  taskId?: string;
}

// One pre-mutation project.json snapshot per logged revision, named after the
// revision it captures (rev-<revisionBefore>.json). src/revert.ts reads these
// back to restore an earlier state; see the writer in mutateProject below.
const SNAPSHOT_NAME_PATTERN = /^rev-(\d+)\.json$/;

/** Revision number encoded in a history snapshot filename, or undefined for
 * anything else in the directory (stray files, tmp leftovers). */
export function snapshotRevisionFromFilename(name: string): number | undefined {
  const match = SNAPSHOT_NAME_PATTERN.exec(name);
  return match ? Number(match[1]) : undefined;
}

/** Revisions that currently have a snapshot on disk, ascending. Sync (like
 * listProjects/latestProject above) so route handlers and the revert engine
 * can call it without an extra await. */
export function listHistorySnapshotRevisions(slug: string): number[] {
  const dir = projectPaths(slug).historyDir;
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .map(snapshotRevisionFromFilename)
    .filter((r): r is number => r !== undefined)
    .sort((a, b) => a - b);
}

export const MAX_HISTORY_SNAPSHOTS = 100;

/** Drop all but the newest `keep` snapshots by revision number. Exported so
 * the cap can be exercised directly in tests without writing 100+ files. */
export async function pruneHistorySnapshots(
  slug: string,
  keep: number = MAX_HISTORY_SNAPSHOTS
): Promise<void> {
  const dir = projectPaths(slug).historyDir;
  if (!existsSync(dir)) {
    return;
  }
  const named = readdirSync(dir)
    .map((name) => ({ name, revision: snapshotRevisionFromFilename(name) }))
    .filter(
      (e): e is { name: string; revision: number } => e.revision !== undefined
    )
    .sort((a, b) => b.revision - a.revision);
  const stale = named.slice(keep);
  await Promise.all(
    stale.map((e) => unlink(join(dir, e.name)).catch(() => undefined))
  );
}

// Atomic tmp+rename write, matching src/chats.ts and src/audio-analysis.ts:
// a crash mid-write leaves the old snapshot (or none) instead of a truncated
// rev-<n>.json that revert would fail to parse.
async function writeHistorySnapshot(
  slug: string,
  revisionBefore: number,
  json: string
): Promise<void> {
  const dir = projectPaths(slug).historyDir;
  await mkdir(dir, { recursive: true });
  const target = join(dir, `rev-${revisionBefore}.json`);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, json);
  await rename(tmp, target);
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
    // Cross-process advisory file lock: serializes concurrent CLI + server
    // processes (withProjectLock above only serializes within one process).
    // Same pattern as the tasks.json lock in src/agent-tasks.ts.
    const p = projectPaths(slug);
    await mkdir(p.working, { recursive: true });
    const lockPath = `${p.project}.lock`;
    await acquireProjectFileLock(lockPath);
    try {
      const project = await loadProject(slug);
      const revisionBefore = project.revision ?? 0;
      // Snapshot the pre-mutation state as a string NOW, before fn mutates
      // `project` in place below: stringifying after fn ran would capture the
      // POST-mutation state instead (fn mutates the same object, not a copy).
      const preMutationJson = meta
        ? JSON.stringify(project, null, 2)
        : undefined;
      const result = await fn(project);
      if (meta) {
        project.revision = revisionBefore + 1;
        const provenance = resolveProvenance(meta);
        stampProvenanceFromMutation(
          project,
          meta,
          result,
          provenance,
          revisionBefore + 1
        );
      }
      await saveProject(slug, project);
      if (meta) {
        try {
          const provenance = resolveProvenance(meta);
          await appendActionLog(slug, {
            at: Date.now(),
            action: meta.action,
            actor: meta.actor ?? actorFromEnv() ?? "human",
            input: summarizeForLog(meta.input),
            result: summarizeForLog(result),
            revisionBefore,
            revisionAfter: revisionBefore + 1,
            taskId: meta.taskId,
            authorId: provenance.authorId,
            ...(provenance.agentSurface
              ? { agentSurface: provenance.agentSurface }
              : {}),
            ...(provenance.model ? { model: provenance.model } : {}),
          });
        } catch (err) {
          // History is best-effort: a log write failure must never fail an
          // edit that already saved.
          console.error(`action log append failed for ${slug}:`, err);
        }
        if (preMutationJson !== undefined) {
          try {
            await writeHistorySnapshot(slug, revisionBefore, preMutationJson);
            await pruneHistorySnapshots(slug);
          } catch (err) {
            // Same best-effort contract as the log append above: a snapshot
            // failure (disk full, permissions) must never fail an edit that
            // already saved.
            console.warn(
              `history snapshot write failed for ${slug} rev ${revisionBefore}:`,
              err
            );
          }
        }
      }
      return result;
    } finally {
      try {
        await unlink(lockPath);
      } catch {
        // Best-effort: a stale-break by another process already removed it.
      }
    }
  });
}

/** Load a pre-mutation project.json snapshot from working/history/. */
export async function loadHistorySnapshot(
  slug: string,
  revision: number
): Promise<Project> {
  const fp = join(projectPaths(slug).historyDir, `rev-${revision}.json`);
  if (!existsSync(fp)) {
    const available = listHistorySnapshotRevisions(slug);
    throw new Error(
      `${slug}: no snapshot for revision ${revision}` +
        (available.length > 0
          ? ` (available: ${available.join(", ")})`
          : " (no snapshots exist yet)")
    );
  }
  return ProjectSchema.parse(JSON.parse(await readFile(fp, "utf8")));
}
