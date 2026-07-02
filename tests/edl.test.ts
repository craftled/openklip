import assert from "node:assert/strict";
import { test } from "node:test";
import type { SilenceSpan } from "../src/audio-analysis-core.ts";
import {
  AssemblySelectionSchema,
  AudioSchema,
  BrollSchema,
  effectiveRanges,
  GraphicSchema,
  MusicPlacementSchema,
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
    deadAir: [],
  });
});

// ── MILESTONE 4.1: music placement schema ────────────────────────────────────

test("ProjectSchema defaults music to [] (backward-compat parse)", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "no-music",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE,
    words: [],
  });
  assert.deepEqual(project.music, []);
});

test("MusicPlacementSchema fills defaults (srcIn 0, gain 1, fades 0, trim)", () => {
  const m = MusicPlacementSchema.parse({
    id: "m1",
    assetId: "bed",
    startSample: 0,
    endSample: 2 * SAMPLE_RATE,
  });
  assert.equal(m.srcInSample, 0);
  assert.equal(m.gain, 1);
  assert.equal(m.fadeInSec, 0);
  assert.equal(m.fadeOutSec, 0);
  assert.equal(m.mode, "trim");
});

test("ProjectSchema round-trips a fully specified music placement", () => {
  const placement = {
    id: "m2",
    assetId: "bed",
    startSample: SAMPLE_RATE,
    endSample: 3 * SAMPLE_RATE,
    srcInSample: 24_000,
    gain: 0.4,
    fadeInSec: 1,
    fadeOutSec: 2,
    mode: "loop" as const,
    note: "score under the intro",
  };
  const project = ProjectSchema.parse({
    version: 1,
    slug: "with-music",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: 4 * SAMPLE_RATE,
    words: [],
    music: [placement],
  });
  assert.deepEqual(project.music, [placement]);
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

// ── MILESTONE 4.2: export audio quality (ducking, loudness, voice highpass) ──

test("ProjectSchema defaults audio off (backward-compat parse)", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "no-audio",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE,
    words: [],
  });
  assert.deepEqual(project.audio, {
    ducking: { enabled: false, amountDb: 12, attackMs: 25, releaseMs: 250 },
    loudness: { enabled: false, targetLufs: -16 },
    voiceHighpass: { enabled: false, hz: 80 },
  });
});

test("ProjectSchema round-trips fully specified audio settings", () => {
  const project = ProjectSchema.parse({
    version: 1,
    slug: "with-audio",
    source: "/tmp/source.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE,
    words: [],
    audio: {
      ducking: { enabled: true, amountDb: 18, attackMs: 10, releaseMs: 400 },
      loudness: { enabled: true, targetLufs: -14 },
      voiceHighpass: { enabled: true, hz: 100 },
    },
  });
  assert.deepEqual(project.audio, {
    ducking: { enabled: true, amountDb: 18, attackMs: 10, releaseMs: 400 },
    loudness: { enabled: true, targetLufs: -14 },
    voiceHighpass: { enabled: true, hz: 100 },
  });
});

test("AudioSchema rejects out-of-range values (Motion/CutSnap precedent: bounds live in the schema)", () => {
  assert.throws(() => AudioSchema.parse({ ducking: { amountDb: 999 } }));
  assert.throws(() => AudioSchema.parse({ loudness: { targetLufs: 5 } }));
  assert.throws(() => AudioSchema.parse({ voiceHighpass: { hz: 1 } }));
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

// ── D1: effectiveRanges (survivingRanges + dead-air subtraction + VAD snap) ──

test("effectiveRanges matches survivingRanges when cuts is empty", () => {
  const project = makeProject({ padMs: 0 });
  assert.deepEqual(effectiveRanges(project), survivingRanges(project));
});

test("effectiveRanges subtracts dead-air spans even with no silences supplied", () => {
  const project = makeProject({
    padMs: 0,
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
        endSample: 144_000,
        deleted: false,
      },
    ],
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [{ id: "d1", startSample: 60_000, endSample: 96_000 }],
    },
  });
  const ranges = effectiveRanges(project);
  assert.deepEqual(ranges, [
    { startSec: 0, endSec: 1.25 },
    { startSec: 2, endSec: 3 },
  ]);
});

test("effectiveRanges snaps boundaries onto silences within maxShiftMs when snap is enabled", () => {
  const project = makeProject({
    padMs: 0,
    words: [
      {
        id: "w0",
        text: "A",
        startSample: 0,
        endSample: 48_000,
        deleted: false,
      },
    ],
    durationSamples: 48_000,
    cuts: {
      snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
    },
  });
  // Actual acoustic silence begins 30ms before the transcript word boundary
  // (0.97s vs 1.0s), well inside the 120ms max shift, so the range end
  // pulls back onto it.
  const silences: SilenceSpan[] = [{ startSec: 0.97, endSec: 1.3 }];
  const [range] = effectiveRanges(project, silences);
  assert.equal(range.startSec, 0);
  assert.equal(range.endSec, 0.97);
  assert.ok(Math.abs(range.endSec - 1.0) * 1000 <= 120);
});

test("effectiveRanges ignores silences when snap is disabled", () => {
  const project = makeProject({
    padMs: 0,
    words: [
      {
        id: "w0",
        text: "A",
        startSample: 0,
        endSample: 48_000,
        deleted: false,
      },
    ],
    durationSamples: 48_000,
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
    },
  });
  const silences: SilenceSpan[] = [{ startSec: 0.6, endSec: 0.97 }];
  const ranges = effectiveRanges(project, silences);
  assert.deepEqual(ranges, survivingRanges(project));
});

test("effectiveRanges ignores silences when mode is off even if enabled is true", () => {
  const project = makeProject({
    padMs: 0,
    words: [
      {
        id: "w0",
        text: "A",
        startSample: 0,
        endSample: 48_000,
        deleted: false,
      },
    ],
    durationSamples: 48_000,
    cuts: {
      snap: { enabled: true, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
    },
  });
  const silences: SilenceSpan[] = [{ startSec: 0.6, endSec: 0.97 }];
  const ranges = effectiveRanges(project, silences);
  assert.deepEqual(ranges, survivingRanges(project));
});

test("effectiveRanges applies dead-air subtraction before snap (documented ordering)", () => {
  const project = makeProject({
    padMs: 0,
    words: [
      {
        id: "w0",
        text: "A",
        startSample: 0,
        endSample: 96_000,
        deleted: false,
      },
    ],
    durationSamples: 96_000,
    cuts: {
      snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [{ id: "d1", startSample: 48_000, endSample: 60_000 }],
    },
  });
  // After dead-air subtraction the range splits into [0,1] and [1.25,2]; the
  // silence just outside the second segment's start should still snap it.
  const silences: SilenceSpan[] = [{ startSec: 1.2, endSec: 1.26 }];
  const ranges = effectiveRanges(project, silences);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].startSec, 0);
  assert.equal(ranges[0].endSec, 1);
  assert.equal(ranges[1].startSec, 1.26);
  assert.equal(ranges[1].endSec, 2);
});

// ── D4: WordSchema.originalText (preserves pre-correction transcript text) ──

test("WordSchema parses without originalText and round-trips one", () => {
  const plain = WordSchema.parse({
    id: "w0",
    text: "Hello",
    startSample: 0,
    endSample: 48_000,
  });
  assert.equal(plain.originalText, undefined);

  const corrected = WordSchema.parse({
    id: "w0",
    text: "Hello there",
    startSample: 0,
    endSample: 48_000,
    originalText: "Hullo their",
  });
  assert.equal(corrected.originalText, "Hullo their");
  assert.equal(corrected.text, "Hello there");
});
