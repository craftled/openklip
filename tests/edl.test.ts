import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GraphicSchema,
  ProjectSchema,
  SAMPLE_RATE,
  samplesToSec,
  sourceToOutputSec,
  survivingRanges,
  TitleSchema,
  totalDurationSec,
} from "../src/edl.ts";
import { makeProject } from "./helpers/projectFixture.ts";

test("ProjectSchema enforces the canonical 48 kHz sample rate", () => {
  assert.throws(
    () =>
      ProjectSchema.parse({
        version: 1,
        slug: "bad-rate",
        source: "/tmp/source.mp4",
        proxy: "proxy.mp4",
        sampleRate: 24_000,
        fps: 30,
        width: 1920,
        height: 1080,
        durationSamples: SAMPLE_RATE,
        words: [],
      }),
    /48000/
  );
});

test("TitleSchema accepts hero position", () => {
  const title = TitleSchema.parse({
    id: "t1",
    text: "$90,000\nSubtitle",
    startSample: 0,
    endSample: 48_000,
    position: "hero",
  });
  assert.equal(title.position, "hero");
});

test("GraphicSchema defaults params to {} and track to title", () => {
  const g = GraphicSchema.parse({
    id: "g1",
    template: "lower-third",
    startSample: 0,
    endSample: 48_000,
  });
  assert.deepEqual(g.params, {});
  assert.equal(g.track, "title");
});

test("GraphicSchema accepts scalar params and an explicit track", () => {
  const g = GraphicSchema.parse({
    id: "g2",
    template: "kinetic-caption",
    params: { text: "BIG IDEA", count: 3, bold: true },
    startSample: 0,
    endSample: 96_000,
    track: "broll",
  });
  assert.equal(g.params.text, "BIG IDEA");
  assert.equal(g.params.count, 3);
  assert.equal(g.params.bold, true);
  assert.equal(g.track, "broll");
});

test("GraphicSchema rejects an invalid track", () => {
  assert.throws(() =>
    GraphicSchema.parse({
      id: "g3",
      template: "x",
      startSample: 0,
      endSample: 1,
      track: "captions",
    })
  );
});

test("ProjectSchema defaults graphics to [] (backward-compat parse)", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "no-graphics",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE,
    words: [],
  });
  assert.deepEqual(project.graphics, []);
});

test("ProjectSchema parses a project that already has graphics", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "with-graphics",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE,
    words: [],
    graphics: [
      {
        id: "g1",
        template: "lower-third",
        params: { title: "Hello" },
        startSample: 0,
        endSample: 24_000,
      },
    ],
  });
  assert.equal(project.graphics.length, 1);
  assert.equal(project.graphics[0].template, "lower-third");
  assert.equal(project.graphics[0].track, "title");
});

test("samplesToSec rounds to the canonical grid", () => {
  assert.equal(samplesToSec(24_000), 0.5);
  assert.equal(samplesToSec(48_001), 48_001 / SAMPLE_RATE);
});

test("survivingRanges merges kept words and applies pad", () => {
  const project = makeProject({
    words: [
      {
        id: "w0",
        text: "A",
        startSample: 0,
        endSample: 48_000,
        deleted: false,
      },
      {
        id: "w1",
        text: "B",
        startSample: 48_000,
        endSample: 96_000,
        deleted: true,
      },
      {
        id: "w2",
        text: "C",
        startSample: 96_000,
        endSample: 144_000,
        deleted: false,
      },
    ],
    padMs: 0,
  });
  const ranges = survivingRanges(project);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].startSec, 0);
  assert.equal(ranges[0].endSec, 1);
  assert.equal(ranges[1].startSec, 2);
  assert.equal(ranges[1].endSec, 3);
});

test("totalDurationSec sums surviving ranges", () => {
  assert.equal(
    totalDurationSec([
      { startSec: 0, endSec: 2 },
      { startSec: 5, endSec: 6 },
    ]),
    3
  );
});

test("sourceToOutputSec maps source time into cut timeline", () => {
  const ranges = [
    { startSec: 0, endSec: 2 },
    { startSec: 5, endSec: 7 },
  ];
  assert.equal(sourceToOutputSec(1, ranges), 1);
  assert.equal(sourceToOutputSec(3, ranges), 2);
  assert.equal(sourceToOutputSec(6, ranges), 3);
  assert.equal(sourceToOutputSec(99, ranges), 4);
});
