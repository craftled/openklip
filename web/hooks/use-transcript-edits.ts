"use client";

import { stampGuiWordProvenance } from "@engine/provenance-display";
import { useCallback, useState } from "react";
import type { EditorProject, EditorSelection } from "@/lib/editor-types";
import {
  reconcileTranscriptText,
  setWordRangeDeleted,
} from "@/lib/transcript-edit";
import type { ActionResult } from "../../app/actions.ts";
import { saveProjectEdits } from "../../app/actions.ts";

export interface UseTranscriptEditsParams {
  enqueueSave: (task: () => Promise<ActionResult>) => void;
  setProject: React.Dispatch<React.SetStateAction<EditorProject>>;
  setSelected: React.Dispatch<React.SetStateAction<EditorSelection>>;
}

export function useTranscriptEdits({
  enqueueSave,
  setProject,
  setSelected,
}: UseTranscriptEditsParams) {
  const [selAnchor, setSelAnchor] = useState<number | null>(null);
  const [selFocus, setSelFocus] = useState<number | null>(null);

  const toggleWord = useCallback(
    (id: string) => {
      setProject((prev) => {
        const revisionAfter = (prev.revision ?? 0) + 1;
        const words = stampGuiWordProvenance(
          prev.words.map((w) =>
            w.id === id ? { ...w, deleted: !w.deleted } : w
          ),
          [id],
          revisionAfter
        );
        // Send only the changed word: applyProjectEdits (src/projectMutations.ts)
        // patches by id, so a narrow payload keeps this mutation independent
        // of any other in-flight edit. A full-array snapshot would let a
        // retry of THIS mutation (after a transient failure) resend stale
        // deleted-state for every other word too, clobbering unrelated edits
        // that already succeeded in the meantime.
        const changed = words.find((w) => w.id === id);
        enqueueSave(() =>
          saveProjectEdits(prev.slug, {
            words: changed
              ? [{ deleted: changed.deleted, id: changed.id }]
              : [],
          })
        );
        return { ...prev, words };
      });
    },
    [enqueueSave, setProject]
  );

  const setTranscriptRangeDeleted = useCallback(
    (range: readonly [number, number], deleted: boolean) => {
      setProject((prev) => {
        const revisionAfter = (prev.revision ?? 0) + 1;
        const changedIds = prev.words
          .slice(range[0], range[1] + 1)
          .map((w) => w.id);
        const words = stampGuiWordProvenance(
          setWordRangeDeleted(prev.words, range, deleted),
          changedIds,
          revisionAfter
        );
        // Same narrowing as toggleWord above: only the words in `range`
        // actually changed, so only they need to ride in the save payload.
        const changedIdSet = new Set(changedIds);
        enqueueSave(() =>
          saveProjectEdits(prev.slug, {
            words: words
              .filter((w) => changedIdSet.has(w.id))
              .map((w) => ({
                deleted: w.deleted,
                id: w.id,
                text: w.text,
              })),
          })
        );
        return { ...prev, words };
      });
    },
    [enqueueSave, setProject]
  );

  const reconcileTranscriptEdit = useCallback(
    (editedText: string) => {
      setProject((prev) => {
        const revisionAfter = (prev.revision ?? 0) + 1;
        const words = stampGuiWordProvenance(
          reconcileTranscriptText(prev.words, editedText),
          prev.words.map((w) => w.id),
          revisionAfter
        );
        enqueueSave(() =>
          saveProjectEdits(prev.slug, {
            words: words.map((w) => ({
              id: w.id,
              deleted: w.deleted,
              text: w.text,
            })),
          })
        );
        return { ...prev, words };
      });
    },
    [enqueueSave, setProject]
  );

  const selRange =
    selAnchor != null && selFocus != null
      ? ([
          Math.min(selAnchor, selFocus),
          Math.max(selAnchor, selFocus),
        ] as const)
      : null;

  const clearSel = useCallback(() => {
    setSelAnchor(null);
    setSelFocus(null);
  }, []);

  const selectTranscriptRange = useCallback(
    (range: readonly [number, number] | null) => {
      setSelected(null);
      if (range) {
        setSelAnchor(range[0]);
        setSelFocus(range[1]);
      } else {
        setSelAnchor(null);
        setSelFocus(null);
      }
    },
    [setSelected]
  );

  const cutSelection = useCallback(
    (range: readonly [number, number] | null = selRange) => {
      if (range) {
        setTranscriptRangeDeleted(range, true);
      }
    },
    [selRange, setTranscriptRangeDeleted]
  );

  const restoreSelection = useCallback(
    (range: readonly [number, number] | null = selRange) => {
      if (range) {
        setTranscriptRangeDeleted(range, false);
      }
    },
    [selRange, setTranscriptRangeDeleted]
  );

  const clearTranscriptSelection = useCallback(() => {
    setSelAnchor(null);
    setSelFocus(null);
  }, []);

  const extendTranscriptSelection = useCallback(
    (index: number) => {
      setSelected(null);
      setSelAnchor((prev) => (prev == null ? index : prev));
      setSelFocus(index);
    },
    [setSelected]
  );

  return {
    clearSel,
    clearTranscriptSelection,
    cutSelection,
    extendTranscriptSelection,
    reconcileTranscriptEdit,
    restoreSelection,
    selAnchor,
    selFocus,
    selRange,
    selectTranscriptRange,
    setSelAnchor,
    setSelFocus,
    setTranscriptRangeDeleted,
    toggleWord,
  };
}
