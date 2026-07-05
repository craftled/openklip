import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTransitionGateFromProject,
  overlaySpanIntersectsKeptRanges,
  previewTransitionNotice,
  transitionExportPreview,
} from "../src/cut-transition-gate.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { makeProject } from "./helpers/projectFixture.ts";

const samples = (seconds: number) => Math.round(seconds * SAMPLE_RATE);

test("overlaySpanIntersectsKeptRanges detects overlap with kept ranges", () => {
  const ranges = [{ startSec: 1, endSec: 3 }];
  assert.equal(
    overlaySpanIntersectsKeptRanges(
      samples(0.5),
      samples(1.5),
      SAMPLE_RATE,
      ranges
    ),
    true
  );
  assert.equal(
    overlaySpanIntersectsKeptRanges(
      samples(4),
      samples(5),
      SAMPLE_RATE,
      ranges
    ),
    false
  );
});

test("buildTransitionGateFromProject flags b-roll overlapping kept ranges", () => {
  const p = makeProject();
  p.broll = [
    {
      id: "b1",
      assetId: "a1",
      startSample: samples(0.5),
      endSample: samples(2),
      srcInSample: 0,
    },
  ];
  const gate = buildTransitionGateFromProject(p, [{ startSec: 1, endSec: 4 }]);
  assert.equal(gate.hasBroll, true);
});

test("transitionExportPreview reports fallback when overlays block transitions", () => {
  const p = makeProject();
  p.look = {
    ...p.look,
    transition: { type: "crossfade", durationMs: 500 },
  };
  p.broll = [
    {
      id: "b1",
      assetId: "a1",
      startSample: samples(0.5),
      endSample: samples(2),
      srcInSample: 0,
    },
  ];
  const ranges = [
    { startSec: 1, endSec: 2 },
    { startSec: 3, endSec: 4 },
  ];
  const preview = transitionExportPreview(p, ranges);
  assert.equal(preview.type, "crossfade");
  assert.equal(preview.wouldApply, false);
  assert.equal(preview.fallbackReason, "overlays-present");
});

test("previewTransitionNotice explains export hard-cut when fallback applies", () => {
  const message = previewTransitionNotice(
    { type: "dip", durationMs: 500 },
    {
      ranges: [
        { startSec: 0, endSec: 1 },
        { startSec: 2, endSec: 3 },
      ],
      sourceDurationSec: 4,
      hasBroll: true,
      hasStills: false,
      hasMusic: false,
      hasRichGraphics: false,
    }
  );
  assert.match(message ?? "", /Export will hard-cut/);
  assert.match(message ?? "", /b-roll or rich graphics present/);
});

test("previewTransitionNotice is null when no transition is requested", () => {
  const message = previewTransitionNotice(
    { type: "none", durationMs: 500 },
    {
      ranges: [
        { startSec: 0, endSec: 1 },
        { startSec: 2, endSec: 3 },
      ],
      sourceDurationSec: 4,
      hasBroll: false,
      hasStills: false,
      hasMusic: false,
      hasRichGraphics: false,
    }
  );
  assert.equal(message, null);
});
