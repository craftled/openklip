import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXPORT_PLATFORM_IDS,
  exportPlatform,
  isExportPlatformId,
  listExportPlatforms,
  resolvePlatformOptions,
} from "../src/export-platforms.ts";

test("EXPORT_PLATFORM_IDS lists landscape destinations plus shorts vertical", () => {
  assert.deepEqual(EXPORT_PLATFORM_IDS, [
    "youtube",
    "youtube-4k",
    "x",
    "linkedin",
    "shorts",
  ]);
});

test("listExportPlatforms returns one def per id, each carrying id/label/summary", () => {
  const defs = listExportPlatforms();
  assert.equal(defs.length, EXPORT_PLATFORM_IDS.length);
  for (const id of EXPORT_PLATFORM_IDS) {
    const def = defs.find((d) => d.id === id);
    assert.ok(def, `missing def for ${id}`);
    assert.equal(typeof def?.label, "string");
    assert.equal(typeof def?.summary, "string");
  }
});

test("isExportPlatformId narrows known ids and rejects unknown strings", () => {
  assert.equal(isExportPlatformId("youtube"), true);
  assert.equal(isExportPlatformId("tiktok"), false);
  assert.equal(isExportPlatformId(""), false);
});

test("exportPlatform throws a message listing every known id for an unknown id", () => {
  assert.throws(
    () => exportPlatform("tiktok" as never),
    /unknown export platform "tiktok".*youtube, youtube-4k, x, linkedin, shorts/
  );
});

// ── Per-platform expansion values ───────────────────────────────────────────

test("youtube expands to social/1080/-14 LUFS with source fps (fps left undefined)", () => {
  const def = exportPlatform("youtube");
  assert.equal(def.compression, "social");
  assert.equal(def.maxHeight, 1080);
  assert.equal(def.targetLufs, -14);
  assert.equal(def.fps, undefined);
});

test("youtube-4k expands to studio/2160/-14 LUFS with source fps", () => {
  const def = exportPlatform("youtube-4k");
  assert.equal(def.compression, "studio");
  assert.equal(def.maxHeight, 2160);
  assert.equal(def.targetLufs, -14);
  assert.equal(def.fps, undefined);
});

test("x expands to web/30fps/1080", () => {
  const def = exportPlatform("x");
  assert.equal(def.compression, "web");
  assert.equal(def.fps, 30);
  assert.equal(def.maxHeight, 1080);
});

test("linkedin expands to web/30fps/1080", () => {
  const def = exportPlatform("linkedin");
  assert.equal(def.compression, "web");
  assert.equal(def.fps, 30);
  assert.equal(def.maxHeight, 1080);
});

test("shorts expands to 9:16 vertical, social/source fps/1920", () => {
  const def = exportPlatform("shorts");
  assert.equal(def.aspect, "9:16");
  assert.equal(def.compression, "social");
  assert.equal(def.fps, undefined);
  assert.equal(def.maxHeight, 1920);
  assert.equal(def.targetLufs, -14);
});

test("resolvePlatformOptions fills aspect from the shorts platform", () => {
  const resolved = resolvePlatformOptions("shorts", {});
  assert.equal(resolved.aspect, "9:16");
  assert.equal(resolved.maxHeight, 1920);
});

// ── resolvePlatformOptions merge semantics: explicit always wins ───────────

test("resolvePlatformOptions passes explicit options through unchanged when no platform is given", () => {
  const explicit = { compression: "studio" as const, fps: 24, maxHeight: 720 };
  assert.deepEqual(resolvePlatformOptions(undefined, explicit), explicit);
});

test("resolvePlatformOptions fills every gap from the platform when nothing explicit is set", () => {
  const resolved = resolvePlatformOptions("youtube", {});
  assert.equal(resolved.compression, "social");
  assert.equal(resolved.maxHeight, 1080);
  assert.equal(resolved.loudnessTargetLufs, -14);
  assert.equal(resolved.fps, undefined);
});

test("resolvePlatformOptions: explicit compression wins over the platform default", () => {
  const resolved = resolvePlatformOptions("youtube", {
    compression: "web-low",
  });
  assert.equal(resolved.compression, "web-low");
  // Unrelated fields still fall back to the platform.
  assert.equal(resolved.maxHeight, 1080);
});

test("resolvePlatformOptions: explicit fps wins over the platform default", () => {
  const resolved = resolvePlatformOptions("x", { fps: 24 });
  assert.equal(resolved.fps, 24);
  assert.equal(resolved.compression, "web");
});

test("resolvePlatformOptions: explicit maxHeight wins over the platform default", () => {
  const resolved = resolvePlatformOptions("youtube-4k", { maxHeight: 1440 });
  assert.equal(resolved.maxHeight, 1440);
  assert.equal(resolved.compression, "studio");
});

test("resolvePlatformOptions: explicit loudnessTargetLufs wins over the platform default", () => {
  const resolved = resolvePlatformOptions("linkedin", {
    loudnessTargetLufs: -20,
  });
  assert.equal(resolved.loudnessTargetLufs, -20);
  assert.equal(resolved.fps, 30);
});

test("resolvePlatformOptions: every explicit field can win independently in one call", () => {
  const resolved = resolvePlatformOptions("youtube-4k", {
    compression: "web",
    fps: 25,
    maxHeight: 480,
    loudnessTargetLufs: -18,
  });
  assert.deepEqual(resolved, {
    aspect: undefined,
    compression: "web",
    fps: 25,
    maxHeight: 480,
    loudnessTargetLufs: -18,
  });
});
