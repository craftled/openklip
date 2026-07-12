import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDeadAir,
  applyCleanupFromReport,
  cutWords,
  removeDeadAir,
} from "../src/actions.ts";
import type { SilenceSpan } from "../src/audio-analysis-core.ts";
import {
  buildCleanupReport,
  type CleanupCandidate,
  categorizeAgentCutIds,
  cleanupReport,
  deadAirCandidates,
  fillerCandidates,
  partitionApplyCandidates,
  partitionSafeCandidates,
  repeatedSequenceCandidates,
  resolveCleanupConfig,
} from "../src/cleanup.ts";
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
    slug: "cleanup-test",
    source: "/tmp/source.mp4",
    proxy: "working/proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1280,
    height: 720,
    durationSamples: sec(30),
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
    motion: { fadeMs: 180, heroFadeMs: 320, slideFrac: 0.04, speed: 1 },
    ...overrides,
  } as Project;
}

// ── fillerCandidates ─────────────────────────────────────────────────────

test("fillerCandidates: an isolated core token is a safe candidate", () => {
  const words = [
    word("w0", "So", 0, 0.5),
    word("w1", "um", 0.5, 1.0),
    word("w2", "hello", 1.0, 1.5),
  ];
  const cands = fillerCandidates(makeProject(words));
  assert.equal(cands.length, 1);
  assert.equal(cands[0].id, "f-w1");
  assert.equal(cands[0].kind, "filler");
  assert.equal(cands[0].risk, "safe");
  assert.deepEqual(cands[0].wordIds, ["w1"]);
  assert.match(cands[0].reason, /isolated 'um'/);
});

test("fillerCandidates: adjacent core filler words merge into one 'repeated filler' candidate", () => {
  const words = [
    word("w0", "hello", 0, 0.5),
    word("w1", "uh", 0.5, 1.0),
    word("w2", "um", 1.0, 1.5),
    word("w3", "world", 1.5, 2.0),
  ];
  const cands = fillerCandidates(makeProject(words));
  assert.equal(cands.length, 1);
  assert.equal(cands[0].id, "f-w1");
  assert.deepEqual(cands[0].wordIds, ["w1", "w2"]);
  assert.equal(cands[0].risk, "safe");
  assert.match(cands[0].reason, /repeated filler/);
});

test("fillerCandidates: a lone 'like' is NOT flagged", () => {
  const words = [
    word("w0", "I", 0, 0.5),
    word("w1", "like", 0.5, 1.0),
    word("w2", "coffee", 1.0, 1.5),
  ];
  const cands = fillerCandidates(makeProject(words));
  assert.equal(cands.length, 0);
});

test("fillerCandidates: 'like like' repeated is flagged review", () => {
  const words = [
    word("w0", "it's", 0, 0.5),
    word("w1", "like", 0.5, 1.0),
    word("w2", "like", 1.0, 1.5),
    word("w3", "great", 1.5, 2.0),
  ];
  const cands = fillerCandidates(makeProject(words));
  assert.equal(cands.length, 1);
  assert.equal(cands[0].id, "f-w1");
  assert.equal(cands[0].risk, "review");
  assert.deepEqual(cands[0].wordIds, ["w1", "w2"]);
});

test("fillerCandidates: a lone 'so' is NOT flagged, but 'so so' is review", () => {
  const alone = makeProject([
    word("w0", "and", 0, 0.5),
    word("w1", "so", 0.5, 1.0),
    word("w2", "then", 1.0, 1.5),
  ]);
  assert.equal(fillerCandidates(alone).length, 0);

  const repeated = makeProject([
    word("w0", "and", 0, 0.5),
    word("w1", "so", 0.5, 1.0),
    word("w2", "so", 1.0, 1.5),
    word("w3", "then", 1.5, 2.0),
  ]);
  const cands = fillerCandidates(repeated);
  assert.equal(cands.length, 1);
  assert.equal(cands[0].risk, "review");
  assert.deepEqual(cands[0].wordIds, ["w1", "w2"]);
});

test("fillerCandidates: default multi-word phrases are flagged review", () => {
  const words = [
    word("w0", "you", 0, 0.5),
    word("w1", "know", 0.5, 1.0),
    word("w2", "kind", 1.0, 1.5),
    word("w3", "of", 1.5, 2.0),
    word("w4", "sort", 2.0, 2.5),
    word("w5", "of", 2.5, 3.0),
    word("w6", "I", 3.0, 3.5),
    word("w7", "mean", 3.5, 4.0),
  ];
  const cands = fillerCandidates(makeProject(words));
  const byId = new Map(cands.map((c) => [c.id, c]));
  assert.equal(cands.length, 4);
  assert.equal(byId.get("f-w0")?.risk, "review");
  assert.equal(byId.get("f-w2")?.risk, "review");
  assert.equal(byId.get("f-w4")?.risk, "review");
  assert.equal(byId.get("f-w6")?.risk, "review");
  assert.deepEqual(byId.get("f-w0")?.wordIds, ["w0", "w1"]);
});

test("fillerCandidates: deleted words are ignored entirely", () => {
  const words = [
    word("w0", "hello", 0, 0.5),
    word("w1", "um", 0.5, 1.0, true),
    word("w2", "world", 1.0, 1.5),
  ];
  const cands = fillerCandidates(makeProject(words));
  assert.equal(cands.length, 0);
});

test("fillerCandidates: ids are deterministic across repeated calls", () => {
  const words = [word("w0", "um", 0, 0.5), word("w1", "hi", 0.5, 1.0)];
  const p = makeProject(words);
  const a = fillerCandidates(p).map((c) => c.id);
  const b = fillerCandidates(p).map((c) => c.id);
  assert.deepEqual(a, b);
});

// ── deadAirCandidates ────────────────────────────────────────────────────

test("deadAirCandidates: a long gap between consecutive kept words yields a candidate", () => {
  const words = [word("w0", "so", 0, 0.5), word("w1", "yeah", 2.5, 3.0)];
  const silences: SilenceSpan[] = [{ startSec: 0.5, endSec: 2.5 }];
  const cands = deadAirCandidates(makeProject(words), silences);
  assert.equal(cands.length, 1);
  const c = cands[0];
  assert.equal(c.kind, "dead-air");
  assert.deepEqual(c.wordIds, []);
  // Shrunk by the default 0.15s pad on each side.
  assert.ok(Math.abs(c.startSec - 0.65) < 1e-9);
  assert.ok(Math.abs(c.endSec - 2.35) < 1e-9);
  assert.equal(c.risk, "safe"); // raw gap 2.0s > 1.2s
  assert.ok(Math.abs(c.estSavedSec - 1.7) < 1e-9);
});

test("deadAirCandidates: risk is 'review' when the raw gap is at or under 1.2s", () => {
  const words = [word("w0", "pause", 0, 0.5), word("w1", "back", 1.4, 1.9)];
  const silences: SilenceSpan[] = [{ startSec: 0.5, endSec: 1.4 }];
  const cands = deadAirCandidates(makeProject(words), silences);
  assert.equal(cands.length, 1);
  assert.equal(cands[0].risk, "review");
});

test("deadAirCandidates: respects a custom minSec (short gaps dropped)", () => {
  const words = [word("w0", "so", 0, 0.5), word("w1", "yeah", 2.5, 3.0)];
  const silences: SilenceSpan[] = [{ startSec: 0.5, endSec: 2.5 }];
  const cands = deadAirCandidates(makeProject(words), silences, {
    minSec: 2.5,
  });
  assert.equal(cands.length, 0);
});

test("deadAirCandidates: respects a custom keepPadSec", () => {
  const words = [word("w0", "so", 0, 0.5), word("w1", "yeah", 2.5, 3.0)];
  const silences: SilenceSpan[] = [{ startSec: 0.5, endSec: 2.5 }];
  const cands = deadAirCandidates(makeProject(words), silences, {
    keepPadSec: 0.5,
  });
  assert.equal(cands.length, 1);
  assert.ok(Math.abs(cands[0].startSec - 1.0) < 1e-9);
  assert.ok(Math.abs(cands[0].endSec - 2.0) < 1e-9);
});

test("deadAirCandidates: a gap that spans a deleted word is not a candidate (not fully inside a kept run)", () => {
  const words = [
    word("w0", "great", 0, 0.5),
    word("w1", "stuff", 0.5, 1.0, true),
    word("w2", "and", 1.0, 1.5),
  ];
  const silences: SilenceSpan[] = [{ startSec: 0.5, endSec: 1.0 }];
  const cands = deadAirCandidates(makeProject(words), silences);
  assert.equal(cands.length, 0);
});

test("deadAirCandidates: silence outside any word-to-word gap is ignored", () => {
  const words = [word("w0", "so", 0, 0.5), word("w1", "yeah", 5.0, 5.5)];
  const silences: SilenceSpan[] = [{ startSec: 10, endSec: 12 }];
  const cands = deadAirCandidates(makeProject(words), silences);
  assert.equal(cands.length, 0);
});

// F4(a): idempotency - a silence already covered by a REGISTERED (applied)
// dead-air span must not resurface as a fresh candidate.
test("deadAirCandidates: skips a silence that overlaps an already-registered dead-air span", () => {
  const words = [word("w0", "so", 0, 0.5), word("w1", "yeah", 2.5, 3.0)];
  const silences: SilenceSpan[] = [{ startSec: 0.5, endSec: 2.5 }];
  const p = makeProject(words, {
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [{ id: "da1", startSample: sec(0.5), endSample: sec(2.5) }],
    },
  });
  assert.equal(deadAirCandidates(p, silences).length, 0);
});

test("deadAirCandidates: a registered span that does not overlap the silence leaves the candidate untouched", () => {
  const words = [word("w0", "so", 0, 0.5), word("w1", "yeah", 2.5, 3.0)];
  const silences: SilenceSpan[] = [{ startSec: 0.5, endSec: 2.5 }];
  const p = makeProject(words, {
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [{ id: "da1", startSample: sec(10), endSample: sec(11) }],
    },
  });
  assert.equal(deadAirCandidates(p, silences).length, 1);
});

// ── cleanupReport ────────────────────────────────────────────────────────

test("cleanupReport: totals filler and dead-air candidates and sums estSavedSec", () => {
  const words = [
    word("w0", "so", 0, 0.5),
    word("w1", "um", 0.5, 1.0),
    word("w2", "hello", 1.0, 1.5),
    word("w3", "yeah", 4.0, 4.5),
  ];
  const silences: SilenceSpan[] = [{ startSec: 1.5, endSec: 4.0 }];
  const report = cleanupReport(makeProject(words), silences);
  assert.equal(report.fillerCount, 1);
  assert.equal(report.deadAirCount, 1);
  assert.equal(report.candidates.length, 2);
  const expectedTotal = report.candidates.reduce(
    (s, c) => s + c.estSavedSec,
    0
  );
  assert.ok(Math.abs(report.estSavedSec - expectedTotal) < 1e-9);
});

test("cleanupReport: a candidate near an overlay span is forced to review with a warning", () => {
  const words = [word("w0", "hi", 0, 0.5), word("w1", "um", 0.5, 1.0)];
  const p = makeProject(words, {
    titles: [
      {
        id: "t1",
        text: "Card",
        startSample: sec(1.1),
        endSample: sec(2.0),
        position: "lower",
      },
    ],
  });
  const report = cleanupReport(p, []);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].risk, "review");
  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0], /within 0\.3s of an overlay span/);
});

test("cleanupReport: no warnings when nothing is near an overlay", () => {
  const words = [word("w0", "hi", 0, 0.5), word("w1", "um", 0.5, 1.0)];
  const p = makeProject(words, {
    titles: [
      {
        id: "t1",
        text: "Card",
        startSample: sec(20),
        endSample: sec(21),
        position: "lower",
      },
    ],
  });
  const report = cleanupReport(p, []);
  assert.equal(report.candidates[0].risk, "safe");
  assert.equal(report.warnings.length, 0);
});

test("cleanupReport: candidates are typed CleanupCandidate with all required fields", () => {
  const words = [word("w0", "um", 0, 0.5), word("w1", "hi", 0.5, 1.0)];
  const report = cleanupReport(makeProject(words), []);
  const c: CleanupCandidate = report.candidates[0];
  assert.equal(typeof c.id, "string");
  assert.ok(c.kind === "filler" || c.kind === "dead-air");
  assert.ok(Array.isArray(c.wordIds));
  assert.equal(typeof c.startSec, "number");
  assert.equal(typeof c.endSec, "number");
  assert.equal(typeof c.text, "string");
  assert.equal(typeof c.reason, "string");
  assert.ok(c.risk === "safe" || c.risk === "review");
  assert.equal(typeof c.estSavedSec, "number");
});

// ── partitionSafeCandidates (M2) ─────────────────────────────────────────

test("partitionSafeCandidates: splits safe candidates into filler wordIds and dead-air spans, dropping review", () => {
  const words = [
    word("w0", "so", 0, 0.5),
    word("w1", "um", 0.5, 1.0), // isolated filler -> safe
    word("w2", "like", 1.0, 1.5),
    word("w3", "like", 1.5, 2.0), // repeated "like" -> review
    word("w4", "hello", 2.0, 2.5),
  ];
  const candidates = fillerCandidates(makeProject(words));
  const { fillerIds, deadAirSpans } = partitionSafeCandidates(candidates);
  assert.deepEqual(fillerIds, ["w1"]);
  assert.deepEqual(deadAirSpans, []);
});

// T3 / F4 round-trip: applying every safe candidate through the SAME
// partition + registry actions the CLI/GUI use must leave nothing behind for
// a fresh report to (re)discover - proves both partitionSafeCandidates (M2)
// and the dead-air idempotency fix (F4a: deadAirCandidates skips silences
// already covered by a registered span).
test("cleanup apply round-trip: partitionSafeCandidates -> cut + addDeadAir -> a fresh report shows 0 remaining candidates", () => {
  const words = [
    word("w0", "so", 0, 0.5),
    word("w1", "um", 0.5, 1.0), // isolated filler -> safe
    word("w2", "hello", 1.0, 1.5),
    word("w3", "yeah", 4.0, 4.5), // long silent gap after -> safe dead-air
  ];
  const silences: SilenceSpan[] = [{ startSec: 1.5, endSec: 4.0 }];
  const project = makeProject(words);

  const before = cleanupReport(project, silences);
  const { fillerIds, deadAirSpans } = partitionSafeCandidates(
    before.candidates
  );
  assert.ok(fillerIds.length > 0, "expected at least one safe filler");
  assert.ok(
    deadAirSpans.length > 0,
    "expected at least one safe dead-air span"
  );

  cutWords(project, fillerIds, true, "cleanup: apply all safe");
  addDeadAir(project, deadAirSpans);

  const after = cleanupReport(project, silences);
  assert.equal(after.candidates.length, 0);
});

// ── category field ───────────────────────────────────────────────────────

test("fillerCandidates: core filler maps to hesitation category", () => {
  const words = [word("w0", "um", 0, 0.5), word("w1", "hi", 0.5, 1.0)];
  const cands = fillerCandidates(makeProject(words));
  assert.equal(cands[0].category, "hesitation");
});

test("fillerCandidates: default multi-word phrases map to hedging category", () => {
  const words = [
    word("w0", "you", 0, 0.5),
    word("w1", "know", 0.5, 1.0),
    word("w2", "then", 1.0, 1.5),
  ];
  const cands = fillerCandidates(makeProject(words));
  assert.equal(cands[0].category, "hedging");
});

test("fillerCandidates: repeated like/so maps to repeat category", () => {
  const words = [
    word("w0", "it's", 0, 0.5),
    word("w1", "like", 0.5, 1.0),
    word("w2", "like", 1.0, 1.5),
    word("w3", "great", 1.5, 2.0),
  ];
  const cands = fillerCandidates(makeProject(words));
  assert.equal(cands[0].category, "repeat");
});

test("deadAirCandidates: maps to dead-air category", () => {
  const words = [word("w0", "so", 0, 0.5), word("w1", "yeah", 2.5, 3.0)];
  const silences: SilenceSpan[] = [{ startSec: 0.5, endSec: 2.5 }];
  const cands = deadAirCandidates(makeProject(words), silences);
  assert.equal(cands[0].category, "dead-air");
});

// ── repeatedSequenceCandidates ───────────────────────────────────────────

test("repeatedSequenceCandidates: do you do you bigram cuts first keeps last", () => {
  const words = [
    word("w0", "do", 0, 0.3),
    word("w1", "you", 0.3, 0.6),
    word("w2", "do", 0.7, 1.0),
    word("w3", "you", 1.0, 1.3),
    word("w4", "want", 1.3, 1.6),
  ];
  const kept = words.filter((w) => !w.deleted);
  const cands = repeatedSequenceCandidates(kept, new Set());
  assert.equal(cands.length, 1);
  assert.deepEqual(cands[0].wordIds, ["w0", "w1"]);
  assert.equal(cands[0].category, "repeat");
  assert.equal(cands[0].risk, "review");
  assert.match(cands[0].reason, /repeated "do you"/);
});

test("repeatedSequenceCandidates: the the unigram cuts first keeps last", () => {
  const words = [
    word("w0", "the", 0, 0.3),
    word("w1", "the", 0.35, 0.6),
    word("w2", "cat", 0.6, 0.9),
  ];
  const cands = repeatedSequenceCandidates(words, new Set());
  assert.equal(cands.length, 1);
  assert.deepEqual(cands[0].wordIds, ["w0"]);
  assert.match(cands[0].reason, /repeated "the"/);
});

test("repeatedSequenceCandidates: trigram repeat cuts prior occurrences", () => {
  const words = [
    word("w0", "I", 0, 0.2),
    word("w1", "think", 0.2, 0.4),
    word("w2", "that", 0.4, 0.6),
    word("w3", "I", 0.65, 0.85),
    word("w4", "think", 0.85, 1.05),
    word("w5", "that", 1.05, 1.25),
    word("w6", "I", 1.3, 1.5),
    word("w7", "think", 1.5, 1.7),
    word("w8", "that", 1.7, 1.9),
    word("w9", "works", 1.9, 2.1),
  ];
  const cands = repeatedSequenceCandidates(words, new Set());
  assert.equal(cands.length, 1);
  assert.deepEqual(cands[0].wordIds, ["w0", "w1", "w2", "w3", "w4", "w5"]);
});

test("repeatedSequenceCandidates: prefers longest n-gram over nested unigrams", () => {
  const words = [
    word("w0", "do", 0, 0.3),
    word("w1", "you", 0.3, 0.6),
    word("w2", "do", 0.7, 1.0),
    word("w3", "you", 1.0, 1.3),
  ];
  const cands = repeatedSequenceCandidates(words, new Set());
  assert.equal(cands.length, 1);
  assert.deepEqual(cands[0].wordIds, ["w0", "w1"]);
});

test("repeatedSequenceCandidates: gap over 0.6s between repetitions is not flagged", () => {
  const words = [
    word("w0", "do", 0, 0.3),
    word("w1", "do", 1.0, 1.3),
    word("w2", "it", 1.3, 1.6),
  ];
  const cands = repeatedSequenceCandidates(words, new Set());
  assert.equal(cands.length, 0);
});

test("repeatedSequenceCandidates: skips word ids already covered by core filler", () => {
  const words = [
    word("w0", "um", 0, 0.3),
    word("w1", "um", 0.35, 0.6),
    word("w2", "hi", 0.6, 0.9),
  ];
  const blocked = new Set(["w0", "w1"]);
  const cands = repeatedSequenceCandidates(words, blocked);
  assert.equal(cands.length, 0);
});

test("cleanupReport: includes repeat detector candidates merged with filler", () => {
  const words = [
    word("w0", "do", 0, 0.3),
    word("w1", "you", 0.3, 0.6),
    word("w2", "do", 0.7, 1.0),
    word("w3", "you", 1.0, 1.3),
    word("w4", "want", 1.3, 1.6),
  ];
  const report = cleanupReport(makeProject(words), []);
  const repeatCand = report.candidates.find((c) =>
    c.reason.includes('repeated "do you"')
  );
  assert.ok(repeatCand);
  assert.equal(repeatCand.category, "repeat");
});

// ── cleanup config ───────────────────────────────────────────────────────

test("resolveCleanupConfig: defaults when project has no cleanup key", () => {
  const project = makeProject([]);
  const config = resolveCleanupConfig(project);
  assert.equal(config.minSec, 0.7);
  assert.equal(config.keepPadSec, 0.15);
  assert.equal(config.categories.hesitation, true);
  assert.equal(config.categories.hedging, false);
  assert.equal(config.categories.repeat, false);
});

test("resolveCleanupConfig: project overrides beat defaults and clamps ranges", () => {
  const project = makeProject([], {
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
      cleanup: {
        minSec: 10,
        keepPadSec: 2,
        categories: { hedging: true, repeat: true },
      },
    },
  });
  const config = resolveCleanupConfig(project);
  assert.equal(config.minSec, 5);
  assert.equal(config.keepPadSec, 1);
  assert.equal(config.categories.hedging, true);
  assert.equal(config.categories.repeat, true);
  assert.equal(config.categories.hesitation, true);
});

test("buildCleanupReport: includes effective config and per-category counts", () => {
  const words = [
    word("w0", "um", 0, 0.5),
    word("w1", "you", 0.5, 1.0),
    word("w2", "know", 1.0, 1.5),
    word("w3", "yeah", 4.0, 4.5),
  ];
  const silences: SilenceSpan[] = [{ startSec: 1.5, endSec: 4.0 }];
  const report = buildCleanupReport({
    project: makeProject(words),
    silences,
  });
  assert.ok(report.config);
  assert.equal(report.config.minSec, 0.7);
  assert.equal(report.categoryCounts.hesitation, 1);
  assert.equal(report.categoryCounts.hedging, 1);
  assert.equal(report.categoryCounts["dead-air"], 1);
});

// ── partitionApplyCandidates / applyCleanupFromReport ────────────────────

test("partitionApplyCandidates: enabled mode applies enabled categories at any risk", () => {
  const words = [
    word("w0", "like", 0, 0.5),
    word("w1", "like", 0.5, 1.0),
    word("w2", "you", 1.0, 1.5),
    word("w3", "know", 1.5, 2.0),
  ];
  const report = cleanupReport(makeProject(words), []);
  const config = resolveCleanupConfig(makeProject([]));
  config.categories.repeat = true;
  config.categories.hedging = true;
  const { fillerIds } = partitionApplyCandidates(
    report.candidates,
    "enabled",
    config
  );
  assert.deepEqual(fillerIds.sort(), ["w0", "w1", "w2", "w3"]);
});

test("applyCleanupFromReport: safe mode matches partitionSafeCandidates legacy result", () => {
  const words = [
    word("w0", "so", 0, 0.5),
    word("w1", "um", 0.5, 1.0),
    word("w2", "like", 1.0, 1.5),
    word("w3", "like", 1.5, 2.0),
    word("w4", "hello", 2.0, 2.5),
    word("w5", "yeah", 4.0, 4.5),
  ];
  const silences: SilenceSpan[] = [{ startSec: 2.5, endSec: 4.0 }];
  const project = makeProject(words);
  const report = cleanupReport(project, silences);
  const legacy = partitionSafeCandidates(report.candidates);
  const applied = applyCleanupFromReport(project, report, "safe");
  assert.deepEqual(applied.wordIds.sort(), legacy.fillerIds.sort());
  assert.equal(applied.deadAirSpanIds.length, legacy.deadAirSpans.length);
});

test("applyCleanupFromReport: enabled mode applies review dead-air and returns restorable ids", () => {
  const words = [
    word("w0", "um", 0, 0.5),
    word("w1", "hello", 0.5, 1.0),
    word("w2", "yeah", 1.8, 2.3),
  ];
  const silences: SilenceSpan[] = [{ startSec: 1.0, endSec: 1.8 }];
  const project = makeProject(words, {
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
      cleanup: { categories: { hesitation: true } },
    },
  });
  const report = buildCleanupReport({ project, silences });
  const applied = applyCleanupFromReport(project, report, "enabled");
  assert.deepEqual(applied.wordIds, ["w0"]);
  assert.equal(applied.deadAirSpanIds.length, 1);
  assert.equal(applied.extendedSpanIds.length, 0);
  assert.equal(project.words.find((w) => w.id === "w0")?.deleted, true);
  assert.equal(project.cuts.deadAir.length, 1);
  cutWords(project, applied.wordIds, false);
  for (const id of applied.deadAirSpanIds) {
    removeDeadAir(project, id);
  }
  assert.equal(project.words.find((w) => w.id === "w0")?.deleted, false);
  assert.equal(project.cuts.deadAir.length, 0);
});

// ── categorizeAgentCutIds (AI pass classifier) ───────────────────────────

test("categorizeAgentCutIds: core filler id maps to hesitation", () => {
  const words = [word("w0", "um", 0, 0.5), word("w1", "hello", 0.5, 1.0)];
  const result = categorizeAgentCutIds(makeProject(words), ["w0"]);
  assert.deepEqual(result.hesitation, ["w0"]);
  assert.deepEqual(result.hedging, []);
  assert.deepEqual(result.repeat, []);
});

test('categorizeAgentCutIds: lone "like" maps to hedging', () => {
  const words = [word("w0", "like", 0, 0.5), word("w1", "hello", 0.5, 1.0)];
  const result = categorizeAgentCutIds(makeProject(words), ["w0"]);
  assert.deepEqual(result.hesitation, []);
  assert.deepEqual(result.hedging, ["w0"]);
  assert.deepEqual(result.repeat, []);
});

test('categorizeAgentCutIds: word inside "you know" maps to hedging', () => {
  const words = [
    word("w0", "well", 0, 0.5),
    word("w1", "you", 0.5, 1.0),
    word("w2", "know", 1.0, 1.5),
    word("w3", "yeah", 1.5, 2.0),
  ];
  const result = categorizeAgentCutIds(makeProject(words), ["w1", "w2"]);
  assert.deepEqual(result.hesitation, []);
  assert.deepEqual(result.hedging, ["w1", "w2"]);
  assert.deepEqual(result.repeat, []);
});

test("categorizeAgentCutIds: content word maps to repeat", () => {
  const words = [
    word("w0", "basically", 0, 0.5),
    word("w1", "we", 0.5, 1.0),
    word("w2", "start", 1.0, 1.5),
  ];
  const result = categorizeAgentCutIds(makeProject(words), ["w0"]);
  assert.deepEqual(result.hesitation, []);
  assert.deepEqual(result.hedging, []);
  assert.deepEqual(result.repeat, ["w0"]);
});

test("categorizeAgentCutIds: unknown ids are dropped", () => {
  const words = [word("w0", "um", 0, 0.5)];
  const result = categorizeAgentCutIds(makeProject(words), ["w99", "w0"]);
  assert.deepEqual(result.hesitation, ["w0"]);
  assert.deepEqual(result.hedging, []);
  assert.deepEqual(result.repeat, []);
});

test("categorizeAgentCutIds: dedupes ids within buckets", () => {
  const words = [word("w0", "um", 0, 0.5)];
  const result = categorizeAgentCutIds(makeProject(words), ["w0", "w0", "w0"]);
  assert.deepEqual(result.hesitation, ["w0"]);
  assert.deepEqual(result.hedging, []);
  assert.deepEqual(result.repeat, []);
});

test("categorizeAgentCutIds: custom alwaysCut phrase word maps to hedging", () => {
  const words = [
    word("w0", "sort", 0, 0.5),
    word("w1", "of", 0.5, 1.0),
    word("w2", "great", 1.0, 1.5),
  ];
  const project = makeProject(words, {
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
      cleanupPhrases: { alwaysCut: ["sort of"], neverCut: [] },
    },
  });
  const result = categorizeAgentCutIds(project, ["w0", "w1"]);
  assert.deepEqual(result.hesitation, []);
  assert.deepEqual(result.hedging, ["w0", "w1"]);
  assert.deepEqual(result.repeat, []);
});

// ── FIX1: coalescing undo, phrase dedupe, repeat convergence, MAX_NGRAM ──

test("applyCleanupFromReport: adjacent dead-air extends existing span without undo data loss", () => {
  const project = makeProject(
    [word("w0", "before", 0, 3.5), word("w1", "after", 5.0, 6.0)],
    {
      cuts: {
        snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
        deadAir: [],
        cleanup: { keepPadSec: 0, minSec: 0.7 },
      },
    }
  );
  const [existing] = addDeadAir(project, [{ fromSec: 5.0, toSec: 6.0 }]);
  const existingId = existing.span.id;
  const report = buildCleanupReport({
    project,
    silences: [{ startSec: 3.5, endSec: 5.0 }],
  });
  const applied = applyCleanupFromReport(project, report, "safe");
  assert.deepEqual(applied.deadAirSpanIds, []);
  assert.deepEqual(applied.extendedSpanIds, [existingId]);
  for (const id of applied.deadAirSpanIds) {
    removeDeadAir(project, id);
  }
  assert.equal(project.cuts.deadAir.length, 1);
  assert.equal(project.cuts.deadAir[0].id, existingId);
  assert.equal(project.cuts.deadAir[0].startSample, sec(3.5));
  assert.equal(project.cuts.deadAir[0].endSample, sec(6.0));
});

test("applyCleanupFromReport: fresh dead-air spans stay in deadAirSpanIds for undo", () => {
  const project = makeProject([
    word("w0", "hello", 0, 1.0),
    word("w1", "world", 3.0, 4.0),
  ]);
  const report = buildCleanupReport({
    project,
    silences: [{ startSec: 1.0, endSec: 3.0 }],
  });
  const applied = applyCleanupFromReport(project, report, "enabled");
  assert.equal(applied.deadAirSpanIds.length, 1);
  assert.equal(applied.extendedSpanIds.length, 0);
  const createdId = applied.deadAirSpanIds[0];
  removeDeadAir(project, createdId);
  assert.equal(project.cuts.deadAir.length, 0);
});

test('fillerCandidates: "you know you know" avoids double-claim on the same words', () => {
  const words = [
    word("w0", "you", 0, 0.4),
    word("w1", "know", 0.4, 0.8),
    word("w2", "you", 0.8, 1.2),
    word("w3", "know", 1.2, 1.6),
    word("w4", "this", 1.6, 2.0),
    word("w5", "is", 2.0, 2.4),
    word("w6", "important", 2.4, 3.0),
  ];
  const project = makeProject(words, {
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
      cleanup: {
        categories: { hedging: true, repeat: true, hesitation: true },
      },
    },
  });
  const report = buildCleanupReport({ project, silences: [] });
  const hedging = report.candidates.filter((c) => c.category === "hedging");
  const repeat = report.candidates.filter((c) => c.category === "repeat");
  assert.equal(hedging.length, 1);
  assert.equal(repeat.length, 1);
  assert.deepEqual(repeat[0].wordIds, ["w0", "w1"]);
  assert.deepEqual(hedging[0].wordIds, ["w2", "w3"]);
  assert.equal(report.categoryCounts.hedging, 1);
  assert.equal(report.categoryCounts.repeat, 1);
  const config = resolveCleanupConfig(project);
  config.categories.hedging = true;
  config.categories.repeat = true;
  const { fillerIds } = partitionApplyCandidates(
    report.candidates,
    "enabled",
    config
  );
  assert.deepEqual(fillerIds, ["w0", "w1", "w2", "w3"]);
});

test("cleanup-apply enabled mode converges on you-um-you-know fixture in three passes", () => {
  const project = makeProject(
    [
      word("w0", "you", 0, 0.4),
      word("w1", "um", 0.4, 0.8),
      word("w2", "you", 0.8, 1.2),
      word("w3", "know", 1.2, 1.6),
    ],
    {
      cuts: {
        snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
        deadAir: [],
        cleanup: {
          categories: { hesitation: true, repeat: true, hedging: false },
        },
      },
    }
  );
  const config = resolveCleanupConfig(project);
  const first = applyCleanupFromReport(
    project,
    buildCleanupReport({ project, silences: [] }),
    "enabled"
  );
  assert.deepEqual(first.wordIds, ["w1"]);
  const second = applyCleanupFromReport(
    project,
    buildCleanupReport({ project, silences: [] }),
    "enabled"
  );
  assert.deepEqual(second.wordIds, ["w0"]);
  const third = applyCleanupFromReport(
    project,
    buildCleanupReport({ project, silences: [] }),
    "enabled"
  );
  assert.deepEqual(third.wordIds, []);
  assert.equal(config.categories.hesitation, true);
});

test("repeatedSequenceCandidates: 5-gram false start cuts first occurrence keeps last", () => {
  const words = [
    word("w0", "I", 0, 0.2),
    word("w1", "want", 0.2, 0.4),
    word("w2", "to", 0.4, 0.6),
    word("w3", "show", 0.6, 0.8),
    word("w4", "you", 0.8, 1.0),
    word("w5", "I", 1.05, 1.25),
    word("w6", "want", 1.25, 1.45),
    word("w7", "to", 1.45, 1.65),
    word("w8", "show", 1.65, 1.85),
    word("w9", "you", 1.85, 2.05),
    word("w10", "the", 2.05, 2.25),
    word("w11", "new", 2.25, 2.45),
    word("w12", "feature", 2.45, 2.7),
  ];
  const cands = repeatedSequenceCandidates(words, new Set());
  assert.equal(cands.length, 1);
  assert.deepEqual(cands[0].wordIds, ["w0", "w1", "w2", "w3", "w4"]);
});

test("repeatedSequenceCandidates: 7-gram repeat is not matched at MAX_NGRAM cap", () => {
  const words = Array.from({ length: 14 }, (_, i) =>
    word(
      `w${i}`,
      i < 7
        ? ["a", "b", "c", "d", "e", "f", "g"][i]
        : ["a", "b", "c", "d", "e", "f", "g"][i - 7],
      i * 0.3,
      i * 0.3 + 0.25
    )
  );
  const cands = repeatedSequenceCandidates(words, new Set());
  assert.equal(cands.length, 0);
});

test("repeatedSequenceCandidates: nested preference still holds at MAX_NGRAM 6", () => {
  const words = [
    word("w0", "do", 0, 0.3),
    word("w1", "you", 0.3, 0.6),
    word("w2", "do", 0.65, 0.95),
    word("w3", "you", 0.95, 1.25),
  ];
  const cands = repeatedSequenceCandidates(words, new Set());
  assert.equal(cands.length, 1);
  assert.deepEqual(cands[0].wordIds, ["w0", "w1"]);
});
