import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { addMusic, addTitle } from "../src/actions.ts";
import { runOverlays, runRanges, runStatusJson } from "../src/cli-query.ts";
import { SAMPLE_RATE } from "../src/edl.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const CLI = join(import.meta.dir, "../src/cli.ts");

async function runCli(args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: stdout + stderr };
}

test("CLI transcript grep returns bounded matches", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        words: [
          {
            id: "w0",
            text: "you",
            startSample: 0,
            endSample: 48_000,
            deleted: false,
          },
          {
            id: "w1",
            text: "know",
            startSample: 48_000,
            endSample: 96_000,
            deleted: false,
          },
          {
            id: "w2",
            text: "this",
            startSample: 96_000,
            endSample: 144_000,
            deleted: false,
          },
        ],
        durationSamples: 144_000,
      })
    );

    const r = await runCli(["transcript", "grep", slug, "you know", "--json"]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out.trim());
    assert.equal(data.matches.length, 1);
    assert.deepEqual(data.matches[0].ids, ["w0", "w1"]);
  });
});

test("CLI transcript phrase returns span for overlay placement", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli([
      "transcript",
      "phrase",
      slug,
      "Hello world",
      "--json",
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out.trim());
    assert.equal(data.matched, true);
    assert.ok(data.fromSec >= 0);
    assert.ok(data.toSec > data.fromSec);
  });
});

test("CLI transcript span slices word ids", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli([
      "transcript",
      "span",
      slug,
      "w0",
      "--context",
      "1",
      "--json",
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out.trim());
    assert.equal(data.words.length, 2);
    assert.equal(data.words[0].id, "w0");
    assert.equal(data.words[1].id, "w1");
  });
});

test("CLI ranges --json lists kept segments", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = makeProject({ slug, padMs: 0 });
    p.words[0].deleted = true;
    writeFixtureProject(slug, p);

    const r = await runCli(["ranges", slug, "--json"]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out.trim());
    assert.equal(data.ranges.length, 1);
    assert.ok(data.ranges[0].startSec >= 1);
  });
});

test("CLI ranges --json reflects dead-air subtraction (matches export truth)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = makeProject({ slug, padMs: 0 });
    p.cuts = {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [
        { id: "d1", startSample: SAMPLE_RATE / 2, endSample: SAMPLE_RATE },
      ],
    };
    writeFixtureProject(slug, p);

    const r = await runCli(["ranges", slug, "--json"]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out.trim());
    assert.equal(data.ranges.length, 2);
    assert.equal(data.ranges[0].endSec, 0.5);
    assert.equal(data.ranges[1].startSec, 1);
  });
});

test("CLI status --json ranges reflect dead-air subtraction", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = makeProject({ slug, padMs: 0 });
    p.cuts = {
      snap: { enabled: false, mode: "off", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [
        { id: "d1", startSample: SAMPLE_RATE / 2, endSample: SAMPLE_RATE },
      ],
    };
    writeFixtureProject(slug, p);

    const r = await runCli(["status", slug, "--json"]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out.trim());
    assert.equal(data.ranges.length, 2);
  });
});

test("CLI ranges --json applies VAD snap end-to-end via a cached audio-analysis.json", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const p = makeProject({ slug, padMs: 0 });
    p.cuts = {
      snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 24 },
      deadAir: [],
    };
    writeFixtureProject(slug, p);

    const paths = projectPaths(slug);
    // 16kHz mono f32 silence; content doesn't matter, only that the file
    // exists so loadAudioAnalysis() doesn't throw and the cache below is
    // accepted (mtime match).
    await Bun.write(
      paths.audioRaw,
      new Float32Array(1600).buffer as ArrayBuffer
    );
    const sourceMtimeMs = statSync(paths.audioRaw).mtimeMs;
    // F13: loadAudioAnalysis now validates the cache shape (AudioAnalysisSchema)
    // before trusting it, so this fixture must be a complete AudioAnalysis
    // object (version/sampleRate/windowMs/thresholdDb/minSilenceMs), not just
    // the sourceMtimeMs + silences this test actually exercises.
    await Bun.write(
      `${paths.working}/audio-analysis.json`,
      JSON.stringify({
        version: 1,
        sampleRate: 16_000,
        windowMs: 20,
        thresholdDb: -38,
        minSilenceMs: 300,
        sourceMtimeMs,
        silences: [{ startSec: 1.9, endSec: 2.3 }],
      })
    );

    const r = await runCli(["ranges", slug, "--json"]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out.trim());
    assert.equal(data.ranges.at(-1)?.endSec, 1.9);
  });
});

test("CLI word-text corrects a word and preserves the original as originalText", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli(["word-text", slug, "w0", "Hi", "there"]);
    assert.equal(r.code, 0);
    assert.match(r.out, /word w0: "Hi there"/);

    const paths = projectPaths(slug);
    const saved = JSON.parse(await Bun.file(paths.project).text());
    const w0 = saved.words.find((w: { id: string }) => w.id === "w0");
    assert.equal(w0.text, "Hi there");
    assert.equal(w0.originalText, "Hello");
  });
});

test("CLI word-text rejects an unknown word id with a non-zero exit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const r = await runCli(["word-text", slug, "nope", "hi"]);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /nope/);
  });
});

test("CLI overlays --json lists empty tracks on fresh project", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli(["overlays", slug, "--json"]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out.trim());
    assert.deepEqual(data.broll, []);
    assert.deepEqual(data.titles, []);
  });
});

test("CLI status --json returns agent summary", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, template: "talking-head" }));

    const r = await runCli(["status", slug, "--json"]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.out.trim());
    assert.equal(data.slug, slug);
    assert.equal(data.template, "talking-head");
    assert.equal(data.words.total, 2);
  });
});

test("CLI title-add-phrase places title at spoken span", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli([
      "title-add-phrase",
      slug,
      "Hello world",
      "Jane Doe\\nCEO",
      "--position",
      "lower",
    ]);
    assert.equal(r.code, 0);
    assert.match(r.out, /added title/);

    const status = await runCli(["status", slug, "--json"]);
    const data = JSON.parse(status.out.trim());
    assert.equal(data.overlays.titles.length, 1);
    assert.equal(data.overlays.titles[0].text, "Jane Doe\nCEO");
  });
});

test("CLI zoom-add-phrase adds zoom at phrase span", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli([
      "zoom-add-phrase",
      slug,
      "Hello world",
      "--scale",
      "1.2",
    ]);
    assert.equal(r.code, 0);
    assert.match(r.out, /added zoom/);

    const status = await runCli(["overlays", slug, "--json"]);
    const data = JSON.parse(status.out.trim());
    assert.equal(data.zooms.length, 1);
    assert.equal(data.zooms[0].scale, 1.2);
  });
});

test("CLI broll-add-phrase covers phrase span", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli([
      "broll-add-phrase",
      slug,
      "broll-a",
      "Hello world",
    ]);
    assert.equal(r.code, 0);
    assert.match(r.out, /added b-roll/);

    const status = await runCli(["overlays", slug, "--json"]);
    const data = JSON.parse(status.out.trim());
    assert.equal(data.broll.length, 1);
    assert.equal(data.broll[0].assetId, "broll-a");
  });
});

test("CLI transcript grep fails cleanly when phrase missing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli(["transcript", "grep", slug, "not in transcript"]);
    assert.equal(r.code, 0);
    assert.match(r.out, /no matches/);
  });
});

test("CLI title-add-phrase errors when phrase not found", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));

    const r = await runCli([
      "title-add-phrase",
      slug,
      "missing phrase",
      "Title",
    ]);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /no match/i);
  });
});

// ── FEATURE 1: written rationale (note) in overlay listings ─────────────────

test("runOverlays human output includes a note suffix", () => {
  const p = makeProject();
  addTitle(p, { fromSec: 0, toSec: 2, text: "Hook", note: "why this line" });
  const out = runOverlays(p, { json: false });
  assert.match(out, /why this line/);
});

test("runOverlays json output includes the note key", () => {
  const p = makeProject();
  addTitle(p, { fromSec: 0, toSec: 2, text: "Hook", note: "why this line" });
  const out = runOverlays(p, { json: true });
  assert.match(out, /"note"/);
});

test("runOverlays human output lists music placements", () => {
  const p = makeProject();
  p.assets.push({
    id: "bed",
    kind: "music",
    name: "bed.mp3",
    src: "/tmp/bed.mp3",
    proxy: "working/assets/bed.aac",
    durationSamples: 30 * SAMPLE_RATE,
  });
  addMusic(p, {
    assetId: "bed",
    fromSec: 1,
    toSec: 4,
    gain: 0.4,
    mode: "loop",
    note: "score",
  });
  const out = runOverlays(p, { json: false });
  assert.match(out, /music \(1\):/);
  assert.match(out, /asset bed {2}1\.000s-4\.000s {2}gain 0\.4 {2}loop: score/);
});

// ── D2: runRanges/runStatusJson thread optional silences through to snap ────

test("runRanges applies VAD snap when silences are passed and snap is enabled", () => {
  const p = makeProject({ padMs: 0 });
  p.cuts = {
    snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 24 },
    deadAir: [],
  };
  const withoutSilences = JSON.parse(runRanges(p, { json: true }));
  const withSilences = JSON.parse(
    runRanges(p, { json: true, silences: [{ startSec: 1.9, endSec: 2.3 }] })
  );
  const last = (r: { ranges: Array<{ endSec: number }> }) =>
    r.ranges.at(-1)?.endSec;
  assert.equal(last(withoutSilences), 2);
  assert.equal(last(withSilences), 1.9);
});

test("runStatusJson applies VAD snap when silences are passed and snap is enabled", () => {
  const p = makeProject({ padMs: 0 });
  p.cuts = {
    snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 24 },
    deadAir: [],
  };
  const withoutSilences = JSON.parse(runStatusJson(p));
  const withSilences = JSON.parse(
    runStatusJson(p, [{ startSec: 1.9, endSec: 2.3 }])
  );
  assert.ok(withSilences.keptDurationSec < withoutSilences.keptDurationSec);
});
