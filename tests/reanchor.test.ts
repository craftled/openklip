import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project, Title } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import {
  MIN_PHRASE_OVERLAY_SEC,
  placeFromPhrase,
  reanchorOne,
  reanchorOverlay,
  reanchorProject,
} from "../src/reanchor.ts";

const sec = (n: number) => n * SAMPLE_RATE;

// One word per second, phrase-match-style builder. Each word id is `w<index>`.
function project(wordTexts: string[]): Project {
  return {
    version: 1,
    slug: "t",
    source: "/tmp/x.mp4",
    proxy: "p.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1280,
    height: 720,
    durationSamples: sec(wordTexts.length),
    padMs: 0,
    captions: { enabled: true, maxWords: 6 },
    assets: [],
    broll: [],
    titles: [],
    stills: [],
    zooms: [],
    graphics: [],
    look: { vignette: false },
    words: wordTexts.map((text, i) => ({
      id: `w${i}`,
      text,
      startSample: sec(i),
      endSample: sec(i + 1),
      deleted: false,
    })),
  };
}

function titleAnchored(
  startSample: number,
  endSample: number,
  phrase: string
): Title {
  return {
    id: "t1",
    text: "Big reveal",
    startSample,
    endSample,
    position: "lower",
    anchor: { phrase, wordIds: [], stale: false },
  };
}

test("reanchorOverlay recomputes the span from the phrase, not the stored span", () => {
  // "big reveal" is at words 4-5 (seconds 4-6). Stored span deliberately wrong (0..1).
  const p = project(["one", "two", "three", "four", "big", "reveal"]);
  const t = titleAnchored(0, sec(1), "big reveal");
  const result = reanchorOverlay(p, t);
  assert.equal(result.matched, true);
  assert.equal(result.stale, false);
  // Snapped onto the spoken run (starts at second 4, the "big" word).
  assert.equal(t.startSample, sec(4));
  // Two-word phrase already spans 2s, so the min-span clamp is a no-op here.
  assert.ok(
    t.endSample - t.startSample >= MIN_PHRASE_OVERLAY_SEC * SAMPLE_RATE
  );
  assert.deepEqual(t.anchor?.wordIds, ["w4", "w5"]);
});

test("reanchorOverlay follows the word after a re-cut shifts timing", () => {
  // Cut words 0-1, so "big reveal" run is the only kept content; its samples are
  // unchanged (cuts are metadata) but re-resolution still snaps onto the run.
  const p = project(["filler", "filler", "big", "reveal"]);
  const t = titleAnchored(0, sec(1), "big reveal");
  p.words[0].deleted = true;
  p.words[1].deleted = true;
  reanchorOverlay(p, t);
  assert.equal(t.startSample, sec(2));
  assert.equal(t.anchor?.stale, false);
  assert.deepEqual(t.anchor?.wordIds, ["w2", "w3"]);
});

test("reanchorOverlay marks stale and preserves the span when the phrase is deleted", () => {
  const p = project(["one", "big", "reveal", "four"]);
  const t = titleAnchored(sec(1), sec(3), "big reveal");
  // Delete the anchored run; kept-only matching can no longer find it.
  p.words[1].deleted = true;
  p.words[2].deleted = true;
  const result = reanchorOverlay(p, t);
  assert.equal(result.matched, false);
  assert.equal(result.stale, true);
  assert.equal(t.anchor?.stale, true);
  // Last good span is preserved.
  assert.equal(t.startSample, sec(1));
  assert.equal(t.endSample, sec(3));
});

test("reanchorOverlay clears stale and refreshes wordIds when the phrase is restored", () => {
  const p = project(["one", "big", "reveal", "four"]);
  const t = titleAnchored(sec(1), sec(3), "big reveal");
  t.anchor = { phrase: "big reveal", wordIds: [], stale: true };
  p.words[1].deleted = false;
  p.words[2].deleted = false;
  const result = reanchorOverlay(p, t);
  assert.equal(result.matched, true);
  assert.equal(t.anchor?.stale, false);
  assert.deepEqual(t.anchor?.wordIds, ["w1", "w2"]);
});

test("reanchorOverlay clamps a one-word phrase to the min span (and project duration)", () => {
  const p = project(["intro", "reveal", "outro"]);
  const t = titleAnchored(0, sec(1), "reveal");
  reanchorOverlay(p, t);
  assert.equal(t.startSample, sec(1));
  // One-word run is 1s; min-span pushes it to 2s, clamped to durationSamples (3s).
  assert.equal(
    t.endSample - t.startSample,
    MIN_PHRASE_OVERLAY_SEC * SAMPLE_RATE
  );
});

test("reanchorOverlay clamps the min span to durationSamples near the end", () => {
  const p = project(["intro", "reveal"]);
  const t = titleAnchored(0, sec(1), "reveal");
  reanchorOverlay(p, t);
  assert.equal(t.startSample, sec(1));
  // Min span would reach 3s but the project is only 2s long.
  assert.equal(t.endSample, sec(2));
});

test("placeFromPhrase mirrors the spanForPhraseOverlay contract", () => {
  const p = project(["intro", "big", "reveal", "outro"]);
  const span = placeFromPhrase(p, "big reveal");
  assert.equal(span.matched, true);
  assert.equal(span.fromSec, 1);
  assert.equal(span.toSec, 3);
  const miss = placeFromPhrase(p, "no such phrase");
  assert.equal(miss.matched, false);
  assert.equal(miss.fromSec, 0);
  assert.equal(miss.toSec, 0);
});

test("reanchorProject reports moved / stale / unchanged across all five kinds", () => {
  const p = project(["one", "big", "reveal", "four", "five", "six"]);
  // moved: stored span wrong, will snap.
  p.titles = [titleAnchored(0, sec(1), "big reveal")];
  // unchanged: stored span already correct (1..3 == phrase span clamped to min 2s).
  p.broll = [
    {
      id: "b1",
      assetId: "a",
      startSample: sec(1),
      endSample: sec(3),
      srcInSample: 0,
      anchor: { phrase: "big reveal", wordIds: ["w1", "w2"], stale: false },
    },
  ];
  // stale: phrase not present.
  p.zooms = [
    {
      id: "z1",
      startSample: sec(4),
      endSample: sec(6),
      scale: 1.2,
      rampSec: 0.5,
      anchor: { phrase: "absent words", wordIds: [], stale: false },
    },
  ];
  // un-anchored stills/graphics produce no report row and are untouched.
  p.stills = [
    {
      id: "s1",
      assetId: "a",
      startSample: sec(0),
      endSample: sec(2),
      scale: 1.2,
      focusX: 0.5,
      focusY: 0.5,
    },
  ];
  p.graphics = [];

  const results = reanchorProject(p);
  // One row per anchored overlay only (title, broll, zoom) — not the still.
  assert.equal(results.length, 3);
  const byId = new Map(results.map((r) => [r.id, r]));
  assert.equal(byId.get("t1")?.status, "moved");
  assert.equal(byId.get("b1")?.status, "unchanged");
  assert.equal(byId.get("z1")?.status, "stale");
  // The still was never anchored and is left exactly where it was.
  assert.equal(p.stills[0].startSample, sec(0));
});

test("reanchorOne re-resolves a single overlay by id", () => {
  const p = project(["one", "two", "big", "reveal"]);
  p.titles = [titleAnchored(0, sec(1), "big reveal")];
  const result = reanchorOne(p, "t1");
  assert.equal(result.id, "t1");
  assert.equal(result.status, "moved");
  assert.equal(p.titles[0].startSample, sec(2));
});
