import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAss,
  type CaptionGroup,
  captionPlacementForGroup,
  captionPlacementForSpan,
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
