"use client";

import type { MutableRefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toastSaveError } from "@/lib/app-toast";
import {
  beginPersisting,
  clearPersisted,
  discardMutations,
  EMPTY_SAVE_QUEUE_STATE,
  enqueueMutation,
  getDirtyCount,
  getFailedMutations,
  markRetrying,
  reconcileFromResult,
  type SaveMutationRecord,
  type SaveQueueState,
} from "@/lib/save-queue";
import type { ActionResult } from "../../app/actions.ts";

export interface ProjectSaves {
  /** Count of unsaved/failed mutations (queued, persisting, retrying, or failed). */
  dirtyCount: number;
  /** Clears rejected local mutation state without retrying (paired with a Reload-from-disk reseed). */
  discardFailedSaves: () => void;
  enqueueSave: (task: () => Promise<ActionResult>) => void;
  /** Mutations that failed and have not yet been retried to success. */
  failedSaves: readonly SaveMutationRecord[];
  hasUnsavedWork: boolean;
  pendingSaves: number;
  /** Re-attempts every failed mutation exactly once each (dedupe by id). */
  retryFailedSaves: () => void;
  /** Count of mutations currently being (re)persisted after a retry request. */
  retryingCount: number;
  saveChainRef: MutableRefObject<Promise<void>>;
  saveError: string | null;
  saveErrorRef: MutableRefObject<string | null>;
  setSaveError: (message: string | null) => void;
}

export function useProjectSaves(
  onSaveSuccess?: () => void | Promise<void>
): ProjectSaves {
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [queueState, setQueueState] = useState<SaveQueueState>(
    EMPTY_SAVE_QUEUE_STATE
  );
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveErrorRef = useRef<string | null>(null);
  // The synchronous source of truth for the queue. `enqueueSave` is called
  // from inside a *different* piece of state's updater (setProject's
  // callback in use-transcript-edits.ts), and a save can be gated and
  // retried from plain event handlers too - none of that can rely on
  // `setState`'s functional-updater callback having actually run by the
  // time the next line of code executes (it is queued, not synchronous).
  // So every transition is computed against this ref first, synchronously,
  // and `setQueueState` afterwards just mirrors the ref's value into React
  // state to drive a re-render. That is also what makes the exactly-once
  // retry guarantee (via beginPersisting's `started` flag) trustworthy: the
  // check and the mutation happen in the same synchronous statement.
  const queueStateRef = useRef<SaveQueueState>(EMPTY_SAVE_QUEUE_STATE);
  const taskMapRef = useRef(new Map<string, () => Promise<ActionResult>>());
  const mutationSeqRef = useRef(0);
  const onSaveSuccessRef = useRef(onSaveSuccess);
  onSaveSuccessRef.current = onSaveSuccess;

  const commitQueueState = useCallback((next: SaveQueueState) => {
    queueStateRef.current = next;
    setQueueState(next);
  }, []);

  // Runs (or re-runs, on retry) the mutation identified by `id`. Shared by
  // both the initial enqueue and retryFailedSaves, so both paths go through
  // the same synchronous beginPersisting gate: markRetrying is a no-op
  // unless the mutation is "failed", and beginPersisting only starts from
  // "queued" or "retrying" - a duplicate/concurrent call for an id already
  // "persisting" sees started: false and never invokes task() again.
  const runMutation = useCallback(
    (id: string) => {
      const task = taskMapRef.current.get(id);
      if (!task) {
        return;
      }
      const retrying = markRetrying(queueStateRef.current, id);
      const { started, state } = beginPersisting(retrying, id);
      commitQueueState(state);
      if (!started) {
        return;
      }
      const run = saveChainRef.current
        .catch(() => {
          // Keep later saves moving after one failed request.
        })
        .then(async () => {
          setPendingSaves((n) => n + 1);
          setSaveError(null);
          saveErrorRef.current = null;
          try {
            const data = await task();
            if (!data.ok) {
              throw new Error(data.error ?? "save failed");
            }
            commitQueueState(
              clearPersisted(
                reconcileFromResult(queueStateRef.current, id, { ok: true })
              )
            );
            taskMapRef.current.delete(id);
            if (onSaveSuccessRef.current) {
              await onSaveSuccessRef.current();
            }
          } catch (e) {
            const message = (e as Error).message;
            commitQueueState(
              reconcileFromResult(queueStateRef.current, id, {
                error: message,
                ok: false,
              })
            );
            saveErrorRef.current = message;
            setSaveError(message);
            toastSaveError(message);
            throw e;
          } finally {
            setPendingSaves((n) => Math.max(0, n - 1));
          }
        });
      saveChainRef.current = run.catch(() => {
        // The visible dirty/error state above is the user-facing failure path.
      });
    },
    [commitQueueState]
  );

  const enqueueSave = useCallback(
    (task: () => Promise<ActionResult>) => {
      const id = `save-${++mutationSeqRef.current}`;
      taskMapRef.current.set(id, task);
      commitQueueState(enqueueMutation(queueStateRef.current, id));
      runMutation(id);
    },
    [commitQueueState, runMutation]
  );

  const retryFailedSaves = useCallback(() => {
    for (const mutation of getFailedMutations(queueStateRef.current)) {
      runMutation(mutation.id);
    }
  }, [runMutation]);

  const discardFailedSaves = useCallback(() => {
    const failedIds = getFailedMutations(queueStateRef.current).map(
      (m) => m.id
    );
    for (const id of failedIds) {
      taskMapRef.current.delete(id);
    }
    commitQueueState(discardMutations(queueStateRef.current, failedIds));
    setSaveError(null);
    saveErrorRef.current = null;
  }, [commitQueueState]);

  const dirtyCount = useMemo(() => getDirtyCount(queueState), [queueState]);
  const failedSaves = useMemo(
    () => getFailedMutations(queueState),
    [queueState]
  );
  // A mutation currently "retrying" (about to restart) or "persisting" with
  // attempts > 0 (a retry's attempt already in flight) is the precise signal
  // that a retry is underway, independent of unrelated fresh saves that may
  // also be running concurrently.
  const retryingCount = useMemo(
    () =>
      queueState.mutations.filter(
        (m) =>
          m.state === "retrying" || (m.state === "persisting" && m.attempts > 0)
      ).length,
    [queueState]
  );

  return {
    dirtyCount,
    discardFailedSaves,
    enqueueSave,
    failedSaves,
    hasUnsavedWork: dirtyCount > 0,
    pendingSaves,
    retryFailedSaves,
    retryingCount,
    saveChainRef,
    saveError,
    saveErrorRef,
    setSaveError,
  };
}
