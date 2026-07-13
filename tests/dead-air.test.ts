import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { addDeadAir, removeDeadAir } from "../src/actions.ts";
import {
  CLEANUP_DEGRADED_WARNING,
  resolveCleanupConfig,
} from "../src/cleanup.ts";
import {
  CutsSchema,
  type Project,
  ProjectSchema,
  SAMPLE_RATE,
} from "../src/edl.ts";
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
    captions: { enabled: true, maxWords: 6, style: "boxed" },
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
  assert.equal(created[0].created, true);
  assert.equal(created[0].span.startSample, sec(2));
  assert.equal(created[0].span.endSample, sec(3));
  assert.match(created[0].span.id, /^da/);
  assert.equal(p.cuts.deadAir.length, 1);
});

test("addDeadAir: clamps spans to the project duration", () => {
  const p = makeProject();
  const created = addDeadAir(p, [{ fromSec: 9, toSec: 20 }]);
  assert.equal(created[0].span.endSample, sec(10));
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
  const merged = created.find((d) => d.span.startSample === sec(1));
  assert.ok(merged);
  assert.equal(merged?.span.endSample, sec(3));
});

test("addDeadAir: rejects an empty spans array", () => {
  const p = makeProject();
  assert.throws(() => addDeadAir(p, []));
});

test("removeDeadAir: removes by id and reports whether one was removed", () => {
  const p = makeProject();
  const [created] = addDeadAir(p, [{ fromSec: 1, toSec: 2 }]);
  assert.equal(removeDeadAir(p, "nope"), false);
  assert.equal(removeDeadAir(p, created.span.id), true);
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
  assert.equal(second[0].created, false);
  assert.equal(second[0].span.id, first.span.id);
  assert.equal(second[0].span.startSample, sec(1));
  assert.equal(second[0].span.endSample, sec(2.5));
});

test("addDeadAir: a span within 10ms of an existing span also coalesces (adjacent, not just overlapping)", () => {
  const p = makeProject();
  const [first] = addDeadAir(p, [{ fromSec: 1, toSec: 2 }]);
  // Starts 5ms after the existing span ends: under the 10ms threshold.
  const second = addDeadAir(p, [{ fromSec: 2.005, toSec: 2.5 }]);
  assert.equal(p.cuts.deadAir.length, 1);
  assert.equal(second[0].span.id, first.span.id);
  assert.equal(second[0].span.endSample, sec(2.5));
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
  }) as { created: boolean; span: { id: string } }[];
  assert.equal(created.length, 1);
  assert.equal(created[0].created, true);
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
  }) as { span: { id: string } }[];
  const result = runAction("dead-air-rm", p, { id: created.span.id }) as {
    removed: boolean;
  };
  assert.equal(result.removed, true);
  assert.equal(p.cuts.deadAir.length, 0);
});

// ── CutsSchema.cleanup ───────────────────────────────────────────────────

test("CutsSchema: cleanup key is optional and round-trips", () => {
  const parsed = CutsSchema.parse({
    snap: {},
    cleanup: {
      minSec: 1.2,
      keepPadSec: 0.2,
      categories: { hedging: true },
    },
  });
  assert.equal(parsed.cleanup?.minSec, 1.2);
  assert.equal(parsed.cleanup?.keepPadSec, 0.2);
  assert.equal(parsed.cleanup?.categories?.hedging, true);
});

test("CutsSchema: parses without cleanup key unchanged", () => {
  const parsed = CutsSchema.parse({ snap: {}, deadAir: [] });
  assert.equal(parsed.cleanup, undefined);
});

test("CutsSchema: cleanup out-of-range fields degrade instead of throwing", () => {
  const low = CutsSchema.parse({ snap: {}, cleanup: { minSec: 0.1 } });
  assert.equal(low.cleanup?.minSec, undefined);
  const high = CutsSchema.parse({ snap: {}, cleanup: { minSec: 6 } });
  assert.equal(high.cleanup?.minSec, undefined);
});

test("ProjectSchema: out-of-range cleanup.minSec loads and resolveCleanupConfig clamps", () => {
  const parsed = ProjectSchema.parse({
    version: 1,
    slug: "schema-cleanup",
    source: "/tmp/source.mp4",
    proxy: "working/proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1280,
    height: 720,
    durationSamples: sec(30),
    captions: { enabled: true, maxWords: 6, style: "boxed" },
    assets: [],
    broll: [],
    look: { vignette: false },
    zooms: [],
    titles: [],
    stills: [],
    graphics: [],
    words: [],
    cuts: {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
      cleanup: { minSec: 6 },
    },
  });
  assert.equal(parsed.cuts.cleanup?.minSec, undefined);
  assert.equal(resolveCleanupConfig(parsed).minSec, 0.7);
});

// ── registry: cleanup-config / cleanup-apply ─────────────────────────────

test("cleanup-config: merges at least one field into project.cuts.cleanup", () => {
  const p = makeProject();
  runAction("cleanup-config", p, { minSec: 1.5, hedging: true });
  assert.equal(p.cuts.cleanup?.minSec, 1.5);
  assert.equal(p.cuts.cleanup?.categories?.hedging, true);
});

test("cleanup-config: rejects empty input", () => {
  const p = makeProject();
  assert.throws(() => runAction("cleanup-config", p, {}));
});

test("cleanup-apply: safe mode returns wordIds and deadAirSpanIds", async () => {
  const p = makeProject({
    words: [
      {
        id: "w0",
        text: "um",
        startSample: sec(0),
        endSample: sec(0.5),
        deleted: false,
      },
      {
        id: "w1",
        text: "hello",
        startSample: sec(0.5),
        endSample: sec(1),
        deleted: false,
      },
    ],
  });
  const result = (await runAction("cleanup-apply", p, { mode: "safe" })) as {
    wordIds: string[];
    deadAirSpanIds: string[];
    warnings: string[];
  };
  assert.deepEqual(result.wordIds, ["w0"]);
  assert.equal(result.deadAirSpanIds.length, 0);
  assert.equal(p.words[0].deleted, true);
});

test("cleanup-config: null clears an override back to inherit-default", () => {
  const p = makeProject();
  runAction("cleanup-config", p, { hedging: true, minSec: 2 });
  assert.equal(p.cuts.cleanup?.categories?.hedging, true);
  assert.equal(p.cuts.cleanup?.minSec, 2);
  runAction("cleanup-config", p, { hedging: null, minSec: null });
  assert.equal(p.cuts.cleanup?.categories?.hedging, undefined);
  assert.equal(p.cuts.cleanup?.minSec, undefined);
});

let tempProjectsRoot: string | undefined;
let prevProjectsRoot: string | undefined;

afterEach(() => {
  if (tempProjectsRoot) {
    rmSync(tempProjectsRoot, { recursive: true, force: true });
    tempProjectsRoot = undefined;
  }
  if (prevProjectsRoot === undefined) {
    delete process.env.OPENKLIP_PROJECTS_ROOT;
  } else {
    process.env.OPENKLIP_PROJECTS_ROOT = prevProjectsRoot;
  }
  prevProjectsRoot = undefined;
});

function writeTempProject(
  slug: string,
  project: Project,
  audioAnalysis?: unknown
): string {
  prevProjectsRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  tempProjectsRoot = mkdtempSync(join(tmpdir(), "openklip-dead-air-apply-"));
  process.env.OPENKLIP_PROJECTS_ROOT = tempProjectsRoot;
  const dir = join(tempProjectsRoot, slug);
  const working = join(dir, "working");
  mkdirSync(working, { recursive: true });
  writeFileSync(join(dir, "project.json"), JSON.stringify(project, null, 2));
  if (audioAnalysis) {
    writeFileSync(
      join(working, "audio-analysis.json"),
      JSON.stringify(audioAnalysis)
    );
  }
  return dir;
}

test("cleanup-apply: uses audio-analysis.json on disk for dead-air registration", async () => {
  const slug = "dead-air-apply-e2e";
  const project = makeProject({
    slug,
    words: [
      {
        id: "w0",
        text: "hello",
        startSample: sec(0),
        endSample: sec(1),
        deleted: false,
      },
      {
        id: "w1",
        text: "world",
        startSample: sec(3),
        endSample: sec(4),
        deleted: false,
      },
    ],
  });
  writeTempProject(slug, project, {
    version: 1,
    sampleRate: 16_000,
    windowMs: 30,
    thresholdDb: -40,
    minSilenceMs: 300,
    sourceMtimeMs: 1,
    silences: [{ startSec: 1.0, endSec: 3.0 }],
  });
  const p = structuredClone(project);
  const result = (await runAction("cleanup-apply", p, { mode: "safe" })) as {
    deadAirSpanIds: string[];
    warnings: string[];
  };
  assert.ok(result.deadAirSpanIds.length > 0);
  assert.equal(p.cuts.deadAir.length, 1);
});

test("cleanup-apply: cold project without analysis returns degraded warning", async () => {
  const slug = "dead-air-cold";
  const project = makeProject({
    slug,
    words: [
      {
        id: "w0",
        text: "hello",
        startSample: sec(0),
        endSample: sec(1),
        deleted: false,
      },
      {
        id: "w1",
        text: "world",
        startSample: sec(3),
        endSample: sec(4),
        deleted: false,
      },
    ],
  });
  writeTempProject(slug, project);
  const p = structuredClone(project);
  const result = (await runAction("cleanup-apply", p, { mode: "safe" })) as {
    deadAirSpanIds: string[];
    warnings: string[];
  };
  assert.equal(result.deadAirSpanIds.length, 0);
  assert.ok(result.warnings.includes(CLEANUP_DEGRADED_WARNING));
});
