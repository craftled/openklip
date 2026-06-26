import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDragReorder } from "../web/lib/dnd-reorder.ts";

test("applyDragReorder moves the active id to the over id's slot", () => {
  assert.deepEqual(applyDragReorder(["a", "b", "c"], "a", "c"), [
    "b",
    "c",
    "a",
  ]);
  assert.deepEqual(applyDragReorder(["a", "b", "c"], "c", "a"), [
    "c",
    "a",
    "b",
  ]);
});

test("applyDragReorder is a no-op when active equals over or ids are unknown", () => {
  assert.deepEqual(applyDragReorder(["a", "b", "c"], "b", "b"), [
    "a",
    "b",
    "c",
  ]);
  assert.deepEqual(applyDragReorder(["a", "b", "c"], "x", "a"), [
    "a",
    "b",
    "c",
  ]);
});
