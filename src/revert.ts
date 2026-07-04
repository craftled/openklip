// Revert engine: restores a project to an earlier logged revision using the
// pre-mutation snapshots mutateProject writes to working/history/ (see
// src/projectStore.ts). Revert is deliberately NOT a registry action:
// registry actions (src/registry.ts) are pure in-memory Project -> Project
// transforms with no filesystem access of their own, run inside a fn passed
// to mutateProject. A revert needs to read a snapshot file from disk BEFORE
// it can mutate anything, which doesn't fit that contract, so it's its own
// module that calls mutateProject directly (see src/agent-tools.ts, where it
// is registered as a manual tool alongside brief_set for the same reason).
import type { Actor } from "./action-log.ts";
import { readActionLog } from "./action-log.ts";
import type { ActionLogEntry } from "./action-log-entry.ts";
import type { Project } from "./edl.ts";
import {
  loadHistorySnapshot,
  loadProject,
  mutateProject,
} from "./projectStore.ts";

export type RevertTarget =
  | { to: number }
  | { task: string; force?: boolean }
  | { last: true };

export interface RevertOutcome {
  /** The revision whose snapshot was restored. */
  restoredTo: number;
  /** The project's revision after the revert (always current + 1). */
  revision: number;
}

// brief-set entries share revisionBefore/revisionAfter (src/brief-log.ts):
// they never moved the EDL, so "last" and the task interloper guard both
// skip them.
function bumpsRevision(entry: ActionLogEntry): boolean {
  return entry.revisionAfter > entry.revisionBefore;
}

/** Resolve a revert target to the revision it should restore. Reads the
 * action log only; revertProject re-checks the current revision and
 * snapshot existence itself, so this can be used to preview a target with no
 * side effects. */
export async function resolveRevertTarget(
  slug: string,
  target: RevertTarget
): Promise<{ revision: number }> {
  if ("to" in target) {
    return { revision: target.to };
  }

  // Newest first, full history (no limit).
  const entries = await readActionLog(slug);

  if ("last" in target) {
    const entry = entries.find(bumpsRevision);
    if (!entry) {
      throw new Error(`${slug}: no logged edit to revert (history is empty)`);
    }
    return { revision: entry.revisionBefore };
  }

  const { task, force } = target;
  const taskEntries = entries.filter((e) => e.taskId === task);
  if (taskEntries.length === 0) {
    throw new Error(`${slug}: no logged actions found for task "${task}"`);
  }
  const earliestTaskEntry = taskEntries.at(-1) as ActionLogEntry;
  const earliestTaskIndex = entries.indexOf(earliestTaskEntry);
  // Reverting restores the whole project state at the task's EARLIEST
  // revision, discarding every revision-bumping entry newer than that,
  // whether it belongs to this task or not. So anything newer than the
  // earliest task entry that bumped the revision under a DIFFERENT task (or
  // no task at all) would be silently discarded too, including one
  // INTERLEAVED BETWEEN two of the task's own entries, not just one after
  // all of them. Refuse unless the caller explicitly accepts the loss with
  // force.
  const interloper = entries
    .slice(0, earliestTaskIndex)
    .find((e) => bumpsRevision(e) && e.taskId !== task);
  if (interloper && !force) {
    const from = interloper.taskId
      ? `task "${interloper.taskId}"`
      : `actor "${interloper.actor}"`;
    throw new Error(
      `reverting task "${task}" would also discard "${interloper.action}" ` +
        `(rev ${interloper.revisionBefore} -> ${interloper.revisionAfter}) from ${from}; ` +
        "pass force to revert anyway"
    );
  }
  return { revision: earliestTaskEntry.revisionBefore };
}

function readHistorySnapshot(
  slug: string,
  revision: number
): Promise<Project> {
  return loadHistorySnapshot(slug, revision);
}

// Resolving {last} / {task} reads the log and answers purely from it
// (resolveRevertTarget above). That answer is only trustworthy if the log's
// own idea of "current revision" (the newest revision-bumping entry's
// revisionAfter) actually matches project.json's revision counter. A torn
// log tail (crash mid-append: mutateProject saves project.json BEFORE the
// log append, so the file can be ahead of what the log shows) breaks that
// assumption silently, and resolveRevertTarget would answer from stale
// history instead of throwing. An explicit {to} target names its revision
// directly and needs no such trust, so it is exempt (still validated by
// readHistorySnapshot: the snapshot must exist).
async function assertLogConsistentWithRevision(
  slug: string,
  currentRevision: number
): Promise<void> {
  const entries = await readActionLog(slug);
  const newest = entries.find(bumpsRevision);
  const logTail = newest ? newest.revisionAfter : 0;
  if (logTail !== currentRevision) {
    throw new Error(
      `${slug}: action history is inconsistent with project revision ` +
        `(project at ${currentRevision}, log tail at ${logTail}); ` +
        "use --to <revision> explicitly"
    );
  }
}

/** Restore `slug` to an earlier logged revision. Reads the target snapshot
 * BEFORE entering mutateProject: it's a plain fs read that needs no lock of
 * its own, and keeps the mutateProject fn a simple synchronous in-place
 * replace. A mutation landing in the window between that read and
 * mutateProject's lock (a queued server action, another tab, the folder
 * sync) would otherwise be wholesale-overwritten with no warning: the guard
 * inside the mutateProject fn below re-checks the revision captured here
 * against the live project, INSIDE the lock, and refuses rather than
 * silently discarding it. */
export async function revertProject(
  slug: string,
  target: RevertTarget,
  opts: {
    actor: Actor;
    taskId?: string;
    /** Test-only seam: called right before revertProject enters
     * mutateProject's lock, so tests can deterministically land a mutation
     * in the resolve -> lock window the guard above protects against.
     * Production callers never pass this. */
    onBeforeApply?: () => void | Promise<void>;
  }
): Promise<RevertOutcome> {
  const { revision } = await resolveRevertTarget(slug, target);
  const current = await loadProject(slug);
  const currentRevision = current.revision ?? 0;

  if (!("to" in target)) {
    await assertLogConsistentWithRevision(slug, currentRevision);
  }

  if (revision === currentRevision) {
    throw new Error(
      `${slug}: nothing to revert, already at revision ${revision}`
    );
  }
  const snapshot = await readHistorySnapshot(slug, revision);

  // R4 hazard (src/assembly.ts:258-265): an assemble replaces
  // project.source (and the working proxy/audio/transcript on disk) with a
  // brand-new recording. A snapshot from before that boundary still has the
  // OLD source; restoring its project.json would leave project.source
  // pointing at a recording whose proxy/audio/transcript no longer exist on
  // disk in their expected form, silently corrupting export/preview. Refuse
  // rather than regenerate: media correctness over convenience for v1, no
  // force override.
  if (snapshot.source !== current.source) {
    throw new Error(
      `${slug}: cannot revert to revision ${revision}: it belongs to a ` +
        `different source recording ("${snapshot.source}") than the ` +
        `project's current one ("${current.source}"). The working media ` +
        "(proxy, extracted audio, transcript) on disk matches the CURRENT " +
        "assembly and would no longer match the restored project. " +
        "Re-run assemble, or target a revision recorded after the assembly."
    );
  }

  // working/audio-analysis.json is a cache keyed to audio16k.f32's mtime
  // (src/audio-analysis.ts loadAudioAnalysis). A same-source revert (the
  // only kind that reaches this point; the check above refuses the other
  // kind) never touches audio16k.f32, so the cache's key is unchanged and it
  // stays VALID after this revert. Nothing to invalidate here.

  await opts.onBeforeApply?.();

  await mutateProject(
    slug,
    (project) => {
      // E2 TOCTOU guard: re-check, INSIDE the lock, that nothing changed the
      // project since currentRevision was captured above (outside the
      // lock). A throwing fn aborts before mutateProject's save, so nothing
      // is written and nothing is logged (see mutateProject's contract).
      const liveRevision = project.revision ?? 0;
      if (liveRevision !== currentRevision) {
        throw new Error(
          `${slug}: project changed while preparing the revert; retry`
        );
      }
      // Replace the project's contents wholesale in place: fn receives the
      // live object mutateProject will save, so we clear every own key and
      // copy the snapshot's onto it rather than reassigning the binding.
      // Assigning undefined (not `delete`) still clears the field from the
      // saved JSON: JSON.stringify drops undefined-valued properties.
      const mutable = project as Record<string, unknown>;
      for (const key of Object.keys(project)) {
        mutable[key] = undefined;
      }
      Object.assign(project, snapshot);
      // Do NOT set revision here: mutateProject bumps it from the CURRENT
      // revisionBefore right after fn returns, keeping the counter
      // monotonic even though the restored content is old (a revert is
      // itself a new, forward-moving edit, not a rewind of the counter).
      mutable.revision = undefined;
    },
    {
      action: "revert",
      actor: opts.actor,
      input: { to: revision },
      taskId: opts.taskId,
    }
  );

  const after = await loadProject(slug);
  return { revision: after.revision ?? 0, restoredTo: revision };
}
