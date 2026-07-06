"use client";

import type { ActionLogEntry } from "@engine/action-log-entry";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  historyEntryShowsTranscriptDiff,
  historySnapshotRevisionAvailable,
  historyTranscriptDiffTitle,
  resolveHistoryTranscriptDiff,
} from "@/lib/history-transcript-diff";
import type { TranscriptDiffWord } from "@/lib/transcript-diff";

const TranscriptDiffView = dynamic(
  () =>
    import("@/components/transcript-diff-view").then(
      (mod) => mod.TranscriptDiffView
    ),
  {
    loading: () => (
      <p className="text-muted-foreground text-xs">Loading diff view...</p>
    ),
    ssr: false,
  }
);

export function canShowHistoryTranscriptDiff(
  entry: Pick<ActionLogEntry, "action" | "revisionBefore">,
  snapshotRevisions: readonly number[]
): boolean {
  return (
    historyEntryShowsTranscriptDiff(entry) &&
    historySnapshotRevisionAvailable(entry.revisionBefore, snapshotRevisions)
  );
}

async function fetchSnapshotWords(
  slug: string,
  revision: number
): Promise<TranscriptDiffWord[]> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(slug)}/history/snapshot?revision=${revision}`
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? `Snapshot request failed (${res.status})`);
  }
  const data = (await res.json()) as { words: TranscriptDiffWord[] };
  return data.words;
}

export function HistoryTranscriptDiffToggle({
  currentRevision,
  currentWords,
  entry,
  snapshotRevisions,
  slug,
}: {
  currentRevision: number;
  currentWords: readonly TranscriptDiffWord[];
  entry: ActionLogEntry;
  snapshotRevisions: readonly number[];
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oldWords, setOldWords] = useState<TranscriptDiffWord[] | null>(null);
  const [newWords, setNewWords] = useState<TranscriptDiffWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = canShowHistoryTranscriptDiff(entry, snapshotRevisions);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { afterRevision, beforeRevision, usesCurrentProjectForAfter } =
        resolveHistoryTranscriptDiff(entry, currentRevision);
      const beforeWords = await fetchSnapshotWords(slug, beforeRevision);
      const afterWords = usesCurrentProjectForAfter
        ? [...currentWords]
        : historySnapshotRevisionAvailable(afterRevision, snapshotRevisions)
          ? await fetchSnapshotWords(slug, afterRevision)
          : [...currentWords];
      setOldWords(beforeWords);
      setNewWords(afterWords);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load transcript diff"
      );
    } finally {
      setLoading(false);
    }
  }, [currentRevision, currentWords, entry, slug, snapshotRevisions]);

  if (!visible) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-2" data-history-transcript-diff>
      <Button
        className="h-7 w-fit px-2 text-xs"
        disabled={loading}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen && oldWords === null && newWords === null) {
            void load();
          }
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {loading
          ? "Loading diff…"
          : open
            ? "Hide transcript diff"
            : "Show transcript diff"}
      </Button>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {open && oldWords && newWords ? (
        <TranscriptDiffView
          compact
          newWords={newWords}
          oldWords={oldWords}
          title={historyTranscriptDiffTitle(entry)}
        />
      ) : null}
    </div>
  );
}
