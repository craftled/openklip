import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfigInspectorSummary } from "../web/lib/config-inspector.ts";

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

test("buildConfigInspectorSummary returns null with no selection", () => {
  assert.equal(
    buildConfigInspectorSummary({
      assetName: () => "asset",
      fmtTime: fmt,
      graphicLabel: "Graphic",
      sampleRate: 48_000,
      selBroll: null,
      selGraphic: null,
      selRange: null,
      selStill: null,
      selTitle: null,
      selZoom: null,
      wordStartSample: null,
    }),
    null
  );
});

test("buildConfigInspectorSummary describes a transcript word range", () => {
  const summary = buildConfigInspectorSummary({
    assetName: () => "asset",
    fmtTime: fmt,
    graphicLabel: "Graphic",
    sampleRate: 48_000,
    selBroll: null,
    selGraphic: null,
    selRange: [4, 9],
    selStill: null,
    selTitle: null,
    selZoom: null,
    wordStartSample: 240_000,
  });
  assert.equal(summary?.label, "Selection");
  assert.equal(summary?.badge, "6");
  assert.equal(summary?.meta[0]?.value, "6");
  assert.equal(summary?.meta[1]?.value, "0:05");
});

test("buildConfigInspectorSummary does not fall back to caption settings", () => {
  const summary = buildConfigInspectorSummary({
    assetName: () => "asset",
    fmtTime: fmt,
    graphicLabel: "Graphic",
    sampleRate: 48_000,
    selBroll: null,
    selGraphic: null,
    selRange: null,
    selStill: null,
    selTitle: null,
    selZoom: null,
    wordStartSample: null,
  });
  assert.equal(summary, null);
});
