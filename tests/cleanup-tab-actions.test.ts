import { test } from "bun:test";
import assert from "node:assert/strict";
import type { CleanupCandidate } from "../src/cleanup.ts";
import {
  buildCleanupConfigPatch,
  groupCandidatesByCategory,
  runApplyEnabledCleanup,
  runToggleCleanupCategory,
  runUndoLastCleanup,
  undoItemCount,
} from "../web/lib/cleanup-tab.ts";

function candidate(
  overrides: Partial<CleanupCandidate> = {}
): CleanupCandidate {
  return {
    category: "hesitation",
    endSec: 2,
    estSavedSec: 0.5,
    id: "f-w1",
    kind: "filler",
    reason: "isolated 'um'",
    risk: "safe",
    startSec: 1.5,
    text: "um",
    wordIds: ["w1"],
    ...overrides,
  };
}

test("buildCleanupConfigPatch returns a single category toggle", () => {
  assert.deepEqual(buildCleanupConfigPatch("hedging", true), { hedging: true });
  assert.deepEqual(buildCleanupConfigPatch("repeat", false), { repeat: false });
});

test("groupCandidatesByCategory keeps fixed order and hides empty groups", () => {
  const grouped = groupCandidatesByCategory([
    candidate({ id: "da-1", category: "dead-air", kind: "dead-air", text: "" }),
    candidate({ id: "h-1", category: "hedging", text: "you know" }),
    candidate({ id: "r-1", category: "repeat", text: "like like" }),
    candidate({ id: "hes-1", category: "hesitation", text: "um" }),
  ]);
  assert.deepEqual(
    grouped.map((group) => group.category),
    ["hesitation", "hedging", "repeat", "dead-air"]
  );
  assert.equal(grouped[0]?.candidates.length, 1);
  assert.equal(grouped[3]?.candidates[0]?.id, "da-1");
});

test("groupCandidatesByCategory omits categories with no candidates", () => {
  const grouped = groupCandidatesByCategory([
    candidate({ id: "hes-1", category: "hesitation" }),
  ]);
  assert.deepEqual(
    grouped.map((group) => group.category),
    ["hesitation"]
  );
});

test("undoItemCount sums word and dead-air ids", () => {
  assert.equal(
    undoItemCount({ wordIds: ["w1", "w2"], deadAirSpanIds: ["da-1"] }),
    3
  );
});

test("runToggleCleanupCategory fires cleanup-config with the category payload", async () => {
  const calls: { action: string; input: unknown; slug: string }[] = [];
  const result = await runToggleCleanupCategory(
    "demo",
    "hedging",
    true,
    (slug, action, input) => {
      calls.push({ slug, action, input });
      return Promise.resolve({ ok: true });
    }
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.action, "cleanup-config");
  assert.deepEqual(calls[0]?.input, { hedging: true });
});

test("runApplyEnabledCleanup fires cleanup-apply mode enabled", async () => {
  const calls: { action: string; input: unknown; slug: string }[] = [];
  const result = await runApplyEnabledCleanup("demo", (slug, action, input) => {
    calls.push({ slug, action, input });
    return Promise.resolve({ ok: true });
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0]?.action, "cleanup-apply");
  assert.deepEqual(calls[0]?.input, { mode: "enabled" });
});

test("runUndoLastCleanup fires cut restore then dead-air-rm and returns all results", async () => {
  const calls: { action: string; input: unknown; slug: string }[] = [];
  const results = await runUndoLastCleanup(
    "demo",
    { wordIds: ["w1", "w2"], deadAirSpanIds: ["da-1", "da-2"] },
    (slug, action, input) => {
      calls.push({ slug, action, input });
      return Promise.resolve({ ok: true });
    }
  );
  assert.equal(results.length, 3);
  assert.equal(calls[0]?.action, "cut");
  assert.deepEqual(calls[0]?.input, { ids: ["w1", "w2"], deleted: false });
  assert.equal(calls[1]?.action, "dead-air-rm");
  assert.deepEqual(calls[1]?.input, { id: "da-1" });
  assert.equal(calls[2]?.action, "dead-air-rm");
  assert.deepEqual(calls[2]?.input, { id: "da-2" });
});
