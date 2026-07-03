import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSafeAreaInsets,
  SAFE_AREA_PLATFORMS,
  safeAreaGuideLabel,
} from "../src/safe-areas.ts";

const ACTIVE_PLATFORMS = [
  "tiktok",
  "reels",
  "youtube-shorts",
  "generic",
] as const;

test("SAFE_AREA_PLATFORMS includes off and the four guide presets", () => {
  assert.deepEqual(SAFE_AREA_PLATFORMS, [
    "off",
    "tiktok",
    "reels",
    "youtube-shorts",
    "generic",
  ]);
});

for (const platform of ACTIVE_PLATFORMS) {
  test(`getSafeAreaInsets(${platform}) returns normalized edge fractions`, () => {
    const insets = getSafeAreaInsets(platform);
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      assert.ok(
        insets[edge] >= 0 && insets[edge] <= 1,
        `${platform}.${edge}=${insets[edge]} out of range`
      );
    }
    assert.ok(
      insets.top + insets.bottom < 1,
      `${platform}: top+bottom should leave visible area`
    );
    assert.ok(
      insets.left + insets.right < 1,
      `${platform}: left+right should leave visible area`
    );
  });
}

test("tiktok reserves a larger bottom inset for captions", () => {
  const tiktok = getSafeAreaInsets("tiktok");
  const generic = getSafeAreaInsets("generic");
  assert.ok(tiktok.bottom >= generic.bottom);
  assert.ok(tiktok.bottom >= 0.18);
});

test("safeAreaGuideLabel returns a human label for each platform", () => {
  assert.equal(safeAreaGuideLabel("off"), "Off");
  assert.match(safeAreaGuideLabel("tiktok"), /TikTok/i);
  assert.match(safeAreaGuideLabel("reels"), /Reels/i);
  assert.match(safeAreaGuideLabel("youtube-shorts"), /Shorts/i);
  assert.match(safeAreaGuideLabel("generic"), /Generic/i);
});
