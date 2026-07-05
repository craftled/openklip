import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCleanupReport,
  fillerCandidates,
  partitionSafeCandidates,
} from "../src/cleanup.ts";
import {
  filterNeverCutCandidates,
  parseCleanupPhraseLists,
  resolveCleanupPhrases,
} from "../src/cleanup-phrases.ts";
import type { Project, Word } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";

const sec = (n: number) => Math.round(n * SAMPLE_RATE);

function word(
  id: string,
  text: string,
  startSec: number,
  endSec: number,
  deleted = false
): Word {
  return {
    id,
    text,
    startSample: sec(startSec),
    endSample: sec(endSec),
    deleted,
  };
}

function makeProject(words: Word[], overrides: Partial<Project> = {}): Project {
  return {
    version: 1,
    slug: "cleanup-phrases-test",
    source: "/tmp/source.mp4",
    proxy: "working/proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1280,
    height: 720,
    durationSamples: sec(10),
    padMs: 50,
    captions: { enabled: true, maxWords: 6, style: "boxed" },
    assets: [],
    broll: [],
    look: { vignette: false },
    zooms: [],
    titles: [],
    stills: [],
    graphics: [],
    words,
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
    },
    ...overrides,
  } as Project;
}

test("parseCleanupPhraseLists reads Always cut and Never cut lines", () => {
  const parsed = parseCleanupPhraseLists(`
Goal: demo.
Always cut: um, you know.
Never cut: OpenKlip demo.
`);
  assert.deepEqual(parsed.alwaysCut, ["um", "you know"]);
  assert.deepEqual(parsed.neverCut, ["OpenKlip demo"]);
});

test("resolveCleanupPhrases merges brief and project overrides", () => {
  const project = makeProject([], {
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
      cleanupPhrases: { alwaysCut: ["sort of"], neverCut: ["brand name"] },
    },
  });
  const resolved = resolveCleanupPhrases({
    project,
    briefText: "Always cut: um.\nNever cut: tag line.",
  });
  assert.ok(resolved.alwaysCut.includes("um"));
  assert.ok(resolved.alwaysCut.includes("sort of"));
  assert.ok(resolved.neverCut.includes("tag line"));
  assert.ok(resolved.neverCut.includes("brand name"));
});

test("never-cut phrases block filler candidates", () => {
  const words = [
    word("w0", "say", 0, 0.5),
    word("w1", "um", 0.5, 1),
    word("w2", "OpenKlip", 1, 1.5),
    word("w3", "demo", 1.5, 2),
  ];
  const project = makeProject(words);
  const briefText = "Never cut: OpenKlip demo.";
  const report = buildCleanupReport({ project, silences: null, briefText });
  const umCandidate = report.candidates.find((c) => c.wordIds.includes("w1"));
  assert.ok(umCandidate, "um should still be a candidate");
  assert.equal(
    report.candidates.some((c) => c.wordIds.includes("w2")),
    false,
    "never-cut span should not produce filler candidates"
  );
});

test("always-cut phrase you know is safe to auto-apply", () => {
  const words = [
    word("w0", "well", 0, 0.5),
    word("w1", "you", 0.5, 1),
    word("w2", "know", 1, 1.5),
    word("w3", "then", 1.5, 2),
  ];
  const project = makeProject(words);
  const briefText = "Always cut: you know.";
  const report = buildCleanupReport({ project, silences: null, briefText });
  const phraseCandidate = report.candidates.find((c) =>
    c.wordIds.includes("w1")
  );
  assert.equal(phraseCandidate?.risk, "safe");
  const { fillerIds } = partitionSafeCandidates(report.candidates);
  assert.deepEqual(fillerIds.sort(), ["w1", "w2"]);
});

test("filterNeverCutCandidates drops filler runs touching blocked ids", () => {
  const project = makeProject([word("w0", "um", 0, 0.5)]);
  const blocked = new Set(["w0"]);
  const candidates = fillerCandidates(project);
  const filtered = filterNeverCutCandidates(candidates, blocked);
  assert.equal(filtered.length, 0);
});
