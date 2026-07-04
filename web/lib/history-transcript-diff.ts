import type { ActionLogEntry } from "@engine/action-log-entry";
import type { Project } from "@engine/edl";
import type { TranscriptDiffWord } from "@/lib/transcript-diff";

const TRANSCRIPT_DIFF_ACTIONS = new Set([
  "cut",
  "cut-text",
  "edit-words",
  "restore",
  "word-text",
]);

export function historyEntryShowsTranscriptDiff(
  entry: Pick<ActionLogEntry, "action">
): boolean {
  return TRANSCRIPT_DIFF_ACTIONS.has(entry.action);
}

export function resolveHistoryTranscriptDiff(
  entry: Pick<ActionLogEntry, "revisionAfter" | "revisionBefore">,
  currentRevision: number
): {
  afterRevision: number;
  beforeRevision: number;
  usesCurrentProjectForAfter: boolean;
} {
  const usesCurrentProjectForAfter = entry.revisionAfter >= currentRevision;
  return {
    afterRevision: entry.revisionAfter,
    beforeRevision: entry.revisionBefore,
    usesCurrentProjectForAfter,
  };
}

export function projectWordsForTranscriptDiff(
  project: Pick<Project, "words">
): TranscriptDiffWord[] {
  return project.words.map((word) => ({
    deleted: word.deleted,
    id: word.id,
    text: word.text,
  }));
}

export function historySnapshotRevisionAvailable(
  revision: number,
  snapshotRevisions: readonly number[]
): boolean {
  return snapshotRevisions.includes(revision);
}

export function historyTranscriptDiffTitle(
  entry: Pick<ActionLogEntry, "action" | "revisionAfter" | "revisionBefore">
): string {
  return `${entry.action} · ${entry.revisionBefore} → ${entry.revisionAfter}`;
}

/** Keep transcript diff "after" resolution aligned with the newest logged revision. */
export function effectiveCurrentRevision(
  currentRevision: number | undefined,
  entries: readonly Pick<ActionLogEntry, "revisionAfter">[]
): number {
  const fromProject = currentRevision ?? 0;
  const fromHistory = entries[0]?.revisionAfter ?? 0;
  return Math.max(fromProject, fromHistory);
}
