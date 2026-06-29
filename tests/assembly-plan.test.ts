import assert from "node:assert/strict";
import { test } from "node:test";
import { planAssembly } from "../src/assembly-plan.ts";
import type { Take } from "../src/edl.ts";
import { SAMPLE_RATE } from "../src/edl.ts";

const sec = (n: number) => n * SAMPLE_RATE;

// One word per second, take-shaped builder. Each word id is `w<index>` and spans
// exactly one second of source time, mirroring the phrase-match/reanchor fixture
// idiom but for a Take (which carries its own words[] and durationSamples).
function take(id: string, wordTexts: string[]): Take {
  return {
    id,
    label: "",
    source: `/tmp/${id}.mp4`,
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: sec(wordTexts.length),
    words: wordTexts.map((text, i) => ({
      id: `w${i}`,
      text,
      startSample: sec(i),
      endSample: sec(i + 1),
      deleted: false,
    })),
    ingestedAt: "2026-06-29T00:00:00.000Z",
  };
}

function takeMap(...takes: Take[]): Map<string, Take> {
  return new Map(takes.map((t) => [t.id, t]));
}

test("planAssembly splices two takes end-to-end with no gap at the seam", () => {
  const a = take("A", ["one", "two", "three", "four", "five", "six"]);
  const b = take("B", [
    "alpha",
    "beta",
    "gamma",
    "delta",
    "echo",
    "foxtrot",
    "golf",
    "hotel",
  ]);
  const plan = planAssembly(
    {
      segments: [
        { takeId: "A", startWordId: "w0", endWordId: "w1" }, // A 0-2s
        { takeId: "B", startWordId: "w5", endWordId: "w6" }, // B 5-7s
      ],
      padMs: 0,
    },
    takeMap(a, b)
  );

  // Two 2s segments laid end-to-end → 4s total.
  assert.equal(plan.durationSamples, sec(4));

  // Segment output spans are contiguous: A occupies [0,2s], B occupies [2s,4s].
  assert.equal(plan.segments.length, 2);
  assert.equal(plan.segments[0].outStartSample, 0);
  assert.equal(plan.segments[0].outEndSample, sec(2));
  assert.equal(plan.segments[1].outStartSample, sec(2));
  assert.equal(plan.segments[1].outEndSample, sec(4));

  // Source spans come from each take's own samples.
  assert.equal(plan.segments[0].srcStartSample, sec(0));
  assert.equal(plan.segments[0].srcEndSample, sec(2));
  assert.equal(plan.segments[1].srcStartSample, sec(5));
  assert.equal(plan.segments[1].srcEndSample, sec(7));

  // Merged words are re-id'd contiguous w0..w3 (two from A, two from B).
  assert.deepEqual(
    plan.words.map((w) => w.id),
    ["w0", "w1", "w2", "w3"]
  );
  assert.deepEqual(
    plan.words.map((w) => w.text),
    ["one", "two", "foxtrot", "golf"]
  );

  // B's first word now starts exactly where A ended — no gap at the seam.
  assert.equal(plan.words[2].startSample, sec(2));
  assert.equal(plan.words[1].endSample, sec(2));
  assert.equal(plan.words[2].startSample, plan.words[1].endSample);
});

test("planAssembly is integer-exact when re-timing interior words", () => {
  const a = take("A", ["one", "two", "three", "four"]);
  const plan = planAssembly(
    {
      segments: [{ takeId: "A", startWordId: "w1", endWordId: "w2" }], // A 1-3s
      padMs: 0,
    },
    takeMap(a)
  );
  // Segment starts at source second 1; output rebases it to 0.
  assert.equal(plan.durationSamples, sec(2));
  assert.deepEqual(
    plan.words.map((w) => [w.startSample, w.endSample]),
    [
      [sec(0), sec(1)],
      [sec(1), sec(2)],
    ]
  );
  // Every sample boundary is an integer.
  for (const w of plan.words) {
    assert.equal(Number.isInteger(w.startSample), true);
    assert.equal(Number.isInteger(w.endSample), true);
  }
});

test("planAssembly assembles a single full-take selection to its own span", () => {
  const a = take("A", ["one", "two", "three"]);
  const plan = planAssembly(
    {
      segments: [{ takeId: "A", startWordId: "w0", endWordId: "w2" }],
      padMs: 0,
    },
    takeMap(a)
  );
  assert.equal(plan.durationSamples, sec(3));
  assert.deepEqual(
    plan.words.map((w) => w.id),
    ["w0", "w1", "w2"]
  );
  assert.equal(plan.segments[0].srcStartSample, sec(0));
  assert.equal(plan.segments[0].srcEndSample, sec(3));
});

test("planAssembly clamps the seam pad to [0, take.durationSamples]", () => {
  const a = take("A", ["one", "two", "three"]);
  // padMs 500 → 24000 samples each side; the segment is the whole take so the
  // pad cannot push the source span past [0, durationSamples].
  const plan = planAssembly(
    {
      segments: [{ takeId: "A", startWordId: "w0", endWordId: "w2" }],
      padMs: 500,
    },
    takeMap(a)
  );
  assert.equal(plan.segments[0].srcStartSample, 0);
  assert.equal(plan.segments[0].srcEndSample, sec(3));
});

test("planAssembly carries a per-segment note into provenance", () => {
  const a = take("A", ["one", "two"]);
  const plan = planAssembly(
    {
      segments: [
        { takeId: "A", startWordId: "w0", endWordId: "w1", note: "best read" },
      ],
      padMs: 0,
    },
    takeMap(a)
  );
  assert.equal(plan.segments[0].note, "best read");
});

test("planAssembly throws on an unknown takeId", () => {
  const a = take("A", ["one", "two"]);
  assert.throws(
    () =>
      planAssembly(
        {
          segments: [{ takeId: "Z", startWordId: "w0", endWordId: "w1" }],
          padMs: 0,
        },
        takeMap(a)
      ),
    /unknown take/i
  );
});

test("planAssembly throws when a word id is not in the take", () => {
  const a = take("A", ["one", "two"]);
  assert.throws(
    () =>
      planAssembly(
        {
          segments: [{ takeId: "A", startWordId: "w0", endWordId: "w9" }],
          padMs: 0,
        },
        takeMap(a)
      ),
    /word .* not found/i
  );
});

test("planAssembly throws when the start word is after the end word", () => {
  const a = take("A", ["one", "two", "three"]);
  assert.throws(
    () =>
      planAssembly(
        {
          segments: [{ takeId: "A", startWordId: "w2", endWordId: "w0" }],
          padMs: 0,
        },
        takeMap(a)
      ),
    /start .* after end/i
  );
});
