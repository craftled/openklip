import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAss,
  type CaptionGroup,
  captionPlacementForGroup,
  captionPlacementForSpan,
  keptWordsInOutputTime,
} from "../src/captions.ts";

const GROUPS: CaptionGroup[] = [
  {
    startSec: 0,
    endSec: 1,
    words: [{ text: "Hello", startSec: 0, endSec: 1 }],
  },
];

test("buildAss uses the normal lower caption margin by default", () => {
  const ass = buildAss(GROUPS, { width: 1920, height: 1080 });

  assert.match(ass, /Style: Cap,Arial,\d+,.+,76,1/);
});

test("buildAss can raise captions to avoid lower-title collisions", () => {
  const ass = buildAss(GROUPS, {
    width: 1920,
    height: 1080,
    placement: "raised",
  });

  assert.match(ass, /Style: Cap,Arial,\d+,.+,259,1/);
});

test("buildAss carries rounded centiseconds into the next second", () => {
  const ass = buildAss(
    [
      {
        startSec: 1.999,
        endSec: 59.999,
        words: [{ text: "Carry", startSec: 1.999, endSec: 59.999 }],
      },
    ],
    { width: 1920, height: 1080 }
  );

  assert.match(ass, /Dialogue: 0,0:00:02\.00,0:01:00\.00,Cap/);
});

test("buildAss can choose bottom or raised caption placement per group", () => {
  const ass = buildAss(
    [
      {
        startSec: 0,
        endSec: 1,
        words: [{ text: "Bottom", startSec: 0, endSec: 1 }],
      },
      {
        startSec: 5,
        endSec: 6,
        words: [{ text: "Raised", startSec: 5, endSec: 6 }],
      },
    ],
    {
      width: 1920,
      height: 1080,
      placement: (_group, span) => (span.startSec >= 5 ? "raised" : "bottom"),
    }
  );

  assert.match(ass, /Style: CapBottom,Arial,\d+,.+,76,1/);
  assert.match(ass, /Style: CapRaised,Arial,\d+,.+,259,1/);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:01\.00,CapBottom/);
  assert.match(ass, /Dialogue: 0,0:00:05\.00,0:00:06\.00,CapRaised/);
});

test("captionPlacementForSpan hides captions during hero titles", () => {
  const titles = [{ startSec: 2, endSec: 4, position: "hero" as const }];

  assert.equal(captionPlacementForSpan(1, 1.5, titles), "bottom");
  assert.equal(captionPlacementForSpan(2.5, 3, titles), "hidden");
});

test("captionPlacementForSpan raises captions for lower-third titles", () => {
  const titles = [{ startSec: 2, endSec: 4, position: "lower" as const }];

  assert.equal(captionPlacementForSpan(2.5, 3, titles), "raised");
});

test("captionPlacementForSpan keeps captions at bottom for centered titles", () => {
  const titles = [{ startSec: 2, endSec: 4, position: "center" as const }];

  assert.equal(captionPlacementForSpan(2.5, 3, titles), "bottom");
});

test("captionPlacementForSpan prefers hiding over raising when hero overlaps", () => {
  const titles = [
    { startSec: 2, endSec: 4, position: "lower" as const },
    { startSec: 2, endSec: 4, position: "hero" as const },
  ];

  assert.equal(captionPlacementForSpan(2.5, 3, titles), "hidden");
});

test("captionPlacementForGroup mirrors span placement for the full group", () => {
  const group: CaptionGroup = {
    startSec: 2,
    endSec: 4,
    words: [{ text: "Hello", startSec: 2, endSec: 4 }],
  };
  const titles = [{ startSec: 2, endSec: 4, position: "hero" as const }];

  assert.equal(captionPlacementForGroup(group, titles), "hidden");
});

test("buildAss omits dialogue lines hidden by hero title overlap", () => {
  const ass = buildAss(
    [
      {
        startSec: 0,
        endSec: 6,
        words: [
          { text: "Before", startSec: 0, endSec: 1 },
          { text: "During", startSec: 2, endSec: 3 },
          { text: "After", startSec: 5, endSec: 6 },
        ],
      },
    ],
    {
      width: 1920,
      height: 1080,
      placement: (_group, span) =>
        captionPlacementForSpan(span.startSec, span.endSec, [
          { startSec: 2, endSec: 4, position: "hero" },
        ]),
    }
  );

  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:02\.00,CapBottom/);
  assert.doesNotMatch(ass, /Dialogue: 0,0:00:02\.00/);
  assert.match(ass, /Dialogue: 0,0:00:05\.00,0:00:06\.00,CapBottom/);
});

// ── keptWordsInOutputTime (R1: shared by exporter.ts + compiledTimeline.ts) ─

const kwSec = (n: number) => Math.round(n * 48_000);

function kwWord(id: string, text: string, startSec: number, endSec: number) {
  return {
    id,
    text,
    startSample: kwSec(startSec),
    endSample: kwSec(endSec),
    deleted: false,
  };
}

test("keptWordsInOutputTime: a range start 100ms inside a word still emits the word, clamped to the range", () => {
  // Snap moved the range start FORWARD past word 1's soft onset (or a
  // dead-air span covers its start): most of the word's audio still plays,
  // so the caption must too.
  const project = {
    sampleRate: 48_000,
    words: [kwWord("w0", "hello", 0, 1), kwWord("w1", "world", 1, 2)],
  };
  const ranges = [{ startSec: 0.1, endSec: 2 }];
  const out = keptWordsInOutputTime(project, ranges);
  assert.equal(out.length, 2);
  // w0 clamps to the range start: output time 0 through 0.9.
  assert.equal(out[0].text, "hello");
  assert.ok(Math.abs(out[0].startSec - 0) < 1e-9);
  assert.ok(Math.abs(out[0].endSec - 0.9) < 1e-9);
  // w1 is untouched: output 0.9 through 1.9.
  assert.ok(Math.abs(out[1].startSec - 0.9) < 1e-9);
  assert.ok(Math.abs(out[1].endSec - 1.9) < 1e-9);
});

test("keptWordsInOutputTime: a word end is clamped to the range end", () => {
  const project = {
    sampleRate: 48_000,
    words: [kwWord("w0", "hello", 0, 1)],
  };
  const ranges = [{ startSec: 0, endSec: 0.8 }];
  const out = keptWordsInOutputTime(project, ranges);
  assert.equal(out.length, 1);
  assert.ok(Math.abs(out[0].endSec - 0.8) < 1e-9);
});

test("keptWordsInOutputTime: a kept word with NO range overlap is not emitted", () => {
  // The whole word span was subtracted (dead air covering it entirely).
  const project = {
    sampleRate: 48_000,
    words: [kwWord("w0", "gone", 1, 2), kwWord("w1", "kept", 3, 4)],
  };
  const ranges = [
    { startSec: 0, endSec: 0.9 },
    { startSec: 2.5, endSec: 4 },
  ];
  const out = keptWordsInOutputTime(project, ranges);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "kept");
});

test("keptWordsInOutputTime: deleted words never emit", () => {
  const project = {
    sampleRate: 48_000,
    words: [{ ...kwWord("w0", "cut", 0, 1), deleted: true }],
  };
  const out = keptWordsInOutputTime(project, [{ startSec: 0, endSec: 1 }]);
  assert.equal(out.length, 0);
});
