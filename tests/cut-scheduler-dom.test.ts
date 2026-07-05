import assert from "node:assert/strict";
import { test } from "node:test";
import { outputPositionSec } from "../src/schedulerLogic.ts";
import { CutScheduler } from "../web/scheduler.ts";

(
  globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }
).requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
};
(
  globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }
).cancelAnimationFrame = () => undefined;

function makeVideo(initialSec = 0): HTMLVideoElement {
  let currentTime = initialSec;
  return {
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
    },
    duration: 120,
    play: async () => true,
    pause: () => undefined,
  } as HTMLVideoElement;
}

test("CutScheduler.dispose closes its AudioContext", () => {
  const video = makeVideo();
  const sched = new CutScheduler(video, () => [{ startSec: 0, endSec: 5 }]);
  let closed = false;
  const fakeCtx = {
    close: () => {
      closed = true;
    },
    state: "running",
  } as AudioContext;
  (sched as unknown as { ctx?: AudioContext }).ctx = fakeCtx;
  sched.dispose();
  assert.equal(closed, true);
  assert.equal((sched as unknown as { ctx?: AudioContext }).ctx, undefined);
});

test("CutScheduler seek reports source time for cinema overlay sync", () => {
  const ranges = [
    { startSec: 0, endSec: 2 },
    { startSec: 10, endSec: 12 },
  ];
  const video = makeVideo();
  const ticks: number[] = [];
  const sched = new CutScheduler(video, () => ranges);
  sched.onTick = (sourceSec) => {
    ticks.push(sourceSec);
  };
  sched.seek(11);
  assert.equal(video.currentTime, 11);
  assert.equal(outputPositionSec(ranges, 11), 3);
  sched.dispose();
  assert.deepEqual(ticks, [11]);
});

test("CutScheduler onCutBoundary fires on range jump, not manual seek", () => {
  const ranges = [
    { startSec: 0, endSec: 1 },
    { startSec: 5, endSec: 6 },
  ];
  const video = makeVideo(0.5);
  const boundaries: string[] = [];
  const sched = new CutScheduler(
    video,
    () => ranges,
    () => ({ type: "crossfade", durationMs: 500 })
  );
  sched.onCutBoundary = (transition) => {
    boundaries.push(transition.type);
  };
  sched.seek(0.5);
  assert.equal(boundaries.length, 0);
  (
    sched as unknown as {
      jumpToRange: (range: { startSec: number; endSec: number }) => void;
    }
  ).jumpToRange(ranges[1]);
  assert.deepEqual(boundaries, ["crossfade"]);
  sched.dispose();
});
