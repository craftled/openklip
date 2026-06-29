import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addBroll,
  addGraphic,
  addStill,
  addTitle,
  addZoom,
  cutAllByText,
  cutByText,
  cutWords,
  removeAsset,
  removeBroll,
  removeTitle,
  removeZoom,
  restoreAll,
  setCaptionMaxWords,
  setCaptions,
  setLook,
  setPadMs,
  summarize,
  updateBroll,
  updateTitle,
  updateZoom,
} from "../src/actions.ts";
import type { Project } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";

// A hand-written fixture: 6 words across 6 seconds, one registered asset, no
// ffmpeg, no ingest. One word per second so surviving-range math is easy to read.
function makeProject(): Project {
  const sec = (n: number) => n * SAMPLE_RATE;
  return {
    version: 1,
    slug: "test",
    source: "/tmp/test.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: sec(6),
    padMs: 0, // no padding so range math stays exact
    captions: { enabled: true, maxWords: 6 },
    assets: [
      {
        id: "broll-1",
        kind: "broll",
        name: "broll.mp4",
        src: "/tmp/broll.mp4",
        proxy: "assets/broll-1.mp4",
        durationSamples: sec(10),
      },
    ],
    broll: [],
    titles: [],
    words: [
      {
        id: "w0",
        text: "Hello",
        startSample: sec(0),
        endSample: sec(1),
        deleted: false,
      },
      {
        id: "w1",
        text: "there,",
        startSample: sec(1),
        endSample: sec(2),
        deleted: false,
      },
      {
        id: "w2",
        text: "world",
        startSample: sec(2),
        endSample: sec(3),
        deleted: false,
      },
      {
        id: "w3",
        text: "this",
        startSample: sec(3),
        endSample: sec(4),
        deleted: false,
      },
      {
        id: "w4",
        text: "is",
        startSample: sec(4),
        endSample: sec(5),
        deleted: false,
      },
      {
        id: "w5",
        text: "openklip",
        startSample: sec(5),
        endSample: sec(6),
        deleted: false,
      },
    ],
  };
}

test("removeAsset drops overlays that reference the asset", () => {
  const p = makeProject();
  p.assets = [
    {
      id: "clip",
      kind: "broll",
      name: "clip.mp4",
      src: "/clip.mp4",
      proxy: "working/assets/clip.mp4",
      durationSamples: 48_000,
    },
  ];
  p.broll = [
    {
      id: "b1",
      assetId: "clip",
      startSample: 0,
      endSample: 48_000,
      srcInSample: 0,
    },
  ];
  p.stills = [
    {
      id: "s1",
      assetId: "clip",
      startSample: 0,
      endSample: 48_000,
      scale: 1.2,
      focusX: 0.5,
      focusY: 0.5,
    },
  ];
  assert.equal(removeAsset(p, "clip"), true);
  assert.equal(p.assets.length, 0);
  assert.equal(p.broll.length, 0);
  assert.equal(p.stills.length, 0);
});

test("cutWords marks the listed ids deleted", () => {
  const p = makeProject();
  cutWords(p, ["w1", "w3"]);
  assert.equal(p.words.find((w) => w.id === "w1")?.deleted, true);
  assert.equal(p.words.find((w) => w.id === "w3")?.deleted, true);
  // Untouched words stay kept.
  assert.equal(p.words.find((w) => w.id === "w0")?.deleted, false);
  assert.equal(p.words.find((w) => w.id === "w2")?.deleted, false);
});

test("cutWords with deleted=false restores the listed ids", () => {
  const p = makeProject();
  cutWords(p, ["w0", "w1"], true);
  cutWords(p, ["w0"], false);
  assert.equal(p.words.find((w) => w.id === "w0")?.deleted, false);
  assert.equal(p.words.find((w) => w.id === "w1")?.deleted, true);
});

test("cutByText matches a phrase across punctuation and case, marks its words", () => {
  const p = makeProject();
  // "there, world" normalizes to "there world" and spans w1 + w2.
  const result = cutByText(p, "There World");
  assert.equal(result.matched, true);
  assert.deepEqual(result.ids, ["w1", "w2"]);
  assert.equal(p.words.find((w) => w.id === "w1")?.deleted, true);
  assert.equal(p.words.find((w) => w.id === "w2")?.deleted, true);
  // Words outside the run are untouched.
  assert.equal(p.words.find((w) => w.id === "w0")?.deleted, false);
});

test("cutByText returns matched=false when no contiguous run matches", () => {
  const p = makeProject();
  const result = cutByText(p, "not in the transcript");
  assert.equal(result.matched, false);
  assert.deepEqual(result.ids, []);
  assert.equal(
    p.words.every((w) => !w.deleted),
    true
  );
});

test("restoreAll clears every cut", () => {
  const p = makeProject();
  cutWords(p, ["w0", "w2", "w4"]);
  restoreAll(p);
  assert.equal(
    p.words.every((w) => !w.deleted),
    true
  );
});

test("addBroll throws on an unknown asset id", () => {
  const p = makeProject();
  assert.throws(
    () => addBroll(p, { assetId: "nope", fromSec: 1, toSec: 2 }),
    /unknown asset/
  );
  assert.equal(p.broll.length, 0);
});

test("addBroll throws on an empty span", () => {
  const p = makeProject();
  assert.throws(
    () => addBroll(p, { assetId: "broll-1", fromSec: 3, toSec: 3 }),
    /empty/
  );
});

test("addBroll rejects negative and non-finite timing", () => {
  const p = makeProject();
  assert.throws(
    () => addBroll(p, { assetId: "broll-1", fromSec: -1, toSec: 2 }),
    /non-negative/
  );
  assert.throws(
    () => addBroll(p, { assetId: "broll-1", fromSec: 1, toSec: Number.NaN }),
    /finite/
  );
  assert.throws(
    () =>
      addBroll(p, {
        assetId: "broll-1",
        fromSec: 1,
        toSec: 2,
        srcInSec: -0.5,
      }),
    /non-negative/
  );
});

test("addBroll succeeds on a known asset, converting seconds to samples", () => {
  const p = makeProject();
  const item = addBroll(p, {
    assetId: "broll-1",
    fromSec: 1,
    toSec: 3,
    srcInSec: 0.5,
  });
  assert.equal(item.assetId, "broll-1");
  assert.equal(item.startSample, 1 * SAMPLE_RATE);
  assert.equal(item.endSample, 3 * SAMPLE_RATE);
  assert.equal(item.srcInSample, Math.round(0.5 * SAMPLE_RATE));
  assert.match(item.id, /^br\d+$/);
  assert.equal(p.broll.length, 1);
  assert.equal(p.broll[0].id, item.id);
});

test("removeBroll removes a clip by id and reports whether it removed one", () => {
  const p = makeProject();
  const item = addBroll(p, { assetId: "broll-1", fromSec: 1, toSec: 2 });
  assert.equal(removeBroll(p, item.id), true);
  assert.equal(p.broll.length, 0);
  assert.equal(removeBroll(p, "does-not-exist"), false);
});

test("addTitle stores hero position and multiline text", () => {
  const p = makeProject();
  const item = addTitle(p, {
    fromSec: 1,
    toSec: 3,
    text: "$90,000\nCheapest Program",
    position: "hero",
  });
  assert.equal(item.position, "hero");
  assert.equal(item.text, "$90,000\nCheapest Program");
  assert.equal(item.startSample, SAMPLE_RATE);
  assert.equal(item.endSample, 3 * SAMPLE_RATE);
});

test("removeTitle removes a title by id", () => {
  const p = makeProject();
  const item = addTitle(p, {
    fromSec: 0,
    toSec: 1,
    text: "Intro",
  });
  assert.equal(removeTitle(p, item.id), true);
  assert.equal(p.titles.length, 0);
  assert.equal(removeTitle(p, "missing"), false);
});

test("cutByText skips already-deleted words", () => {
  const p = makeProject();
  cutWords(p, ["w1"]);
  const result = cutByText(p, "Hello there");
  assert.equal(result.matched, false);
});

test("cutAllByText cuts every matching run among kept words", () => {
  const p = makeProject();
  p.words.push(
    {
      id: "w6",
      text: "hello",
      startSample: 6 * SAMPLE_RATE,
      endSample: 7 * SAMPLE_RATE,
      deleted: false,
    },
    {
      id: "w7",
      text: "again",
      startSample: 7 * SAMPLE_RATE,
      endSample: 8 * SAMPLE_RATE,
      deleted: false,
    }
  );
  p.durationSamples = 8 * SAMPLE_RATE;
  const result = cutAllByText(p, "hello");
  assert.equal(result.matches, 2);
  assert.equal(result.ids.length, 2);
  assert.equal(p.words.find((w) => w.id === "w0")?.deleted, true);
  assert.equal(p.words.find((w) => w.id === "w6")?.deleted, true);
});

test("updateBroll patches asset and timing", () => {
  const p = makeProject();
  const item = addBroll(p, { assetId: "broll-1", fromSec: 1, toSec: 2 });
  updateBroll(p, item.id, { fromSec: 0.5, toSec: 2.5 });
  assert.equal(p.broll[0].startSample, Math.round(0.5 * SAMPLE_RATE));
  assert.equal(p.broll[0].endSample, Math.round(2.5 * SAMPLE_RATE));
});

test("updateTitle patches text and position", () => {
  const p = makeProject();
  const item = addTitle(p, { fromSec: 0, toSec: 1, text: "Old" });
  updateTitle(p, item.id, { text: "New", position: "hero" });
  assert.equal(p.titles?.[0].text, "New");
  assert.equal(p.titles?.[0].position, "hero");
});

test("updateZoom patches scale and ramp", () => {
  const p = makeProject();
  const item = addZoom(p, { fromSec: 0, toSec: 1 });
  updateZoom(p, item.id, { scale: 1.5, rampSec: 1.2 });
  assert.equal(p.zooms?.[0].scale, 1.5);
  assert.equal(p.zooms?.[0].rampSec, 1.2);
});

test("setCaptions toggles the captions.enabled flag without dropping maxWords", () => {
  const p = makeProject();
  setCaptions(p, false);
  assert.equal(p.captions.enabled, false);
  assert.equal(p.captions.maxWords, 6); // preserved
  setCaptions(p, true);
  assert.equal(p.captions.enabled, true);
});

test("setCaptionMaxWords clamps to 1-12", () => {
  const p = makeProject();
  setCaptionMaxWords(p, 99);
  assert.equal(p.captions.maxWords, 12);
  setCaptionMaxWords(p, 0);
  assert.equal(p.captions.maxWords, 1);
});

test("setPadMs clamps to 0-500", () => {
  const p = makeProject();
  setPadMs(p, 999);
  assert.equal(p.padMs, 500);
  setPadMs(p, -10);
  assert.equal(p.padMs, 0);
});

test("setLook toggles vignette", () => {
  const p = makeProject();
  setLook(p, { vignette: true });
  assert.equal(p.look.vignette, true);
  setLook(p, { vignette: false });
  assert.equal(p.look.vignette, false);
});

test("setLook merges color knobs and only changes the passed ones", () => {
  const p = makeProject();
  setLook(p, { color: { temperature: 0.15 } });
  assert.equal(p.look.color?.temperature, 0.15);
  // Untouched knobs keep their identity defaults.
  assert.equal(p.look.color?.contrast, 1);
  assert.equal(p.look.color?.saturation, 1);
  // A second patch merges, not replaces.
  setLook(p, { color: { saturation: 0.84 } });
  assert.equal(p.look.color?.temperature, 0.15);
  assert.equal(p.look.color?.saturation, 0.84);
});

test("setLook drops the color field when knobs return to neutral", () => {
  const p = makeProject();
  setLook(p, { color: { temperature: 0.15, saturation: 0.84 } });
  assert.ok(p.look.color);
  setLook(p, { color: { temperature: 0, saturation: 1 } });
  assert.equal(p.look.color, undefined);
});

test("addZoom stores scale and rampSec", () => {
  const p = makeProject();
  const item = addZoom(p, {
    fromSec: 1,
    toSec: 3,
    scale: 1.25,
    rampSec: 0.8,
  });
  assert.equal(item.scale, 1.25);
  assert.equal(item.rampSec, 0.8);
  assert.match(item.id, /^z\d+$/);
  assert.equal(p.zooms?.length, 1);
});

test("removeZoom removes a zoom by id", () => {
  const p = makeProject();
  const item = addZoom(p, { fromSec: 0, toSec: 1 });
  assert.equal(removeZoom(p, item.id), true);
  assert.equal(p.zooms?.length, 0);
  assert.equal(removeZoom(p, "missing"), false);
});

// ── FEATURE 1: written rationale (note) ─────────────────────────────────────

// Register a still asset on the shared fixture so addStill has something to bind.
function withStillAsset(p: Project): Project {
  p.assets.push({
    id: "still-1",
    kind: "still",
    name: "still.png",
    src: "/tmp/still.png",
    proxy: "assets/still-1.png",
    durationSamples: 0,
  });
  return p;
}

test("addBroll stores an optional note and omits it when absent", () => {
  const p = makeProject();
  const noted = addBroll(p, {
    assetId: "broll-1",
    fromSec: 0,
    toSec: 2,
    note: "establish setting",
  });
  assert.equal(noted.note, "establish setting");
  const plain = addBroll(p, { assetId: "broll-1", fromSec: 2, toSec: 4 });
  assert.equal(plain.note, undefined);
});

test("addStill stores an optional note and omits it when absent", () => {
  const p = withStillAsset(makeProject());
  const noted = addStill(p, {
    assetId: "still-1",
    fromSec: 0,
    toSec: 2,
    note: "context shot",
  });
  assert.equal(noted.note, "context shot");
  const plain = addStill(p, { assetId: "still-1", fromSec: 2, toSec: 4 });
  assert.equal(plain.note, undefined);
});

test("addTitle stores an optional note and omits it when absent", () => {
  const p = makeProject();
  const noted = addTitle(p, {
    fromSec: 0,
    toSec: 2,
    text: "Hook",
    note: "why this title",
  });
  assert.equal(noted.note, "why this title");
  const plain = addTitle(p, { fromSec: 2, toSec: 4, text: "Plain" });
  assert.equal(plain.note, undefined);
});

test("addZoom stores an optional note and omits it when absent", () => {
  const p = makeProject();
  const noted = addZoom(p, { fromSec: 0, toSec: 2, note: "punch in" });
  assert.equal(noted.note, "punch in");
  const plain = addZoom(p, { fromSec: 2, toSec: 4 });
  assert.equal(plain.note, undefined);
});

test("addGraphic stores an optional note and omits it when absent", () => {
  const p = makeProject();
  const noted = addGraphic(p, {
    template: "lower-third",
    fromSec: 0,
    toSec: 2,
    note: "lower third why",
  });
  assert.equal(noted.note, "lower third why");
  const plain = addGraphic(p, {
    template: "lower-third",
    fromSec: 2,
    toSec: 4,
  });
  assert.equal(plain.note, undefined);
});

test("updateTitle sets a note then clears it on empty string", () => {
  const p = makeProject();
  const item = addTitle(p, { fromSec: 0, toSec: 2, text: "Hook" });
  updateTitle(p, item.id, { note: "why" });
  assert.equal(item.note, "why");
  updateTitle(p, item.id, { note: "" });
  assert.equal(item.note, undefined);
});

test("cutWords records a per-word note and clears it on empty string", () => {
  const p = makeProject();
  cutWords(p, ["w1"], true, "stumble");
  const w = p.words.find((x) => x.id === "w1");
  assert.equal(w?.deleted, true);
  assert.equal(w?.note, "stumble");
  cutWords(p, ["w1"], true, "");
  assert.equal(w?.note, undefined);
});

// ── FEATURE 2: phrase-anchored cues (anchor) ────────────────────────────────

test("addTitle stores an optional phrase anchor", () => {
  const p = makeProject();
  const anchored = addTitle(p, {
    fromSec: 0,
    toSec: 2,
    text: "Hook",
    anchor: { phrase: "big reveal", wordIds: ["w0", "w1"], stale: false },
  });
  assert.equal(anchored.anchor?.phrase, "big reveal");
  assert.deepEqual(anchored.anchor?.wordIds, ["w0", "w1"]);
  const plain = addTitle(p, { fromSec: 2, toSec: 4, text: "Plain" });
  assert.equal(plain.anchor, undefined);
});

test("summarize counts words, cuts, ranges, broll, and kept duration", () => {
  const p = makeProject();
  // No cuts: all 6 words kept, padMs=0 so one contiguous 6s range.
  let s = summarize(p);
  assert.equal(s.words, 6);
  assert.equal(s.kept, 6);
  assert.equal(s.deleted, 0);
  assert.equal(s.cuts, 1);
  assert.equal(s.brollCount, 0);
  assert.equal(s.assetCount, 1);
  assert.equal(s.titleCount, 0);
  assert.equal(s.zoomCount, 0);
  assert.ok(Math.abs(s.keptDurationSec - 6) < 1e-6);

  // Cut w2 + w3 (the middle): splits the run into two ranges (w0-w1, w4-w5).
  cutWords(p, ["w2", "w3"]);
  addBroll(p, { assetId: "broll-1", fromSec: 0, toSec: 1 });
  s = summarize(p);
  assert.equal(s.deleted, 2);
  assert.equal(s.kept, 4);
  assert.equal(s.cuts, 2);
  assert.equal(s.brollCount, 1);
  assert.ok(Math.abs(s.keptDurationSec - 4) < 1e-6);
});
