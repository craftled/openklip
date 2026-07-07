import assert from "node:assert/strict";
import { test } from "node:test";
import { mapWithConcurrency } from "../src/async-pool.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("mapWithConcurrency preserves input order while bounding active workers", async () => {
  let active = 0;
  let maxActive = 0;
  const starts: number[] = [];

  const results = await mapWithConcurrency(
    [30, 10, 20, 5],
    2,
    async (ms, index) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      starts.push(index);
      await delay(ms);
      active -= 1;
      return `${index}:${ms}`;
    }
  );

  assert.deepEqual(results, ["0:30", "1:10", "2:20", "3:5"]);
  assert.equal(maxActive, 2);
  assert.deepEqual(starts.slice(0, 2), [0, 1]);
});

test("mapWithConcurrency returns an empty array for empty input", async () => {
  const results = await mapWithConcurrency([], 3, async () => "unused");
  assert.deepEqual(results, []);
});

test("mapWithConcurrency rejects an invalid concurrency limit", async () => {
  await assert.rejects(
    () => mapWithConcurrency([1], 0, async (value) => value),
    /concurrency limit/i
  );
});
