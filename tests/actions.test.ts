import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addBroll,
  cutByText,
  cutWords,
  removeBroll,
  restoreAll,
  setCaptions,
  summarize,
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
        name: "broll.mp4",
        src: "/tmp/broll.mp4",
        proxy: "assets/broll-1.mp4",
        durationSamples: sec(10),
      },
    ],
    broll: [],
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

test("setCaptions toggles the captions.enabled flag without dropping maxWords", () => {
  const p = makeProject();
  setCaptions(p, false);
  assert.equal(p.captions.enabled, false);
  assert.equal(p.captions.maxWords, 6); // preserved
  setCaptions(p, true);
  assert.equal(p.captions.enabled, true);
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
