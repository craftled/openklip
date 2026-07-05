import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterHighlightClips,
  previewHighlightExports,
} from "../scripts/agent-make-highlights.ts";
import type { HighlightClip } from "../src/edl.ts";
import { intersectRangesWithSpan } from "../src/edl.ts";
import { resolvePlatformOptions } from "../src/export-platforms.ts";

const clips: HighlightClip[] = [
  { id: "h1", fromSec: 0, toSec: 30, title: "Hook" },
  { id: "h2", fromSec: 45, toSec: 90, title: "Demo" },
  { id: "h3", fromSec: 120, toSec: 165, title: "Close" },
];

test("make-highlights: intersectRangesWithSpan trims kept ranges to clip span", () => {
  const kept = [
    { startSec: 0, endSec: 10 },
    { startSec: 20, endSec: 50 },
    { startSec: 100, endSec: 130 },
  ];
  const clipped = intersectRangesWithSpan(kept, 45, 90);
  assert.deepEqual(clipped, [{ startSec: 45, endSec: 50 }]);
});

test("make-highlights: filterHighlightClips respects --ids", () => {
  assert.deepEqual(
    filterHighlightClips(clips, ["h2", "h3"]).map((c) => c.id),
    ["h2", "h3"]
  );
  assert.deepEqual(
    filterHighlightClips(clips).map((c) => c.id),
    ["h1", "h2", "h3"]
  );
});

test("make-highlights: previewHighlightExports lists clip ids and output paths", () => {
  const preview = previewHighlightExports("demo", clips.slice(0, 2));
  assert.equal(preview.length, 2);
  assert.equal(preview[0]?.id, "h1");
  assert.match(preview[0]?.out ?? "", /highlights\/h1\.mp4$/);
  assert.equal(preview[1]?.id, "h2");
});

test("make-highlights: shorts platform preset resolves 9:16 1920p source fps social", () => {
  const resolved = resolvePlatformOptions("shorts", {});
  assert.equal(resolved.aspect, "9:16");
  assert.equal(resolved.maxHeight, 1920);
  assert.equal(resolved.fps, undefined);
  assert.equal(resolved.compression, "social");
});
