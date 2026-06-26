import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAss, type CaptionGroup } from "../src/captions.ts";

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
      placement: (group) => (group.startSec >= 5 ? "raised" : "bottom"),
    }
  );

  assert.match(ass, /Style: CapBottom,Arial,\d+,.+,76,1/);
  assert.match(ass, /Style: CapRaised,Arial,\d+,.+,259,1/);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:01\.00,CapBottom/);
  assert.match(ass, /Dialogue: 0,0:00:05\.00,0:00:06\.00,CapRaised/);
});
