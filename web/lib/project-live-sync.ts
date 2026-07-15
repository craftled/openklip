/**
 * Live sync: detect external project.json revisions (CLI/MCP) and decide
 * whether the editor should reseed from disk.
 *
 * The asset bin already polls folder sync; this layer is revision-only so a
 * full project load only runs when the EDL actually advanced.
 */

export const PROJECT_LIVE_SYNC_POLL_MS = 2000;

export interface LiveSyncDecisionInput {
  /** True while a full project reseed fetch is already in flight. */
  fetchInFlight?: boolean;
  /** In-flight GUI saves: never clobber optimistic local state. */
  pendingSaves: number;
  /** Latest revision reported by GET /api/projects/:slug/revision. */
  remoteRevision: number;
  /** Revision the editor last applied from the server (or initial load). */
  syncedRevision: number;
}

export type LiveSyncDecision =
  | { action: "noop" }
  | { action: "fetch-project"; remoteRevision: number };

/**
 * Decide whether to pull the full project after a revision poll.
 * Only advances when remote is strictly ahead of what we last applied and
 * no local saves are pending.
 */
export function decideLiveSync(input: LiveSyncDecisionInput): LiveSyncDecision {
  if (input.pendingSaves > 0) {
    return { action: "noop" };
  }
  if (input.fetchInFlight) {
    return { action: "noop" };
  }
  if (input.remoteRevision <= input.syncedRevision) {
    return { action: "noop" };
  }
  return {
    action: "fetch-project",
    remoteRevision: input.remoteRevision,
  };
}

/**
 * Merge a disk-loaded engine project into the open editor document.
 * Preserves client-only fields that are not part of project.json (same as
 * HistoryPanel onReverted / cam-mix reseed).
 */
export function mergeExternalEditorProject<
  T extends {
    brief?: unknown;
    dirPath?: unknown;
    mediaVersion?: unknown;
    silences?: unknown;
  },
>(prev: T, remote: object): T {
  return {
    ...prev,
    ...remote,
    brief: prev.brief,
    dirPath: prev.dirPath,
    mediaVersion: prev.mediaVersion,
    silences: prev.silences,
  };
}

export function revisionFromProject(project: {
  revision?: number | null;
}): number {
  return typeof project.revision === "number" &&
    Number.isFinite(project.revision)
    ? project.revision
    : 0;
}

export type AfterGuiSaveDecision =
  | { action: "noop" }
  | { action: "bump-revision"; revision: number }
  | { action: "reseed"; revision: number };

/**
 * After a GUI save completes, compare the editor's last known revision to the
 * revision on disk. A single-step advance is usually our own write (bump the
 * client counter only). A larger jump means another writer advanced the EDL
 * during the save and the editor should reseed.
 */
export function decideAfterGuiSave(
  clientRevision: number,
  remoteRevision: number
): AfterGuiSaveDecision {
  if (remoteRevision <= clientRevision) {
    return { action: "noop" };
  }
  if (remoteRevision > clientRevision + 1) {
    return { action: "reseed", revision: remoteRevision };
  }
  return { action: "bump-revision", revision: remoteRevision };
}
