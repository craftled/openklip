import assert from "node:assert/strict";
import { test } from "node:test";
import { compileTimeline } from "../src/compiledTimeline.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { makeProject } from "./helpers/projectFixture.ts";

const sec = (n: number) => n * SAMPLE_RATE;

test("compileTimeline derives ranges, runtime, and caption groups", () => {
  const tl = compileTimeline(makeProject());
  assert.equal(tl.ranges.length, 1);
  assert.ok(tl.outputDurationSec > 1.9 && tl.outputDurationSec < 2.3);
  assert.equal(tl.overlays.length, 0);
  assert.equal(tl.captionGroups.length, 1);
  assert.equal(tl.captionGroups[0].words.length, 2);
});

test("compileTimeline lists overlays in paint order (zoom, broll, title)", () => {
  const project = makeProject({
    zooms: [
      { id: "z1", startSample: 0, endSample: sec(1), scale: 1.2, rampSec: 0.4 },
    ],
    broll: [
      {
        id: "b1",
        assetId: "broll-a",
        startSample: 0,
        endSample: sec(1),
        srcInSample: 0,
      },
    ],
    titles: [
      {
        id: "t1",
        text: "Hi",
        startSample: 0,
        endSample: sec(1),
        position: "lower",
      },
    ],
  });
  const tl = compileTimeline(project);
  assert.deepEqual(
    tl.overlays.map((o) => o.kind),
    ["zoom", "broll", "title"]
  );
  assert.deepEqual(
    tl.overlays.map((o) => o.z),
    [0, 1, 2]
  );
  for (const o of tl.overlays) {
    assert.ok(o.outEndSec > o.outStartSec);
  }
});

test("compileTimeline omits caption groups when captions are disabled", () => {
  const tl = compileTimeline(
    makeProject({ captions: { enabled: false, maxWords: 6 } })
  );
  assert.equal(tl.captionGroups.length, 0);
});

test("compileTimeline never mutates the input project", () => {
  const project = makeProject();
  const before = structuredClone(project);
  compileTimeline(project);
  assert.deepEqual(project, before);
});
