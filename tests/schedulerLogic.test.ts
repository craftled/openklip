import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cutTransitionSweepPlan,
  findPlayingRangeIndex,
  nextRangeIndex,
  outputPositionSec,
  playbackStartIndex,
  rangeBoundaryAudioDelaySec,
  shouldJumpToNextRange,
  sourceSecForOutputPosition,
} from "../src/schedulerLogic.ts";

const ranges = [
  { startSec: 0, endSec: 2 },
  { startSec: 5, endSec: 7 },
];

test("findPlayingRangeIndex locates the active range", () => {
  assert.equal(findPlayingRangeIndex(ranges, 1), 0);
  assert.equal(findPlayingRangeIndex(ranges, 6), 1);
  assert.equal(findPlayingRangeIndex(ranges, 3), -1);
});

test("shouldJumpToNextRange triggers near range end", () => {
  assert.equal(shouldJumpToNextRange(1.99, 2), true);
  assert.equal(shouldJumpToNextRange(1.5, 2), false);
});

test("nextRangeIndex returns null at the final range", () => {
  assert.equal(nextRangeIndex(0, ranges.length), 1);
  assert.equal(nextRangeIndex(1, ranges.length), null);
});

test("playbackStartIndex resets to first range outside kept spans", () => {
  assert.equal(playbackStartIndex(ranges, 6), 1);
  assert.equal(playbackStartIndex(ranges, 3), 0);
});

test("rangeBoundaryAudioDelaySec schedules boundary mutes at media rate", () => {
  assert.equal(
    Math.round(rangeBoundaryAudioDelaySec(13.2, 13.46, 1) * 1000),
    260
  );
  assert.equal(
    Math.round(rangeBoundaryAudioDelaySec(13.2, 13.46, 2) * 1000),
    130
  );
  assert.equal(rangeBoundaryAudioDelaySec(13.47, 13.46, 1), 0);
});

test("cutTransitionSweepPlan returns null for type none regardless of reducedMotion", () => {
  assert.equal(
    cutTransitionSweepPlan({ type: "none", durationMs: 500 }, false),
    null
  );
  assert.equal(
    cutTransitionSweepPlan({ type: "none", durationMs: 500 }, true),
    null
  );
});

test("cutTransitionSweepPlan builds a crossfade plan when motion is allowed", () => {
  const plan = cutTransitionSweepPlan(
    { type: "crossfade", durationMs: 800 },
    false
  );
  assert.ok(plan);
  assert.equal(plan.type, "crossfade");
  assert.equal(plan.sweepMs, 800);
  assert.ok(plan.outroMs > 0);
  assert.ok(plan.outroMs <= 800);
});

test("cutTransitionSweepPlan returns null when reduced motion is requested", () => {
  assert.equal(
    cutTransitionSweepPlan({ type: "crossfade", durationMs: 800 }, true),
    null
  );
  assert.equal(
    cutTransitionSweepPlan({ type: "dip", durationMs: 500 }, true),
    null
  );
});

test("cutTransitionSweepPlan honors the minimum and maximum duration bounds", () => {
  const minPlan = cutTransitionSweepPlan(
    { type: "dip", durationMs: 50 },
    false
  );
  assert.ok(minPlan);
  assert.equal(minPlan.type, "dip");
  assert.equal(minPlan.sweepMs, 50);
  assert.ok(minPlan.outroMs > 0);

  const maxPlan = cutTransitionSweepPlan(
    { type: "dip", durationMs: 2000 },
    false
  );
  assert.ok(maxPlan);
  assert.equal(maxPlan.sweepMs, 2000);
  assert.ok(maxPlan.outroMs > 0);
});

test("outputPositionSec collapses deleted gaps into cut-space distance", () => {
  assert.equal(outputPositionSec(ranges, 0), 0);
  assert.equal(outputPositionSec(ranges, 1), 1);
  assert.equal(outputPositionSec(ranges, 2), 2);
  // A source second inside the deleted gap (2-5) reports the cut-space
  // position of the end of the previous kept range, since nothing between
  // ranges is ever actually played.
  assert.equal(outputPositionSec(ranges, 3.5), 2);
  assert.equal(outputPositionSec(ranges, 6), 3);
  assert.equal(outputPositionSec(ranges, 7), 4);
  // Past the final range: clamps to total kept duration.
  assert.equal(outputPositionSec(ranges, 9), 4);
});

test("outputPositionSec returns 0 for an empty range list", () => {
  assert.equal(outputPositionSec([], 5), 0);
});

test("sourceSecForOutputPosition is the inverse of outputPositionSec inside kept spans", () => {
  assert.equal(sourceSecForOutputPosition(ranges, 0), 0);
  assert.equal(sourceSecForOutputPosition(ranges, 1), 1);
  assert.equal(sourceSecForOutputPosition(ranges, 2), 2);
  assert.equal(sourceSecForOutputPosition(ranges, 3), 6);
  assert.equal(sourceSecForOutputPosition(ranges, 4), 7);
});

test("sourceSecForOutputPosition clamps past the total kept duration to the last range end", () => {
  assert.equal(sourceSecForOutputPosition(ranges, 10), 7);
});

test("sourceSecForOutputPosition returns 0 for an empty range list", () => {
  assert.equal(sourceSecForOutputPosition([], 5), 0);
});
