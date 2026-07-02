import assert from "node:assert/strict";
import { test } from "node:test";
import { addDeadAir, removeDeadAir } from "../src/actions.ts";
import { CutsSchema, type Project, SAMPLE_RATE } from "../src/edl.ts";
import { runAction } from "../src/registry.ts";

const sec = (n: number) => n * SAMPLE_RATE;

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    version: 1,
    slug: "dead-air-test",
    source: "/tmp/test.mp4",
    proxy: "proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1920,
    height: 1080,
    durationSamples: sec(10),
    padMs: 0,
    captions: { enabled: true, maxWords: 6 },
    assets: [],
    broll: [],
    look: { vignette: false },
    zooms: [],
    titles: [],
    stills: [],
    graphics: [],
    words: Array.from({ length: 10 }, (_, i) => ({
      id: `w${i}`,
      text: `word${i}`,
      startSample: sec(i),
      endSample: sec(i + 1),
      deleted: false,
    })),
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
    },
    motion: { fadeMs: 180, heroFadeMs: 320, slideFrac: 0.04, speed: 1 },
    ...overrides,
  } as Project;
}

// ── CutsSchema.deadAir ───────────────────────────────────────────────────

test("CutsSchema: deadAir defaults to an empty array", () => {
  const parsed = CutsSchema.parse({ snap: {} });
  assert.deepEqual(parsed.deadAir, []);
});

test("CutsSchema: deadAir validates id/startSample/endSample shape", () => {
  const parsed = CutsSchema.parse({
    snap: {},
    deadAir: [{ id: "da1", startSample: 100, endSample: 200 }],
  });
  assert.deepEqual(parsed.deadAir, [
    { id: "da1", startSample: 100, endSample: 200 },
  ]);
  assert.throws(() =>
    CutsSchema.parse({
      snap: {},
      deadAir: [{ id: "da1", startSample: -1, endSample: 200 }],
    })
  );
});

// ── addDeadAir / removeDeadAir primitives ─────────────────────────────────

test("addDeadAir: registers a span converted to samples on the 48kHz grid", () => {
  const p = makeProject();
  const created = addDeadAir(p, [{ fromSec: 2, toSec: 3 }]);
  assert.equal(created.length, 1);
  assert.equal(created[0].startSample, sec(2));
  assert.equal(created[0].endSample, sec(3));
  assert.match(created[0].id, /^da/);
  assert.equal(p.cuts.deadAir.length, 1);
});

test("addDeadAir: clamps spans to the project duration", () => {
  const p = makeProject();
  const created = addDeadAir(p, [{ fromSec: 9, toSec: 20 }]);
  assert.equal(created[0].endSample, sec(10));
});

test("addDeadAir: rejects non-finite or inverted spans", () => {
  const p = makeProject();
  assert.throws(() => addDeadAir(p, [{ fromSec: Number.NaN, toSec: 3 }]));
  assert.throws(() => addDeadAir(p, [{ fromSec: 3, toSec: 1 }]));
  assert.equal(p.cuts.deadAir.length, 0);
});

test("addDeadAir: drops slivers under 0.05s after clamping", () => {
  const p = makeProject();
  const created = addDeadAir(p, [{ fromSec: 9.98, toSec: 10.0 }]);
  assert.equal(created.length, 0);
  assert.equal(p.cuts.deadAir.length, 0);
});

test("addDeadAir: merges touching/overlapping spans within one call", () => {
  const p = makeProject();
  const created = addDeadAir(p, [
    { fromSec: 1, toSec: 2 },
    { fromSec: 2, toSec: 3 },
    { fromSec: 5, toSec: 6 },
  ]);
  assert.equal(created.length, 2);
  const merged = created.find((d) => d.startSample === sec(1));
  assert.ok(merged);
  assert.equal(merged?.endSample, sec(3));
});

test("addDeadAir: rejects an empty spans array", () => {
  const p = makeProject();
  assert.throws(() => addDeadAir(p, []));
});

test("removeDeadAir: removes by id and reports whether one was removed", () => {
  const p = makeProject();
  const [created] = addDeadAir(p, [{ fromSec: 1, toSec: 2 }]);
  assert.equal(removeDeadAir(p, "nope"), false);
  assert.equal(removeDeadAir(p, created.id), true);
  assert.equal(p.cuts.deadAir.length, 0);
});

test("addDeadAir: is defensive when project.cuts is not yet populated", () => {
  const p = makeProject();
  // biome-ignore lint/performance/noDelete: simulate an unvalidated fixture.
  delete (p as { cuts?: unknown }).cuts;
  const created = addDeadAir(p, [{ fromSec: 1, toSec: 2 }]);
  assert.equal(created.length, 1);
  assert.equal(p.cuts.deadAir.length, 1);
});

// ── F4(b): idempotency against ALREADY-REGISTERED spans ──────────────────

test("addDeadAir: coalesces a new span into an existing overlapping span instead of duplicating it", () => {
  const p = makeProject();
  const [first] = addDeadAir(p, [{ fromSec: 1, toSec: 2 }]);
  assert.equal(p.cuts.deadAir.length, 1);
  const second = addDeadAir(p, [{ fromSec: 1.5, toSec: 2.5 }]);
  assert.equal(p.cuts.deadAir.length, 1);
  assert.equal(second.length, 1);
  assert.equal(second[0].id, first.id);
  assert.equal(second[0].startSample, sec(1));
  assert.equal(second[0].endSample, sec(2.5));
});

test("addDeadAir: a span within 10ms of an existing span also coalesces (adjacent, not just overlapping)", () => {
  const p = makeProject();
  const [first] = addDeadAir(p, [{ fromSec: 1, toSec: 2 }]);
  // Starts 5ms after the existing span ends: under the 10ms threshold.
  const second = addDeadAir(p, [{ fromSec: 2.005, toSec: 2.5 }]);
  assert.equal(p.cuts.deadAir.length, 1);
  assert.equal(second[0].id, first.id);
  assert.equal(second[0].endSample, sec(2.5));
});

test("addDeadAir: a span more than 10ms from any existing span stays a separate entry", () => {
  const p = makeProject();
  addDeadAir(p, [{ fromSec: 1, toSec: 2 }]);
  addDeadAir(p, [{ fromSec: 2.5, toSec: 3 }]);
  assert.equal(p.cuts.deadAir.length, 2);
});

test("addDeadAir: re-running the same span twice leaves cuts.deadAir length unchanged", () => {
  const p = makeProject();
  addDeadAir(p, [{ fromSec: 1, toSec: 2 }]);
  addDeadAir(p, [{ fromSec: 1, toSec: 2 }]);
  assert.equal(p.cuts.deadAir.length, 1);
});

test("addDeadAir: caps total registered spans at 200, keeping the earliest and dropping overflow", () => {
  const p = makeProject({ durationSamples: sec(1000) });
  // 205 spans, 2s apart (well beyond the 10ms adjacency threshold) so every
  // one registers as its own entry before the cap applies.
  const spans = Array.from({ length: 205 }, (_, i) => ({
    fromSec: i * 2,
    toSec: i * 2 + 0.5,
  }));
  addDeadAir(p, spans);
  assert.equal(p.cuts.deadAir.length, 200);
  const starts = p.cuts.deadAir.map((d) => d.startSample).sort((a, b) => a - b);
  assert.equal(starts[0], sec(0));
  assert.equal(starts.at(-1), sec(199 * 2));
});

// ── registry: dead-air-add / dead-air-rm ──────────────────────────────────

test("dead-air-add: registers spans through the registry", () => {
  const p = makeProject();
  const created = runAction("dead-air-add", p, {
    spans: [{ fromSec: 1, toSec: 2 }],
  }) as { id: string; startSample: number; endSample: number }[];
  assert.equal(created.length, 1);
  assert.equal(p.cuts.deadAir.length, 1);
});

test("dead-air-add: rejects more than 50 spans (schema owns the shape)", () => {
  const p = makeProject();
  const spans = Array.from({ length: 51 }, (_, i) => ({
    fromSec: i,
    toSec: i + 0.5,
  }));
  assert.throws(() => runAction("dead-air-add", p, { spans }));
});

test("dead-air-rm: removes by id through the registry round trip", () => {
  const p = makeProject();
  const [created] = runAction("dead-air-add", p, {
    spans: [{ fromSec: 1, toSec: 2 }],
  }) as { id: string }[];
  const result = runAction("dead-air-rm", p, { id: created.id }) as {
    removed: boolean;
  };
  assert.equal(result.removed, true);
  assert.equal(p.cuts.deadAir.length, 0);
});
