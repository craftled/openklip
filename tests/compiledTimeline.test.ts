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

test("compileTimeline exposes Composition IR clips, resources, and layers for all edit kinds", () => {
  const project = makeProject({
    assets: [
      {
        id: "broll-a",
        kind: "broll",
        name: "b-roll.mp4",
        src: "/tmp/b-roll.mp4",
        proxy: "working/assets/broll-a.mp4",
        durationSamples: sec(30),
      },
      {
        id: "music-a",
        kind: "music",
        name: "bed.mp3",
        src: "/tmp/bed.mp3",
        proxy: "working/assets/music-a.aac",
        durationSamples: sec(30),
      },
    ],
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
    music: [
      {
        id: "m1",
        assetId: "music-a",
        startSample: 0,
        endSample: sec(2),
        srcInSample: 0,
        gain: 0.5,
        fadeInSec: 0,
        fadeOutSec: 0,
        mode: "loop",
      },
    ],
    graphics: [
      {
        id: "g1",
        template: "motion-typewriter",
        params: { text: "Go" },
        startSample: 0,
        endSample: sec(1),
        track: "title",
      },
      {
        id: "jg1",
        type: "json-render",
        template: "product-announcement",
        catalog: "product-announcement",
        spec: {
          root: "scene",
          elements: {
            scene: {
              type: "AnnouncementScene",
              props: {
                accent: "#00aaff",
                product: "OpenKlip",
                claim: "Fast edits",
                mood: "technical",
              },
              children: ["hero"],
              visible: true,
            },
            hero: {
              type: "HeroStatement",
              props: { eyebrow: "New", headline: "Fast edits" },
              children: [],
              visible: true,
            },
          },
        },
        params: {},
        startSample: 0,
        endSample: sec(1),
        track: "title",
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
  assert.equal(tl.composition.sourceOfTruth, "project.json");
  assert.deepEqual(
    tl.composition.clips.map((clip) => clip.kind),
    ["caption", "zoom", "broll", "title", "graphic", "json-render", "music"]
  );
  assert.deepEqual(
    tl.composition.layers.map((layer) => layer.kind),
    ["caption", "zoom", "broll", "title", "music"]
  );
  assert.deepEqual(
    tl.composition.resources.map((resource) => resource.id),
    ["asset:broll-a", "asset:music-a", "graphic:g1", "json-render:jg1"]
  );
  assert.deepEqual(
    tl.composition.clips.map((clip) => clip.output.startSec),
    [0, 0, 0, 0, 0, 0, 0]
  );
  assert.deepEqual(
    tl.composition.clips
      .filter((clip) => clip.layer === "title")
      .map((clip) => clip.z),
    [3, 4, 5]
  );
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

test("compileTimeline reflects dead-air subtraction in ranges and duration", () => {
  const project = makeProject({
    padMs: 0,
    words: [
      {
        id: "w0",
        text: "A",
        startSample: 0,
        endSample: sec(2),
        deleted: false,
      },
    ],
    durationSamples: sec(2),
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [{ id: "d1", startSample: sec(0.5), endSample: sec(1) }],
    },
  });
  const tl = compileTimeline(project);
  assert.equal(tl.ranges.length, 2);
  assert.ok(tl.outputDurationSec < 2);
});

// R1: a dead-air span covering a kept word's START must not drop its caption
// (the old start-inside-range match did); the word emits clamped to the
// post-subtraction range instead.
test("compileTimeline keeps a caption whose word start is covered by dead air (clamped, not dropped)", () => {
  const project = makeProject({
    padMs: 0,
    words: [
      {
        id: "w0",
        text: "hello",
        startSample: 0,
        endSample: sec(1),
        deleted: false,
      },
      {
        id: "w1",
        text: "world",
        startSample: sec(1),
        endSample: sec(2),
        deleted: false,
      },
    ],
    durationSamples: sec(2),
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      // Covers w0's first 100ms: the range start now sits 100ms inside w0.
      deadAir: [{ id: "d1", startSample: 0, endSample: sec(0.1) }],
    },
  });
  const tl = compileTimeline(project);
  assert.deepEqual(tl.ranges, [{ startSec: 0.1, endSec: 2 }]);
  const words = tl.captionGroups.flatMap((g) => g.words);
  assert.deepEqual(
    words.map((w) => w.text),
    ["hello", "world"]
  );
  // w0 clamps to the range start (output 0) and keeps its surviving tail.
  assert.ok(Math.abs(words[0].startSec - 0) < 1e-9);
  assert.ok(Math.abs(words[0].endSec - 0.9) < 1e-9);
});

test("compileTimeline threads optional silences into the snap pass", () => {
  const project = makeProject({
    padMs: 0,
    words: [
      {
        id: "w0",
        text: "A",
        startSample: 0,
        endSample: sec(1),
        deleted: false,
      },
    ],
    durationSamples: sec(1),
    cuts: {
      snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
    },
  });
  const withoutSilences = compileTimeline(project);
  const withSilences = compileTimeline(project, [
    { startSec: 0.9, endSec: 1.2 },
  ]);
  assert.equal(withoutSilences.ranges[0].endSec, 1);
  assert.equal(withSilences.ranges[0].endSec, 0.9);
});
