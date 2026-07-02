import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type SilenceSpan,
  snapBoundary,
  snapRanges,
  subtractDeadAir,
} from "../src/audio-analysis-core.ts";
import { SAMPLE_RATE } from "../src/edl.ts";

// ── snapBoundary ──────────────────────────────────────────────────────────

test("snapBoundary start: snaps forward to the end of a silence containing sec", () => {
  const silences: SilenceSpan[] = [{ startSec: 1.0, endSec: 1.5 }];
  assert.equal(snapBoundary(1.2, silences, 1.0, "start"), 1.5);
});

test("snapBoundary end: snaps backward to the start of a silence containing sec", () => {
  const silences: SilenceSpan[] = [{ startSec: 2.0, endSec: 2.5 }];
  assert.equal(snapBoundary(2.3, silences, 1.0, "end"), 2.0);
});

test("snapBoundary: respects maxShiftSec (too far away -> no move)", () => {
  const silences: SilenceSpan[] = [{ startSec: 1.0, endSec: 1.5 }];
  assert.equal(snapBoundary(1.2, silences, 0.1, "start"), 1.2);
});

test("snapBoundary: exactly at maxShiftSec still snaps", () => {
  const silences: SilenceSpan[] = [{ startSec: 1.0, endSec: 1.5 }];
  // sec is inside the silence (1.0 <= 1.0 <= 1.5); shift needed = 0.5 exactly.
  assert.equal(snapBoundary(1.0, silences, 0.5, "start"), 1.5);
});

test("snapBoundary start: never inverts (a silence that already ended before sec is not a candidate)", () => {
  const silences: SilenceSpan[] = [{ startSec: 0.0, endSec: 0.5 }];
  // The silence ended at 0.5, well before sec=1.0: snapping there would move
  // the start BACKWARD, which is not allowed for a "start" edge.
  assert.equal(snapBoundary(1.0, silences, 5.0, "start"), 1.0);
});

test("snapBoundary end: never inverts (a silence that has not started yet is not a candidate)", () => {
  const silences: SilenceSpan[] = [{ startSec: 3.0, endSec: 3.5 }];
  // The silence starts at 3.0, well after sec=1.0: snapping there would move
  // the end FORWARD, which is not allowed for an "end" edge.
  assert.equal(snapBoundary(1.0, silences, 5.0, "end"), 1.0);
});

test("snapBoundary: no silences -> unchanged", () => {
  assert.equal(snapBoundary(1.2, [], 1.0, "start"), 1.2);
});

test("snapBoundary: sec exactly on a silence edge is a no-op move", () => {
  const silences: SilenceSpan[] = [{ startSec: 1.0, endSec: 1.5 }];
  assert.equal(snapBoundary(1.5, silences, 1.0, "start"), 1.5);
  assert.equal(snapBoundary(1.0, silences, 1.0, "end"), 1.0);
});

// ── snapRanges ────────────────────────────────────────────────────────────

test("snapRanges: snaps both internal edges of a range toward its containing silences", () => {
  const ranges = [{ startSec: 1.0, endSec: 3.0 }];
  const silences: SilenceSpan[] = [
    { startSec: 0.8, endSec: 1.2 },
    { startSec: 2.8, endSec: 3.3 },
  ];
  const out = snapRanges(ranges, silences, 1.0);
  assert.deepEqual(out, [{ startSec: 1.2, endSec: 2.8 }]);
});

test("snapRanges: keeps ranges positive-length (reverts to original edges on conflict)", () => {
  // A single wide silence fully swallows this short range: snapping the start
  // forward and the end backward would invert it, so both edges revert.
  const ranges = [{ startSec: 1.0, endSec: 1.3 }];
  const silences: SilenceSpan[] = [{ startSec: 0.5, endSec: 2.0 }];
  const out = snapRanges(ranges, silences, 2.0);
  assert.deepEqual(out, [{ startSec: 1.0, endSec: 1.3 }]);
});

test("snapRanges: stays ordered and non-overlapping across multiple ranges", () => {
  const ranges = [
    { startSec: 0, endSec: 1.0 },
    { startSec: 1.05, endSec: 2.0 },
  ];
  const silences: SilenceSpan[] = [{ startSec: 0.9, endSec: 1.5 }];
  const out = snapRanges(ranges, silences, 1.0);
  assert.equal(out.length, 2);
  assert.ok(out[0].endSec <= out[1].startSec, "ranges must not overlap");
  assert.ok(out[0].startSec < out[0].endSec, "range 0 stays positive-length");
  assert.ok(out[1].startSec < out[1].endSec, "range 1 stays positive-length");
});

test("snapRanges: a range with no nearby silence is unchanged", () => {
  const ranges = [{ startSec: 5.0, endSec: 8.0 }];
  const out = snapRanges(ranges, [], 1.0);
  assert.deepEqual(out, ranges);
});

// ── subtractDeadAir ───────────────────────────────────────────────────────

const sec = (n: number) => Math.round(n * SAMPLE_RATE);

test("subtractDeadAir: splits a range around an interior dead-air span", () => {
  const ranges = [{ startSec: 0, endSec: 10 }];
  const deadAir = [{ startSample: sec(2), endSample: sec(3) }];
  const out = subtractDeadAir(ranges, deadAir, SAMPLE_RATE);
  assert.deepEqual(out, [
    { startSec: 0, endSec: 2 },
    { startSec: 3, endSec: 10 },
  ]);
});

test("subtractDeadAir: a span at the range's leading edge leaves only the remainder", () => {
  const ranges = [{ startSec: 0, endSec: 10 }];
  const deadAir = [{ startSample: sec(0), endSample: sec(1) }];
  const out = subtractDeadAir(ranges, deadAir, SAMPLE_RATE);
  assert.deepEqual(out, [{ startSec: 1, endSec: 10 }]);
});

test("subtractDeadAir: a span at the range's trailing edge leaves only the remainder", () => {
  const ranges = [{ startSec: 0, endSec: 10 }];
  const deadAir = [{ startSample: sec(9), endSample: sec(10) }];
  const out = subtractDeadAir(ranges, deadAir, SAMPLE_RATE);
  assert.deepEqual(out, [{ startSec: 0, endSec: 9 }]);
});

test("subtractDeadAir: a span covering the whole range drops it entirely", () => {
  const ranges = [{ startSec: 0, endSec: 10 }];
  const deadAir = [{ startSample: sec(0), endSample: sec(10) }];
  const out = subtractDeadAir(ranges, deadAir, SAMPLE_RATE);
  assert.deepEqual(out, []);
});

test("subtractDeadAir: drops slivers under 0.05s", () => {
  const ranges = [{ startSec: 0, endSec: 10 }];
  const deadAir = [{ startSample: sec(0), endSample: sec(9.98) }];
  const out = subtractDeadAir(ranges, deadAir, SAMPLE_RATE);
  assert.deepEqual(out, []);
});

test("subtractDeadAir: multiple spans split one range into several segments", () => {
  const ranges = [{ startSec: 0, endSec: 10 }];
  const deadAir = [
    { startSample: sec(1), endSample: sec(2) },
    { startSample: sec(4), endSample: sec(5) },
  ];
  const out = subtractDeadAir(ranges, deadAir, SAMPLE_RATE);
  assert.deepEqual(out, [
    { startSec: 0, endSec: 1 },
    { startSec: 2, endSec: 4 },
    { startSec: 5, endSec: 10 },
  ]);
});

test("subtractDeadAir: spans outside every range are ignored", () => {
  const ranges = [
    { startSec: 0, endSec: 5 },
    { startSec: 6, endSec: 10 },
  ];
  const deadAir = [{ startSample: sec(5.2), endSample: sec(5.8) }];
  const out = subtractDeadAir(ranges, deadAir, SAMPLE_RATE);
  assert.deepEqual(out, ranges);
});

test("subtractDeadAir: no dead-air spans leaves ranges untouched", () => {
  const ranges = [{ startSec: 0, endSec: 10 }];
  const out = subtractDeadAir(ranges, [], SAMPLE_RATE);
  assert.deepEqual(out, ranges);
});
