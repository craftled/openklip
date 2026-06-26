import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyLook,
  applyProjectEdits,
  applyTitles,
  applyZooms,
  clampBrollItems,
  clampTitleItems,
  clampZoomItems,
} from "../src/projectMutations.ts";
import { makeProject } from "./helpers/projectFixture.ts";

test("applyProjectEdits toggles deleted words and caption settings", () => {
  const project = makeProject();
  applyProjectEdits(project, {
    words: [{ id: "w0", deleted: true }],
    captions: { enabled: false, maxWords: 12 },
    padMs: 120,
  });
  assert.equal(project.words[0].deleted, true);
  assert.equal(project.captions.enabled, false);
  assert.equal(project.captions.maxWords, 12);
  assert.equal(project.padMs, 120);
});

test("applyProjectEdits clamps caption maxWords and padMs", () => {
  const project = makeProject();
  applyProjectEdits(project, { captions: { maxWords: 99 }, padMs: 9999 });
  assert.equal(project.captions.maxWords, 12);
  assert.equal(project.padMs, 500);
});

test("applyLook toggles vignette", () => {
  const project = makeProject();
  applyLook(project, { vignette: true });
  assert.equal(project.look.vignette, true);
});

test("clampZoomItems clamps to project duration", () => {
  const project = makeProject({ durationSamples: 240_000 });
  const items = clampZoomItems(project, [
    {
      id: "z1",
      startSample: 200_000,
      endSample: 999_999,
      scale: 1.2,
      rampSec: 0.5,
    },
  ]);
  assert.equal(items[0].startSample, 200_000);
  assert.equal(items[0].endSample, 240_000);
});

test("applyZooms replaces zoom list", () => {
  const project = makeProject();
  applyZooms(project, [
    {
      id: "z1",
      startSample: 0,
      endSample: 48_000,
      scale: 1.2,
      rampSec: 0.5,
    },
  ]);
  assert.equal(project.zooms.length, 1);
  assert.equal(project.zooms[0].id, "z1");
});

test("clampBrollItems skips unknown assets", () => {
  const project = makeProject();
  const items = clampBrollItems(project, [
    {
      id: "br1",
      assetId: "missing",
      startSample: 0,
      endSample: 48_000,
      srcInSample: 0,
    },
    {
      id: "br2",
      assetId: "broll-a",
      startSample: 0,
      endSample: 48_000,
      srcInSample: 0,
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].assetId, "broll-a");
});

test("clampTitleItems skips blank text and accepts hero position", () => {
  const project = makeProject();
  const items = clampTitleItems(project, [
    {
      id: "t-blank",
      text: "   ",
      startSample: 0,
      endSample: 48_000,
      position: "lower",
    },
    {
      id: "t-hero",
      text: "$90,000\nSubtitle",
      startSample: 48_000,
      endSample: 96_000,
      position: "hero",
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].position, "hero");
});

test("applyTitles replaces title list", () => {
  const project = makeProject();
  applyTitles(project, [
    {
      id: "t1",
      text: "Hello",
      startSample: 0,
      endSample: 48_000,
      position: "center",
    },
  ]);
  assert.equal(project.titles.length, 1);
  assert.equal(project.titles[0].text, "Hello");
});
