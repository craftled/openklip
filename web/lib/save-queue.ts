/**
 * Pure state machine for the editor's optimistic save queue.
 *
 * Each optimistic edit (transcript word toggle, overlay patch, etc.) becomes
 * one mutation record with a stable id. A mutation moves:
 *
 *   queued -> persisting -> persisted
 *                  \-> failed -> retrying -> persisting -> ...
 *
 * A failed mutation stays in `mutations` until it is either retried to
 * success or explicitly discarded (Reload-from-disk) - it is never silently
 * dropped by later, unrelated mutations succeeding. `beginPersisting` is the
 * single choke point that starts network work; it only transitions
 * queued/retrying -> persisting and reports whether IT was the call that did
 * so. Callers use that flag to guard against invoking the underlying task
 * twice for the same id (retry idempotency).
 */

export type SaveMutationState =
  | "failed"
  | "persisted"
  | "persisting"
  | "queued"
  | "retrying";

export interface SaveMutationRecord {
  readonly attempts: number;
  readonly createdAt: number;
  readonly error: string | null;
  readonly id: string;
  readonly state: SaveMutationState;
}

export interface SaveQueueState {
  readonly mutations: readonly SaveMutationRecord[];
}

export type SaveReconcileResult = { error: string; ok: false } | { ok: true };

export const EMPTY_SAVE_QUEUE_STATE: SaveQueueState = { mutations: [] };

export function getMutation(
  state: SaveQueueState,
  id: string
): SaveMutationRecord | undefined {
  return state.mutations.find((m) => m.id === id);
}

export function enqueueMutation(
  state: SaveQueueState,
  id: string,
  now = Date.now()
): SaveQueueState {
  if (getMutation(state, id)) {
    return state;
  }
  return {
    mutations: [
      ...state.mutations,
      { attempts: 0, createdAt: now, error: null, id, state: "queued" },
    ],
  };
}

function replaceMutation(
  state: SaveQueueState,
  id: string,
  update: (record: SaveMutationRecord) => SaveMutationRecord
): SaveQueueState {
  const index = state.mutations.findIndex((m) => m.id === id);
  if (index === -1) {
    return state;
  }
  const mutations = state.mutations.slice();
  mutations[index] = update(mutations[index]);
  return { mutations };
}

/**
 * Starts persisting a mutation. Only valid from "queued" or "retrying" - any
 * other state (already persisting, persisted, or still failed with no retry
 * requested) is a no-op that returns the same state and `started: false`.
 * Callers must only invoke the underlying save task when `started` is true,
 * which is what makes concurrent/duplicate retry calls exactly-once.
 */
export function beginPersisting(
  state: SaveQueueState,
  id: string
): { started: boolean; state: SaveQueueState } {
  const record = getMutation(state, id);
  if (!record || (record.state !== "queued" && record.state !== "retrying")) {
    return { started: false, state };
  }
  return {
    started: true,
    state: replaceMutation(state, id, (r) => ({ ...r, state: "persisting" })),
  };
}

export function markPersisted(
  state: SaveQueueState,
  id: string
): SaveQueueState {
  const record = getMutation(state, id);
  if (record?.state !== "persisting") {
    return state;
  }
  return replaceMutation(state, id, (r) => ({
    ...r,
    error: null,
    state: "persisted",
  }));
}

export function markFailed(
  state: SaveQueueState,
  id: string,
  error: string
): SaveQueueState {
  const record = getMutation(state, id);
  if (record?.state !== "persisting") {
    return state;
  }
  return replaceMutation(state, id, (r) => ({
    ...r,
    attempts: r.attempts + 1,
    error,
    state: "failed",
  }));
}

/** failed -> retrying, marking intent to retry. No-op unless currently failed. */
export function markRetrying(
  state: SaveQueueState,
  id: string
): SaveQueueState {
  const record = getMutation(state, id);
  if (record?.state !== "failed") {
    return state;
  }
  return replaceMutation(state, id, (r) => ({ ...r, state: "retrying" }));
}

/** Reconciles a mutation against an authoritative server response. */
export function reconcileFromResult(
  state: SaveQueueState,
  id: string,
  result: SaveReconcileResult
): SaveQueueState {
  return result.ok
    ? markPersisted(state, id)
    : markFailed(state, id, result.error);
}

export function discardMutations(
  state: SaveQueueState,
  ids: readonly string[]
): SaveQueueState {
  if (ids.length === 0) {
    return state;
  }
  const idSet = new Set(ids);
  return { mutations: state.mutations.filter((m) => !idSet.has(m.id)) };
}

/** Drops persisted records from the queue (memory hygiene; never affects dirty count). */
export function clearPersisted(state: SaveQueueState): SaveQueueState {
  if (!state.mutations.some((m) => m.state === "persisted")) {
    return state;
  }
  return { mutations: state.mutations.filter((m) => m.state !== "persisted") };
}

export function getFailedMutations(
  state: SaveQueueState
): readonly SaveMutationRecord[] {
  return state.mutations.filter((m) => m.state === "failed");
}

/** Count of mutations that are not yet durably persisted (queued/persisting/failed/retrying). */
export function getDirtyCount(state: SaveQueueState): number {
  return state.mutations.filter((m) => m.state !== "persisted").length;
}

export function isDirty(state: SaveQueueState): boolean {
  return getDirtyCount(state) > 0;
}

export function hasFailures(state: SaveQueueState): boolean {
  return getFailedMutations(state).length > 0;
}
