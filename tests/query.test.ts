import assert from "node:assert/strict";
import { test } from "node:test";
import { addBroll, addTitle, addZoom } from "../src/actions.ts";
import type { Project } from "../src/edl.ts";
import { SAMPLE_RATE, samplesToSec } from "../src/edl.ts";
import {
  expandWordTokens,
  grepTranscript,
  listOverlays,
  listRanges,
  phraseSpan,
  projectStatus,
  wordSpan,
} from "../src/query.ts";

function makeProject(overrides: Partial<Project> = {}): Project {
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
    padMs: 0,
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
    stills: [],
    zooms: [],
    look: { vignette: false },
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
        text: "you",
        startSample: sec(3),
        endSample: sec(4),
        deleted: false,
      },
      {
        id: "w4",
        text: "know",
        startSample: sec(4),
        endSample: sec(5),
        deleted: false,
      },
      {
        id: "w5",
        text: "you",
        startSample: sec(5),
        endSample: sec(6),
        deleted: false,
      },
    ],
    ...overrides,
  };
}

test("grepTranscript finds first phrase match with ids and seconds", () => {
  const p = makeProject();
  const r = grepTranscript(p, "Hello there", { all: false });
  assert.equal(r.matches.length, 1);
  assert.deepEqual(r.matches[0].ids, ["w0", "w1"]);
  assert.equal(r.matches[0].fromSec, 0);
  assert.equal(r.matches[0].toSec, 2);
});

test("grepTranscript --all finds every kept run", () => {
  const p = makeProject();
  const r = grepTranscript(p, "you", { all: true });
  assert.equal(r.matches.length, 2);
  assert.deepEqual(r.matches[0].ids, ["w3"]);
  assert.deepEqual(r.matches[1].ids, ["w5"]);
});

test("grepTranscript skips deleted words in kept-only mode", () => {
  const p = makeProject();
  p.words[3].deleted = true;
  const r = grepTranscript(p, "you know", { all: false });
  assert.equal(r.matches.length, 0);
});

test("phraseSpan returns first match span for overlay placement", () => {
  const p = makeProject();
  const span = phraseSpan(p, "there world");
  assert.ok(span.matched);
  assert.deepEqual(span.ids, ["w1", "w2"]);
  assert.equal(span.fromSec, 1);
  assert.equal(span.toSec, 3);
});

test("phraseSpan returns matched=false when phrase absent", () => {
  const p = makeProject();
  const span = phraseSpan(p, "not here");
  assert.equal(span.matched, false);
  assert.deepEqual(span.ids, []);
});

test("expandWordTokens expands id ranges in project order", () => {
  const p = makeProject();
  assert.deepEqual(expandWordTokens(p, ["w2-w4"]), ["w2", "w3", "w4"]);
  assert.deepEqual(expandWordTokens(p, ["w4", "w1"]), ["w1", "w4"]);
});

test("wordSpan returns words for token with optional context", () => {
  const p = makeProject();
  const slice = wordSpan(p, "w2", { context: 1 });
  assert.deepEqual(
    slice.words.map((w) => w.id),
    ["w1", "w2", "w3"]
  );
  assert.equal(slice.words[1].text, "world");
});

test("wordSpan supports inclusive ranges", () => {
  const p = makeProject();
  const slice = wordSpan(p, "w1-w3");
  assert.deepEqual(
    slice.words.map((w) => w.id),
    ["w1", "w2", "w3"]
  );
});

test("listRanges returns padded surviving segments", () => {
  const p = makeProject({ padMs: 100 });
  p.words[2].deleted = true;
  p.words[3].deleted = true;
  const ranges = listRanges(p);
  assert.equal(ranges.length, 2);
  assert.ok(ranges[0].startSec < 0.1);
  assert.ok(ranges[1].startSec >= 3.9);
});

test("listRanges does not let padding swallow a short deleted word", () => {
  const sec = (n: number) => n * SAMPLE_RATE;
  const p = makeProject({
    durationSamples: sec(1),
    padMs: 50,
    words: [
      {
        id: "w0",
        text: "one",
        startSample: sec(0),
        endSample: sec(0.2),
        deleted: false,
      },
      {
        id: "w1",
        text: "um",
        startSample: sec(0.2),
        endSample: sec(0.3),
        deleted: true,
      },
      {
        id: "w2",
        text: "two",
        startSample: sec(0.3),
        endSample: sec(0.5),
        deleted: false,
      },
    ],
  });

  const ranges = listRanges(p);

  assert.equal(ranges.length, 2);
  assert.ok(ranges[0].endSec <= 0.2);
  assert.ok(ranges[1].startSec >= 0.3);
});

test("listOverlays returns structured b-roll titles zooms stills", () => {
  const p = makeProject();
  addBroll(p, { assetId: "broll-1", fromSec: 0, toSec: 2 });
  addTitle(p, { fromSec: 1, toSec: 3, text: "Hook", position: "lower" });
  addZoom(p, { fromSec: 2, toSec: 4, scale: 1.2, rampSec: 0.5 });
  const o = listOverlays(p);
  assert.equal(o.broll.length, 1);
  assert.equal(o.broll[0].assetId, "broll-1");
  assert.equal(o.titles[0].text, "Hook");
  assert.equal(o.zooms[0].scale, 1.2);
  assert.equal(o.stills.length, 0);
});

test("listOverlays surfaces a note when present and omits the key otherwise", () => {
  const p = makeProject();
  addTitle(p, { fromSec: 0, toSec: 2, text: "Noted", note: "why this" });
  addTitle(p, { fromSec: 2, toSec: 4, text: "Plain" });
  const o = listOverlays(p);
  assert.equal(o.titles[0].note, "why this");
  assert.ok(!("note" in o.titles[1]), "note key should be omitted when absent");
});

test("listOverlays surfaces an anchor when present and null otherwise", () => {
  const p = makeProject();
  addTitle(p, {
    fromSec: 0,
    toSec: 2,
    text: "Anchored",
    anchor: { phrase: "big reveal", wordIds: ["w0", "w1"], stale: false },
  });
  addTitle(p, { fromSec: 2, toSec: 4, text: "Plain" });
  const o = listOverlays(p);
  assert.equal(o.titles[0].anchor?.phrase, "big reveal");
  assert.equal(o.titles[1].anchor, null);
});

test("wordSpan view carries a note on a cut word", () => {
  const p = makeProject();
  p.words[1].deleted = true;
  p.words[1].note = "stumble";
  const slice = wordSpan(p, "w1");
  assert.equal(slice.words[0].note, "stumble");
});

test("projectStatus returns agent-friendly JSON shape", () => {
  const p = makeProject({ template: "talking-head" });
  p.words[0].deleted = true;
  const s = projectStatus(p);
  assert.equal(s.slug, "test");
  assert.equal(s.template, "talking-head");
  assert.equal(s.words.total, 6);
  assert.equal(s.words.deleted, 1);
  assert.equal(s.words.kept, 5);
  assert.ok(Array.isArray(s.ranges));
  assert.ok(Array.isArray(s.overlays.broll));
  assert.equal(s.look.vignette, false);
  assert.equal(s.captions.enabled, true);
});

test("grepTranscript match times use word sample boundaries", () => {
  const p = makeProject();
  const m = grepTranscript(p, "world", { all: false }).matches[0];
  const w2 = p.words[2];
  assert.equal(m.fromSec, samplesToSec(w2.startSample));
  assert.equal(m.toSec, samplesToSec(w2.endSample));
});
