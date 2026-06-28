import assert from "node:assert/strict";
import { test } from "node:test";
import { cutByText } from "../src/actions.ts";
import type { Project } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { findPhraseRuns, normalizeText } from "../src/phrase-match.ts";

function words(texts: string[]): Project["words"] {
  const sec = (n: number) => n * SAMPLE_RATE;
  return texts.map((text, i) => ({
    id: `w${i}`,
    text,
    startSample: sec(i),
    endSample: sec(i + 1),
    deleted: false,
  }));
}

function project(wordTexts: string[]): Project {
  const sec = (n: number) => n * SAMPLE_RATE;
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
    look: { vignette: false },
    words: words(wordTexts),
  };
}

test("normalizeText strips punctuation and case", () => {
  assert.equal(normalizeText("Hello, World!"), "hello world");
});

test("findPhraseRuns returns non-mutating matches", () => {
  const p = project(["Hello", "there", "friend"]);
  const runs = findPhraseRuns(p, "hello there");
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].ids, ["w0", "w1"]);
  assert.equal(
    p.words.every((w) => !w.deleted),
    true
  );
});

test("cutByText still mutates via shared phrase matcher", () => {
  const p = project(["you", "know", "this"]);
  const r = cutByText(p, "you know");
  assert.equal(r.matched, true);
  assert.equal(p.words[0].deleted, true);
  assert.equal(p.words[1].deleted, true);
});
