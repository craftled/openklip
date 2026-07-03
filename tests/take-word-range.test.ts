import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveWordRange } from "../web/lib/take-word-range.ts";

const words = [{ id: "w0" }, { id: "w1" }, { id: "w2" }, { id: "w3" }];

test("resolveWordRange resolves a forward click order (start before end)", () => {
  const range = resolveWordRange(words, "w1", "w3");
  assert.deepEqual(range, { startWordId: "w1", endWordId: "w3" });
});

test("resolveWordRange swaps a reversed click order (end clicked before start)", () => {
  const range = resolveWordRange(words, "w3", "w1");
  assert.deepEqual(range, { startWordId: "w1", endWordId: "w3" });
});

test("resolveWordRange handles clicking the same word twice (single-word range)", () => {
  const range = resolveWordRange(words, "w2", "w2");
  assert.deepEqual(range, { startWordId: "w2", endWordId: "w2" });
});

test("resolveWordRange returns null when the first clicked id is not found", () => {
  assert.equal(resolveWordRange(words, "missing", "w1"), null);
});

test("resolveWordRange returns null when the second clicked id is not found", () => {
  assert.equal(resolveWordRange(words, "w1", "missing"), null);
});
