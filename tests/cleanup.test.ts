import assert from "node:assert/strict";
import { test } from "node:test";
import { addDeadAir, cutWords } from "../src/actions.ts";
import type { SilenceSpan } from "../src/audio-analysis-core.ts";
import {
  type CleanupCandidate,
  cleanupReport,
  deadAirCandidates,
  fillerCandidates,
  partitionSafeCandidates,
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
