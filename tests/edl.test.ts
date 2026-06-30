import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AssemblySelectionSchema,
  BrollSchema,
  GraphicSchema,
  PhraseAnchorSchema,
  ProjectSchema,
  SAMPLE_RATE,
  StillSchema,
  samplesToSec,
  sourceToOutputSec,
  survivingRanges,
  TakeSchema,
  TitleSchema,
  totalDurationSec,
  WordSchema,
  ZoomSchema,
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

test("ProjectSchema defaults cut snapping off (backward-compat parse)", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "no-cuts",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE,
    words: [],
  });
  assert.deepEqual(project.cuts, {
    snap: {
      enabled: false,
      mode: "off",
      maxShiftMs: 120,
      crossfadeMs: 24,
    },
  });
});

test("ProjectSchema round-trips VAD cut snap settings", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "with-cut-snap",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE,
    words: [],
    cuts: {
      snap: {
        enabled: true,
        mode: "vad",
        maxShiftMs: 160,
        crossfadeMs: 32,
      },
    },
  });
  assert.equal(project.cuts.snap.enabled, true);
  assert.equal(project.cuts.snap.mode, "vad");
  assert.equal(project.cuts.snap.maxShiftMs, 160);
  assert.equal(project.cuts.snap.crossfadeMs, 32);
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

// ── Foundation: backward-compatible schema deltas (F1 note, F2 anchor, F3 takes) ──

test("WordSchema parses without note and round-trips a note", () => {
  const plain = WordSchema.parse({
    id: "w0",
    text: "Hello",
    startSample: 0,
    endSample: 48_000,
  });
  assert.equal(plain.note, undefined);

  const noted = WordSchema.parse({
    id: "w0",
    text: "Hello",
    startSample: 0,
    endSample: 48_000,
    note: "filler",
  });
  assert.equal(noted.note, "filler");
});

test("overlay schemas round-trip an optional note", () => {
  const broll = BrollSchema.parse({
    id: "b1",
    assetId: "broll-1",
    startSample: 0,
    endSample: 48_000,
    note: "establish setting",
  });
  assert.equal(broll.note, "establish setting");

  const still = StillSchema.parse({
    id: "s1",
    assetId: "still-1",
    startSample: 0,
    endSample: 48_000,
    note: "context shot",
  });
  assert.equal(still.note, "context shot");

  const title = TitleSchema.parse({
    id: "t1",
    text: "Hello",
    startSample: 0,
    endSample: 48_000,
    note: "title why",
  });
  assert.equal(title.note, "title why");

  const zoom = ZoomSchema.parse({
    id: "z1",
    startSample: 0,
    endSample: 48_000,
    note: "punch in",
  });
  assert.equal(zoom.note, "punch in");

  const graphic = GraphicSchema.parse({
    id: "g1",
    template: "lower-third",
    startSample: 0,
    endSample: 48_000,
    note: "graphic why",
  });
  assert.equal(graphic.note, "graphic why");
});

test("overlay schemas parse unchanged without a note (key omitted)", () => {
  const broll = BrollSchema.parse({
    id: "b1",
    assetId: "broll-1",
    startSample: 0,
    endSample: 48_000,
  });
  assert.equal(broll.note, undefined);
  assert.equal("note" in JSON.parse(JSON.stringify(broll)), false);
});

test("PhraseAnchorSchema defaults wordIds and stale", () => {
  const anchor = PhraseAnchorSchema.parse({ phrase: "big reveal" });
  assert.deepEqual(anchor.wordIds, []);
  assert.equal(anchor.stale, false);
});

test("PhraseAnchorSchema rejects an empty phrase", () => {
  assert.throws(() => PhraseAnchorSchema.parse({ phrase: "" }));
});

test("overlay schemas round-trip an optional anchor", () => {
  const title = TitleSchema.parse({
    id: "t1",
    text: "Hello",
    startSample: 0,
    endSample: 48_000,
    anchor: { phrase: "big reveal", wordIds: ["w1", "w2"], stale: false },
  });
  assert.equal(title.anchor?.phrase, "big reveal");
  assert.deepEqual(title.anchor?.wordIds, ["w1", "w2"]);
});

test("TakeSchema parses a take fixture", () => {
  const take = TakeSchema.parse({
    id: "t1",
    source: "/tmp/take-1.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE * 6,
    words: [
      { id: "w0", text: "Hello", startSample: 0, endSample: SAMPLE_RATE },
    ],
    ingestedAt: "2026-06-29T00:00:00.000Z",
  });
  assert.equal(take.id, "t1");
  assert.equal(take.label, "");
  assert.equal(take.words.length, 1);
});

test("AssemblySelectionSchema defaults padMs to 50", () => {
  const selection = AssemblySelectionSchema.parse({
    segments: [{ takeId: "t1", startWordId: "w0", endWordId: "w1" }],
  });
  assert.equal(selection.padMs, 50);
  assert.equal(selection.segments[0].note, undefined);
});

test("AssemblySelectionSchema rejects an empty segments array", () => {
  assert.throws(() => AssemblySelectionSchema.parse({ segments: [] }));
});

test("ProjectSchema defaults assembly to undefined (backward-compat parse)", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "no-assembly",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE,
    words: [],
  });
  assert.equal(project.assembly, undefined);
});

test("ProjectSchema round-trips an assembly provenance block", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "with-assembly",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE,
    words: [],
    assembly: {
      assembledAt: "2026-06-29T00:00:00.000Z",
      segments: [
        {
          takeId: "t1",
          startWordId: "w0",
          endWordId: "w1",
          srcStartSample: 0,
          srcEndSample: SAMPLE_RATE,
          outStartSample: 0,
          outEndSample: SAMPLE_RATE,
        },
      ],
    },
  });
  assert.equal(project.assembly?.segments[0].takeId, "t1");
});
