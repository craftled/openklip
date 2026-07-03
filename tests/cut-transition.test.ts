import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CUT_TRANSITION_TYPES,
  CutTransitionSchema,
  ProjectSchema,
  SAMPLE_RATE,
} from "../src/edl.ts";
import {
  buildSegmentVideoCrossfadeFilter,
  buildSegmentVideoDipFilter,
  buildSegmentVideoTransitionFilter,
  shouldApplyCutTransition,
} from "../src/export-segments.ts";
import { runAction } from "../src/registry.ts";
import { makeProject } from "./helpers/projectFixture.ts";

const sec = (n: number) => Math.round(n * SAMPLE_RATE);

// ── Schema ───────────────────────────────────────────────────────────────────

test("CUT_TRANSITION_TYPES contains none, crossfade, and dip", () => {
  assert.deepEqual([...CUT_TRANSITION_TYPES], ["none", "crossfade", "dip"]);
});

test("CutTransitionSchema defaults to type=none, durationMs=500", () => {
  const t = CutTransitionSchema.parse({});
  assert.equal(t.type, "none");
  assert.equal(t.durationMs, 500);
});

test("project.look.transition defaults to none/500 on parse", () => {
  const p = ProjectSchema.parse({
    version: 1,
    slug: "t",
    source: "/tmp/t.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: sec(10),
    words: [],
  });
  assert.equal(p.look.transition.type, "none");
  assert.equal(p.look.transition.durationMs, 500);
});

// ── look-transition action ────────────────────────────────────────────────────

test("look-transition action sets type and durationMs", () => {
  const p = makeProject();
  runAction("look-transition", p, { type: "crossfade", durationMs: 300 });
  assert.equal(p.look.transition.type, "crossfade");
  assert.equal(p.look.transition.durationMs, 300);
});

test("look-transition action partial patch: only type changes, durationMs preserved", () => {
  const p = makeProject();
  runAction("look-transition", p, { type: "crossfade", durationMs: 800 });
  runAction("look-transition", p, { type: "dip" });
  assert.equal(p.look.transition.type, "dip");
  assert.equal(p.look.transition.durationMs, 800);
});

test("look-transition action: none type restores hard cut default", () => {
  const p = makeProject();
  runAction("look-transition", p, { type: "crossfade" });
  runAction("look-transition", p, { type: "none" });
  assert.equal(p.look.transition.type, "none");
});

test("look-transition action rejects invalid type", () => {
  const p = makeProject();
  assert.throws(
    () => runAction("look-transition", p, { type: "wipe" }),
    /invalid_enum_value|invalid/i
  );
});

test("look-transition action rejects durationMs out of range", () => {
  const p = makeProject();
  assert.throws(
    () =>
      runAction("look-transition", p, { type: "crossfade", durationMs: 10 }),
    /durationMs/i
  );
  assert.throws(
    () =>
      runAction("look-transition", p, { type: "crossfade", durationMs: 9999 }),
    /durationMs/i
  );
});

// ── shouldApplyCutTransition ─────────────────────────────────────────────────

const twoRanges = [
  { startSec: 0, endSec: 5 },
  { startSec: 10, endSec: 15 },
];

const gate = {
  ranges: twoRanges,
  sourceDurationSec: 60,
  hasBroll: false,
  hasStills: false,
  hasRichGraphics: false,
  hasMusic: false,
};

test("shouldApplyCutTransition: false for type none", () => {
  assert.equal(shouldApplyCutTransition("none", gate), false);
});

test("shouldApplyCutTransition: true for crossfade with two ranges, no overlays", () => {
  assert.equal(shouldApplyCutTransition("crossfade", gate), true);
});

test("shouldApplyCutTransition: true for dip with two ranges, no overlays", () => {
  assert.equal(shouldApplyCutTransition("dip", gate), true);
});

test("shouldApplyCutTransition: false when only one range (nothing to transition between)", () => {
  assert.equal(
    shouldApplyCutTransition("crossfade", {
      ...gate,
      ranges: [{ startSec: 0, endSec: 5 }],
    }),
    false
  );
});

test("shouldApplyCutTransition: false when b-roll overlay present", () => {
  assert.equal(
    shouldApplyCutTransition("crossfade", { ...gate, hasBroll: true }),
    false
  );
});

test("shouldApplyCutTransition: false when music present", () => {
  assert.equal(
    shouldApplyCutTransition("dip", { ...gate, hasMusic: true }),
    false
  );
});

// ── buildSegmentVideoCrossfadeFilter ─────────────────────────────────────────

test("crossfade filter: single range returns plain setpts+fps chain", () => {
  const filter = buildSegmentVideoCrossfadeFilter({
    durationSec: 0.5,
    fpsFilter: ",fps=30",
    ranges: [{ startSec: 0, endSec: 5 }],
  });
  assert.match(filter, /\[0:v\]setpts=PTS-STARTPTS,fps=30\[vsel\]/);
  assert.doesNotMatch(filter, /xfade/);
});

test("crossfade filter: two ranges includes xfade with correct offset", () => {
  const filter = buildSegmentVideoCrossfadeFilter({
    durationSec: 0.5,
    fpsFilter: ",fps=30",
    ranges: [
      { startSec: 0, endSec: 5 },
      { startSec: 10, endSec: 15 },
    ],
  });
  // offset = dur(seg0) - D = 5 - 0.5 = 4.5
  assert.match(
    filter,
    /xfade=transition=fade:duration=0\.500000:offset=4\.500000/
  );
  // output label should be [vsel] for two ranges (last pass)
  assert.match(filter, /\[vsel\]/);
});

test("crossfade filter: three ranges produces two chained xfades", () => {
  const filter = buildSegmentVideoCrossfadeFilter({
    durationSec: 0.5,
    fpsFilter: ",fps=30",
    ranges: [
      { startSec: 0, endSec: 5 },
      { startSec: 10, endSec: 15 },
      { startSec: 20, endSec: 25 },
    ],
  });
  const xfadeCount = (filter.match(/xfade/g) ?? []).length;
  assert.equal(xfadeCount, 2);
  // intermediate label [xf1]
  assert.match(filter, /\[xf1\]/);
  // final label [vsel]
  assert.match(filter, /\[vsel\]/);
});

// ── buildSegmentVideoDipFilter ───────────────────────────────────────────────

test("dip filter: single range returns plain setpts+fps chain", () => {
  const filter = buildSegmentVideoDipFilter({
    durationSec: 0.5,
    fpsFilter: ",fps=30",
    ranges: [{ startSec: 0, endSec: 5 }],
  });
  assert.match(filter, /\[0:v\]setpts=PTS-STARTPTS,fps=30\[vsel\]/);
  assert.doesNotMatch(filter, /fade/);
});

test("dip filter: two ranges includes fade=out on first and fade=in on second", () => {
  const filter = buildSegmentVideoDipFilter({
    durationSec: 0.5,
    fpsFilter: ",fps=30",
    ranges: [
      { startSec: 0, endSec: 5 },
      { startSec: 10, endSec: 15 },
    ],
  });
  assert.match(filter, /fade=t=out/);
  assert.match(filter, /fade=t=in/);
  assert.match(filter, /concat=n=2:v=1:a=0\[vsel\]/);
});

// ── buildSegmentVideoTransitionFilter (dispatcher) ───────────────────────────

test("transition dispatcher: none falls back to plain concat", () => {
  const filter = buildSegmentVideoTransitionFilter({
    durationSec: 0.5,
    fpsFilter: ",fps=30",
    ranges: twoRanges,
    transitionType: "none",
  });
  assert.match(filter, /concat=n=2:v=1:a=0/);
  assert.doesNotMatch(filter, /xfade/);
  assert.doesNotMatch(filter, /fade=t=/);
});

test("transition dispatcher: crossfade uses xfade filter", () => {
  const filter = buildSegmentVideoTransitionFilter({
    durationSec: 0.5,
    fpsFilter: ",fps=30",
    ranges: twoRanges,
    transitionType: "crossfade",
  });
  assert.match(filter, /xfade/);
});

test("transition dispatcher: dip uses fade=t=out/in and concat", () => {
  const filter = buildSegmentVideoTransitionFilter({
    durationSec: 0.5,
    fpsFilter: ",fps=30",
    ranges: twoRanges,
    transitionType: "dip",
  });
  assert.match(filter, /fade=t=out/);
  assert.match(filter, /fade=t=in/);
  assert.match(filter, /concat/);
});
