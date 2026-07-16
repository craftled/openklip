import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginPersisting,
  clearPersisted,
  discardMutations,
  EMPTY_SAVE_QUEUE_STATE,
  enqueueMutation,
  getDirtyCount,
  getFailedMutations,
  getMutation,
  hasFailures,
  isDirty,
  markFailed,
  markPersisted,
  markRetrying,
  reconcileFromResult,
} from "../web/lib/save-queue.ts";

test("enqueueMutation adds a queued record", () => {
  const state = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1", 1000);
  assert.deepEqual(getMutation(state, "m1"), {
    attempts: 0,
    createdAt: 1000,
    error: null,
    id: "m1",
    state: "queued",
  });
});

test("enqueueMutation is a no-op for an id already present", () => {
  const once = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1", 1000);
  const twice = enqueueMutation(once, "m1", 2000);
  assert.equal(twice, once);
  assert.equal(twice.mutations.length, 1);
  assert.equal(getMutation(twice, "m1")?.createdAt, 1000);
});

test("beginPersisting transitions queued -> persisting and reports started", () => {
  const queued = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  const { started, state } = beginPersisting(queued, "m1");
  assert.equal(started, true);
  assert.equal(getMutation(state, "m1")?.state, "persisting");
});

test("beginPersisting no-ops for an unknown id", () => {
  const { started, state } = beginPersisting(EMPTY_SAVE_QUEUE_STATE, "ghost");
  assert.equal(started, false);
  assert.equal(state, EMPTY_SAVE_QUEUE_STATE);
});

test("markFailed transitions persisting -> failed and records the error", () => {
  const queued = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  const { state: persisting } = beginPersisting(queued, "m1");
  const failed = markFailed(persisting, "m1", "network down");
  const record = getMutation(failed, "m1");
  assert.equal(record?.state, "failed");
  assert.equal(record?.error, "network down");
  assert.equal(record?.attempts, 1);
});

test("full retry cycle: queued -> persisting -> failed -> retrying -> persisting -> persisted", () => {
  let state = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  ({ state } = beginPersisting(state, "m1"));
  assert.equal(getMutation(state, "m1")?.state, "persisting");

  state = markFailed(state, "m1", "boom");
  assert.equal(getMutation(state, "m1")?.state, "failed");

  state = markRetrying(state, "m1");
  assert.equal(getMutation(state, "m1")?.state, "retrying");

  const begin = beginPersisting(state, "m1");
  assert.equal(begin.started, true);
  state = begin.state;
  assert.equal(getMutation(state, "m1")?.state, "persisting");

  state = markPersisted(state, "m1");
  const record = getMutation(state, "m1");
  assert.equal(record?.state, "persisted");
  assert.equal(record?.error, null);
});

test("markRetrying is a no-op unless the mutation is currently failed", () => {
  const queued = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  const stillQueued = markRetrying(queued, "m1");
  assert.equal(stillQueued, queued);
  assert.equal(getMutation(stillQueued, "m1")?.state, "queued");
});

test("a failed mutation survives while a later, unrelated save succeeds", () => {
  let state = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  ({ state } = beginPersisting(state, "m1"));
  state = markFailed(state, "m1", "first save failed");

  state = enqueueMutation(state, "m2");
  ({ state } = beginPersisting(state, "m2"));
  state = markPersisted(state, "m2");

  // The earlier failure must not have been cleared by the later success.
  assert.equal(getMutation(state, "m1")?.state, "failed");
  assert.equal(getMutation(state, "m1")?.error, "first save failed");
  assert.equal(getMutation(state, "m2")?.state, "persisted");
  assert.deepEqual(
    getFailedMutations(state).map((m) => m.id),
    ["m1"]
  );
});

test("retry persists exactly once: a second beginPersisting call while already persisting is a no-op", () => {
  let state = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  ({ state } = beginPersisting(state, "m1"));
  state = markFailed(state, "m1", "boom");
  state = markRetrying(state, "m1");

  const first = beginPersisting(state, "m1");
  assert.equal(first.started, true);

  // A concurrent/duplicate retry call for the same id must not start a
  // second attempt while the first is still in flight.
  const second = beginPersisting(first.state, "m1");
  assert.equal(second.started, false);
  assert.equal(second.state, first.state);
  assert.equal(getMutation(second.state, "m1")?.attempts, 1);
});

test("dirty count reflects queued, persisting, failed and retrying mutations, not persisted", () => {
  let state = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  state = enqueueMutation(state, "m2");
  state = enqueueMutation(state, "m3");

  let begin = beginPersisting(state, "m1");
  state = begin.state;
  state = markPersisted(state, "m1");

  begin = beginPersisting(state, "m2");
  state = begin.state;
  state = markFailed(state, "m2", "oops");

  // m3 stays queued.
  assert.equal(getDirtyCount(state), 2); // m2 failed, m3 queued
  assert.equal(isDirty(state), true);
  assert.equal(hasFailures(state), true);
});

test("reconcileFromResult marks persisted on ok:true and failed on ok:false", () => {
  let state = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  ({ state } = beginPersisting(state, "m1"));
  const ok = reconcileFromResult(state, "m1", { ok: true });
  assert.equal(getMutation(ok, "m1")?.state, "persisted");

  let failState = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m2");
  ({ state: failState } = beginPersisting(failState, "m2"));
  const failed = reconcileFromResult(failState, "m2", {
    error: "disk full",
    ok: false,
  });
  const record = getMutation(failed, "m2");
  assert.equal(record?.state, "failed");
  assert.equal(record?.error, "disk full");
});

test("discardMutations removes the given ids (Reload-from-disk clears rejected local state)", () => {
  let state = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  ({ state } = beginPersisting(state, "m1"));
  state = markFailed(state, "m1", "boom");
  state = enqueueMutation(state, "m2");

  const discarded = discardMutations(state, ["m1"]);
  assert.equal(getMutation(discarded, "m1"), undefined);
  assert.ok(getMutation(discarded, "m2"));
  assert.equal(getDirtyCount(discarded), 1);
});

test("clearPersisted drops persisted records without touching dirty count", () => {
  let state = enqueueMutation(EMPTY_SAVE_QUEUE_STATE, "m1");
  ({ state } = beginPersisting(state, "m1"));
  state = markPersisted(state, "m1");
  state = enqueueMutation(state, "m2");

  const before = getDirtyCount(state);
  const cleared = clearPersisted(state);
  assert.equal(getMutation(cleared, "m1"), undefined);
  assert.ok(getMutation(cleared, "m2"));
  assert.equal(getDirtyCount(cleared), before);
});
