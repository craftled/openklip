import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { grepTranscript } from "../src/query.ts";
import { phraseSearchMatches } from "../web/lib/phrase-search.ts";

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

const FIXTURE = ["Hello,", "there", "world.", "hello", "there"];

test("phraseSearchMatches maps runs to word-index ranges", () => {
  const p = project(FIXTURE);
  const matches = phraseSearchMatches(p, "hello there", { mode: "kept" });
  assert.equal(matches.length, 2);
  assert.deepEqual([...matches[0].range], [0, 1]);
  assert.deepEqual(matches[0].ids, ["w0", "w1"]);
  assert.deepEqual([...matches[1].range], [3, 4]);
  assert.deepEqual(matches[1].ids, ["w3", "w4"]);
});

test("phraseSearchMatches spans are identical to grepTranscript (CLI parity)", () => {
  const p = project(FIXTURE);
  const matches = phraseSearchMatches(p, "hello there", { mode: "kept" });
  const grep = grepTranscript(p, "hello there", { all: true }).matches;
  assert.equal(matches.length, grep.length);
  for (const [i, m] of matches.entries()) {
    assert.deepEqual(
      { ids: m.ids, fromSec: m.fromSec, toSec: m.toSec, text: m.text },
      {
        ids: grep[i].ids,
        fromSec: grep[i].fromSec,
        toSec: grep[i].toSec,
        text: grep[i].text,
      }
    );
  }
});

test("cut mode finds runs among deleted words, kept mode does not", () => {
  const p = project(FIXTURE);
  p.words[3].deleted = true;
  p.words[4].deleted = true;

  const kept = phraseSearchMatches(p, "hello there", { mode: "kept" });
  assert.equal(kept.length, 1);
  assert.deepEqual([...kept[0].range], [0, 1]);

  const cut = phraseSearchMatches(p, "hello there", { mode: "cut" });
  assert.equal(cut.length, 1);
  assert.deepEqual([...cut[0].range], [3, 4]);
  assert.deepEqual(cut[0].ids, ["w3", "w4"]);
});

test("empty query and unmatched phrase return no matches", () => {
  const p = project(FIXTURE);
  assert.deepEqual(phraseSearchMatches(p, "", { mode: "kept" }), []);
  assert.deepEqual(phraseSearchMatches(p, "   ", { mode: "kept" }), []);
  assert.deepEqual(
    phraseSearchMatches(p, "completely absent", { mode: "kept" }),
    []
  );
  assert.deepEqual(phraseSearchMatches(p, "absent", { mode: "cut" }), []);
});
