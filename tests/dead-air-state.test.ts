import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type DeadAirItem,
  reconcileDeadAirItems,
} from "../web/lib/dead-air-state.ts";

function item(id: string, startSample: number, endSample: number): DeadAirItem {
  return { id, startSample, endSample };
}

test("reconcileDeadAirItems replaces coalesced existing ids and optimistic placeholders", () => {
  const current = [
    item("da-existing", 100, 200),
    item("da-optimistic", 150, 250),
    item("da-untouched", 300, 400),
  ];
  const created = [item("da-existing", 100, 250)];

  const next = reconcileDeadAirItems(
    current,
    created,
    (id) => id === "da-optimistic"
  );

  assert.deepEqual(next, [
    item("da-untouched", 300, 400),
    item("da-existing", 100, 250),
  ]);
});

test("reconcileDeadAirItems removes batch optimistic ids by predicate", () => {
  const current = [
    item("da1", 0, 100),
    item("batch-0", 100, 200),
    item("batch-1", 200, 300),
  ];
  const created = [item("da2", 100, 300)];

  const next = reconcileDeadAirItems(current, created, (id) =>
    id.startsWith("batch-")
  );

  assert.deepEqual(next, [item("da1", 0, 100), item("da2", 100, 300)]);
});
