// Transactional staging + atomic swap for force re-ingest (CRAFT-6181).
//
// The old force path wiped the live project directory FIRST, then ingested
// into it: a failure partway through (ffmpeg crash, disk full, a Whisper
// OOM) left NO project at all, destroying the only good copy before the
// replacement existed. This module instead builds the replacement in a
// throwaway staging directory under a temporary slug (never touching the
// live directory), validates the result, then swaps it into place with a
// backup-and-restore rename pair so a failure during the swap itself can
// never leave the live directory missing either.
//
// Quiesce rule: force re-ingest refuses (ActiveAgentTaskError) when an
// agent task is actively "running"/"pending" on the slug, checked once
// before staging starts (fail fast, no wasted work) and once more right
// before the swap (staging can take minutes; a task may have started
// meanwhile). This is deliberately about MUTATION safety, not about
// preserving concurrent human edits: force always intends to replace
// whatever is live, and ordinary project.json edits made through
// mutateProject during staging are safely serialized by the same lock the
// swap takes (see forceIngestWithSwap below) rather than refused.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, unlink } from "node:fs/promises";
import { listAgentTasks } from "./agent-tasks.ts";
import { ProjectSchema } from "./edl.ts";
import type { IngestProgress } from "./ingest-types.ts";
import { projectDir, projectPaths } from "./paths.ts";
import { acquireProjectFileLock } from "./project-file-lock.ts";
import { withProjectLock } from "./project-lock.ts";

/** Thrown when force re-ingest is refused because an agent task is actively
 * working on the slug. The message names the task and tells the caller what
 * to do, so it is safe to surface directly to a human or an agent. */
export class ActiveAgentTaskError extends Error {
  readonly slug: string;
  readonly taskId: string;

  constructor(slug: string, taskId: string, request: string) {
    super(
      `cannot force re-ingest "${slug}": agent task ${taskId} ("${request}") is still running on this project. Wait for it to finish or cancel it, then retry.`
    );
    this.name = "ActiveAgentTaskError";
    this.slug = slug;
    this.taskId = taskId;
  }
}

// Mirrors the TERMINAL_STATUSES set in src/agent-tasks.ts (not exported):
// "running" and "pending" are the only non-terminal states. "pending" is
// reserved for future queued tasks, but nothing queued should have a
// replacement pulled out from under it either.
function isActiveTaskStatus(status: string): boolean {
  return status === "running" || status === "pending";
}

/** Refuse to proceed if an agent task is actively working on `slug`. */
export async function assertNoActiveAgentTask(slug: string): Promise<void> {
  const tasks = await listAgentTasks(slug, { limit: 200 });
  const active = tasks.find((t) => isActiveTaskStatus(t.status));
  if (active) {
    throw new ActiveAgentTaskError(slug, active.id, active.request);
  }
}

// Staging/backup slugs must still satisfy paths.ts's SLUG_PATTERN (starts
// with alnum, <=64 chars, [A-Za-z0-9._-]) so projectDir()/projectPaths()
// work completely unmodified. Truncate the base so the suffix always fits.
function withSuffix(slug: string, suffix: string): string {
  const maxBase = Math.max(1, 64 - suffix.length);
  return `${slug.slice(0, maxBase)}${suffix}`;
}

function randomToken(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

/** A unique, valid staging slug for `slug`: the replacement is built under
 * `projectDir(stagingSlug)`, a sibling of the live project dir, and the live
 * directory is never touched until the swap. Exported for tests. */
export function stagingSlugFor(slug: string): string {
  return withSuffix(slug, `-stg-${randomToken()}`);
}

function backupSlugFor(slug: string): string {
  return withSuffix(slug, `-bak-${randomToken()}`);
}

/** Load + validate a staged project.json, patch its `slug` field back to
 * the live slug (it was ingested under the temporary staging slug), and
 * confirm the outputs the editor depends on (proxy, transcript) exist.
 * Throws, leaving the staging directory in place for the caller to clean
 * up, if anything is missing or invalid. */
async function validateAndRelabelStaged(
  stagingSlug: string,
  liveSlug: string
): Promise<void> {
  const p = projectPaths(stagingSlug);
  const raw = JSON.parse(await Bun.file(p.project).text()) as Record<
    string,
    unknown
  >;
  raw.slug = liveSlug;
  const project = ProjectSchema.parse(raw);
  await Bun.write(p.project, JSON.stringify(project, null, 2));
  if (!existsSync(p.proxy)) {
    throw new Error(`staged ingest is missing its proxy: ${p.proxy}`);
  }
  if (!existsSync(p.transcript)) {
    throw new Error(`staged ingest is missing its transcript: ${p.transcript}`);
  }
}

/** Rename `stagingDir` into place as `liveDir`, keeping any previous
 * `liveDir` as a backup until the swap is confirmed. If the second rename
 * fails, the backup is restored so the original survives; the backup is
 * only removed once both renames have succeeded. */
async function renameIntoPlace(
  liveDir: string,
  stagingDir: string,
  backupDir: string
): Promise<void> {
  const hadLive = existsSync(liveDir);
  if (hadLive) {
    await rename(liveDir, backupDir);
  }
  try {
    await rename(stagingDir, liveDir);
  } catch (err) {
    if (hadLive) {
      await rename(backupDir, liveDir).catch(() => undefined);
    }
    throw err;
  }
  if (hadLive) {
    await rm(backupDir, { recursive: true, force: true });
  }
}

export type RunIngestCore = (
  source: string,
  targetSlug: string,
  opts?: { onProgress?: (p: IngestProgress) => void }
) => Promise<void>;

/**
 * Force-ingest transactionally: run `runIngestCore` into a staging
 * directory under a throwaway slug, validate the result, then swap it into
 * place for `liveSlug` under the project lock (the same
 * withProjectLock + acquireProjectFileLock pair mutateProject uses, so a
 * concurrent project.json edit is strictly serialized against the swap,
 * never interleaved). On ANY failure (staging, validation, or the swap
 * itself) the live project is left byte-for-byte untouched and no
 * staging/backup directories remain.
 */
export async function forceIngestWithSwap(
  source: string,
  liveSlug: string,
  runIngestCore: RunIngestCore,
  opts?: { onProgress?: (p: IngestProgress) => void }
): Promise<string> {
  await assertNoActiveAgentTask(liveSlug);

  const stagingSlug = stagingSlugFor(liveSlug);
  const stagingDir = projectDir(stagingSlug);

  try {
    await runIngestCore(source, stagingSlug, opts);
    await validateAndRelabelStaged(stagingSlug, liveSlug);
  } catch (err) {
    await rm(stagingDir, { recursive: true, force: true });
    throw err;
  }

  const liveDir = projectDir(liveSlug);
  const backupDir = projectDir(backupSlugFor(liveSlug));

  await withProjectLock(liveSlug, async () => {
    // Ensure the live project dir exists so the advisory lockfile (which
    // lives inside it) can be created; mirrors mutateProject's
    // `mkdir(p.working, {recursive:true})` before acquireProjectFileLock.
    await mkdir(projectPaths(liveSlug).working, { recursive: true });
    const lockPath = `${projectPaths(liveSlug).project}.lock`;
    await acquireProjectFileLock(lockPath);
    try {
      // Final quiesce check: staging can take minutes, so re-check for an
      // agent task that started while the replacement was being built.
      await assertNoActiveAgentTask(liveSlug);
      await renameIntoPlace(liveDir, stagingDir, backupDir);
    } catch (err) {
      await rm(stagingDir, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
      throw err;
    } finally {
      try {
        await unlink(lockPath);
      } catch {
        // Best-effort: the rename already moved (or removed) the lock file,
        // or another process broke a stale lock first.
      }
    }
  });

  return liveSlug;
}
