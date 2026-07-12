import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBulkSilenceUndoSnapshot,
  chunkDeadAirSpans,
} from "../web/lib/cleanup-silence.ts";
import { runUndoLastCleanup } from "../web/lib/cleanup-tab.ts";
import {
  createdDeadAirIdsFromTouches,
  type DeadAirTouch,
  deadAirItemsFromTouches,
  mergeDeadAirTouches,
} from "../web/lib/dead-air-touch.ts";

function touch(
  id: string,
  created: boolean,
  startSample = 0,
  endSample = 48_000
): DeadAirTouch {
  return { created, span: { id, startSample, endSample } };
}

test("deadAirItemsFromTouches maps touch.span for optimistic reconcile", () => {
  const touches = [
    touch("da-1", true, 100, 200),
    touch("da-existing", false, 300, 400),
  ];
  assert.deepEqual(deadAirItemsFromTouches(touches), [
    { id: "da-1", startSample: 100, endSample: 200 },
    { id: "da-existing", startSample: 300, endSample: 400 },
  ]);
});

test("createdDeadAirIdsFromTouches keeps only created touches", () => {
  const touches = [
    touch("da-1", true),
    touch("da-existing", false),
    touch("da-2", true),
  ];
  assert.deepEqual(createdDeadAirIdsFromTouches(touches), ["da-1", "da-2"]);
});

test("bulk silence apply undo removes exactly the created ids", async () => {
  const spans = Array.from({ length: 3 }, (_, index) => ({
    fromSec: index,
    toSec: index + 0.5,
  }));
  const batches = chunkDeadAirSpans(spans, 2);
  assert.equal(batches.length, 2);

  const batchResults: DeadAirTouch[][] = [
    [touch("da-1", true), touch("da-existing", false)],
    [touch("da-2", true)],
  ];
  const allTouches = mergeDeadAirTouches(batchResults);
  const undoSnapshot = buildBulkSilenceUndoSnapshot(
    createdDeadAirIdsFromTouches(allTouches)
  );
  assert.deepEqual(undoSnapshot, {
    wordIds: [],
    deadAirSpanIds: ["da-1", "da-2"],
  });

  const calls: { action: string; input: unknown }[] = [];
  await runUndoLastCleanup("demo", undoSnapshot, (_slug, action, input) => {
    calls.push({ action, input });
    return Promise.resolve({ ok: true });
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.action, "dead-air-rm");
  assert.deepEqual(calls[0]?.input, { id: "da-1" });
  assert.deepEqual(calls[1]?.input, { id: "da-2" });
});
