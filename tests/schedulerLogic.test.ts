import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findPlayingRangeIndex,
  nextRangeIndex,
  playbackStartIndex,
  rangeBoundaryAudioDelaySec,
  shouldJumpToNextRange,
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
