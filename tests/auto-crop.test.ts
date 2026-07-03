import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestCropFromSceneLog } from "../src/auto-crop.ts";
import type { Project } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    version: 1,
    slug: "test",
    source: "/tmp/test.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: SAMPLE_RATE * 60,
    padMs: 0,
    captions: { enabled: true, maxWords: 6, style: "boxed" },
    assets: [],
    broll: [],
    look: { vignette: false, filter: "none" },
    zooms: [],
    titles: [],
    stills: [],
    graphics: [],
    music: [],
    words: [],
    cuts: {
      snap: { enabled: false, mode: "smart", maxShiftMs: 150, crossfadeMs: 0 },
      deadAir: [],
    },
    motion: { fadeMs: 180, heroFadeMs: 400, slideFrac: 0.08, speed: 1 },
    audio: {
      ducking: { enabled: false, amountDb: 12, attackMs: 25, releaseMs: 250 },
      loudness: { enabled: false, targetLufs: -16 },
      voiceHighpass: { enabled: false, hz: 80 },
    },
    export: {
      aspect: "source",
      crop: { focusX: 0.5, focusY: 0.5, scale: 1 },
      cropMode: "manual",
    },
    ...overrides,
  } as unknown as Project;
}

test("suggestCropFromSceneLog returns null when aspect is source", () => {
  const project = makeProject({
    sceneLog: {
      segments: [
        {
          fromSec: 0,
          toSec: 10,
          summary: "speaker on camera",
          onScreen: "speaker",
        },
      ],
      analyzedAt: "2026-07-03T00:00:00Z",
    },
  });
  assert.equal(suggestCropFromSceneLog(project, "source"), null);
});

test("suggestCropFromSceneLog returns null when no sceneLog", () => {
  const project = makeProject();
  assert.equal(suggestCropFromSceneLog(project, "9:16"), null);
});

test("suggestCropFromSceneLog returns center default when sceneLog exists but no speaker segments", () => {
  const project = makeProject({
    sceneLog: {
      segments: [
        {
          fromSec: 0,
          toSec: 10,
          summary: "slide on screen",
          onScreen: "slide",
        },
      ],
      analyzedAt: "2026-07-03T00:00:00Z",
    },
  });
  const result = suggestCropFromSceneLog(project, "9:16");
  assert.ok(result !== null);
  assert.equal(result.focusX, 0.5);
  assert.equal(result.focusY, 0.5);
});

test("suggestCropFromSceneLog returns center default when sceneLog has empty segments", () => {
  const project = makeProject({
    sceneLog: {
      segments: [],
      analyzedAt: "2026-07-03T00:00:00Z",
    },
  });
  const result = suggestCropFromSceneLog(project, "9:16");
  assert.ok(result !== null);
  assert.equal(result.focusX, 0.5);
  assert.equal(result.focusY, 0.5);
});

test("suggestCropFromSceneLog returns center for speaker segments (default 0.5/0.5 focus)", () => {
  const project = makeProject({
    sceneLog: {
      segments: [
        {
          fromSec: 0,
          toSec: 5,
          summary: "speaker on camera",
          onScreen: "speaker",
        },
        {
          fromSec: 5,
          toSec: 10,
          summary: "speaker continues",
          onScreen: "speaker",
        },
      ],
      analyzedAt: "2026-07-03T00:00:00Z",
    },
  });
  const result = suggestCropFromSceneLog(project, "9:16");
  assert.ok(result !== null);
  assert.equal(result.focusX, 0.5);
  assert.equal(result.focusY, 0.5);
});

test("suggestCropFromSceneLog works for 16:9 and 1:1 aspects too", () => {
  const project = makeProject({
    sceneLog: {
      segments: [
        {
          fromSec: 0,
          toSec: 10,
          summary: "speaker on camera",
          onScreen: "speaker",
        },
      ],
      analyzedAt: "2026-07-03T00:00:00Z",
    },
  });
  for (const aspect of ["16:9", "1:1"] as const) {
    const result = suggestCropFromSceneLog(project, aspect);
    assert.ok(result !== null, `expected non-null for aspect ${aspect}`);
    assert.equal(result.focusX, 0.5);
    assert.equal(result.focusY, 0.5);
  }
});

test("suggestCropFromSceneLog ignores zero-duration segments", () => {
  const project = makeProject({
    sceneLog: {
      segments: [
        { fromSec: 0, toSec: 0, summary: "zero duration", onScreen: "speaker" },
        {
          fromSec: 0,
          toSec: 10,
          summary: "normal speaker",
          onScreen: "speaker",
        },
      ],
      analyzedAt: "2026-07-03T00:00:00Z",
    },
  });
  const result = suggestCropFromSceneLog(project, "9:16");
  assert.ok(result !== null);
  assert.equal(result.focusX, 0.5);
  assert.equal(result.focusY, 0.5);
});
