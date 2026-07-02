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

test("applyProjectEdits persists transcript word text corrections", () => {
  const project = makeProject();
  applyProjectEdits(project, {
    words: [{ id: "w0", deleted: false, text: "Howdy" }],
  });
  assert.equal(project.words[0].text, "Howdy");
  assert.equal(project.words[0].deleted, false);
});

// F8: the GUI's bulk edit-words path must preserve originalText the same way
// setWordText (src/actions.ts, the CLI/agent parity surface) already does.
test("applyProjectEdits records originalText the first time a word's text changes", () => {
  const project = makeProject();
  assert.equal(project.words[0].text, "Hello");
  applyProjectEdits(project, {
    words: [{ id: "w0", deleted: false, text: "Howdy" }],
  });
  assert.equal(project.words[0].text, "Howdy");
  assert.equal(project.words[0].originalText, "Hello");
});

test("applyProjectEdits never overwrites an already-set originalText on a later correction", () => {
  const project = makeProject();
  applyProjectEdits(project, {
    words: [{ id: "w0", deleted: false, text: "Howdy" }],
  });
  applyProjectEdits(project, {
    words: [{ id: "w0", deleted: false, text: "Hey there" }],
  });
  assert.equal(project.words[0].text, "Hey there");
  assert.equal(project.words[0].originalText, "Hello");
});

test("applyProjectEdits does not set originalText when the text is unchanged", () => {
  const project = makeProject();
  applyProjectEdits(project, {
    words: [{ id: "w0", deleted: false, text: "Hello" }],
  });
  assert.equal(project.words[0].text, "Hello");
  assert.equal(project.words[0].originalText, undefined);
});

// C2: the GUI bulk edit path shares setWordText's whitespace normalization,
// so an embedded newline cannot ride into project.json and break the
// one-line ASS Dialogue entries the caption burn writes.
test("applyProjectEdits collapses embedded newlines/tabs in word text to single spaces", () => {
  const project = makeProject();
  applyProjectEdits(project, {
    words: [{ id: "w0", deleted: false, text: "line1\nline2" }],
  });
  assert.equal(project.words[0].text, "line1 line2");
});

test("applyProjectEdits re-anchors overlays when its words cut deletes the phrase", () => {
  const project = makeProject();
  // Anchor a title onto the second word ("world"); stored span already correct.
  project.titles = [
    {
      id: "t1",
      text: "Card",
      startSample: project.words[1].startSample,
      endSample: project.words[1].endSample,
      position: "lower",
      anchor: { phrase: "world", wordIds: ["w1"], stale: false },
    },
  ];
  applyProjectEdits(project, { words: [{ id: "w1", deleted: true }] });
  assert.equal(project.titles[0].anchor?.stale, true);
});

test("applyProjectEdits clamps caption maxWords and padMs", () => {
  const project = makeProject();
  applyProjectEdits(project, { captions: { maxWords: 99 }, padMs: 9999 });
  assert.equal(project.captions.maxWords, 12);
  assert.equal(project.padMs, 500);
});

test("applyProjectEdits stores clamped cut snap settings", () => {
  const project = makeProject();
  applyProjectEdits(project, {
    cuts: {
      snap: {
        enabled: true,
        mode: "vad",
        maxShiftMs: 999,
        crossfadeMs: -4,
      },
    },
  });
  assert.deepEqual(project.cuts.snap, {
    enabled: true,
    mode: "vad",
    maxShiftMs: 500,
    crossfadeMs: 0,
  });
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
