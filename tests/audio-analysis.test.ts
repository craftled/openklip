import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { readFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  analyzeSilences,
  loadAudioAnalysis,
  readPcm,
} from "../src/audio-analysis.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const SR = 16_000;

// 4s synthetic PCM: 1s tone, 1s silence, 1s tone, 1s silence. One sample per
// index at 16 kHz mono f32.
function toneAndSilencePcm(): Float32Array {
  const totalSamples = SR * 4;
  const pcm = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / SR;
    const sec = Math.floor(t);
    const isTone = sec === 0 || sec === 2;
    pcm[i] = isTone ? 0.5 * Math.sin(2 * Math.PI * 440 * t) : 0;
  }
  return pcm;
}

// A quiet "hum" at roughly -50 dBFS: amplitude a such that
// 20*log10(a/sqrt(2)) ~= -50 dB.
function humPcm(seconds: number, amplitude = 0.004_472): Float32Array {
  const totalSamples = SR * seconds;
  const pcm = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    pcm[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / SR);
  }
  return pcm;
}

function tonePcm(seconds: number, amplitude = 0.5): Float32Array {
  const totalSamples = SR * seconds;
  const pcm = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    pcm[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / SR);
  }
  return pcm;
}

function concatPcm(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ── analyzeSilences (pure math, re-exported from audio-analysis-core.ts) ────

test("analyzeSilences: finds the two silent spans in tone/silence/tone/silence", () => {
  const spans = analyzeSilences(toneAndSilencePcm());
  assert.equal(spans.length, 2);
  const tolerance = 0.05;
  assert.ok(
    Math.abs(spans[0].startSec - 1.0) <= tolerance,
    `got ${spans[0].startSec}`
  );
  assert.ok(
    Math.abs(spans[0].endSec - 2.0) <= tolerance,
    `got ${spans[0].endSec}`
  );
  assert.ok(
    Math.abs(spans[1].startSec - 3.0) <= tolerance,
    `got ${spans[1].startSec}`
  );
  assert.ok(
    Math.abs(spans[1].endSec - 4.0) <= tolerance,
    `got ${spans[1].endSec}`
  );
});

test("analyzeSilences: a -50dB hum counts as silence at the default -38dB threshold", () => {
  const spans = analyzeSilences(humPcm(1));
  assert.equal(spans.length, 1);
  assert.ok(Math.abs(spans[0].startSec - 0) <= 0.05);
  assert.ok(Math.abs(spans[0].endSec - 1) <= 0.05);
});

test("analyzeSilences: thresholdDb is respected (a louder threshold excludes the hum)", () => {
  // -50dB hum is LOUDER than a -60dB threshold, so it should not be flagged.
  const spans = analyzeSilences(humPcm(1), { thresholdDb: -60 });
  assert.equal(spans.length, 0);
});

test("analyzeSilences: minSilenceMs filters out short dips", () => {
  // 900ms of tone, 100ms of true silence, 900ms of tone.
  const pcm = concatPcm([
    tonePcm(0.9),
    new Float32Array(Math.round(SR * 0.1)),
    tonePcm(0.9),
  ]);
  const filtered = analyzeSilences(pcm, { minSilenceMs: 300 });
  assert.equal(
    filtered.length,
    0,
    "100ms dip should be filtered by 300ms minimum"
  );

  const kept = analyzeSilences(pcm, { minSilenceMs: 50 });
  assert.equal(kept.length, 1, "100ms dip should survive a 50ms minimum");
});

// ── readPcm ──────────────────────────────────────────────────────────────

test("readPcm: reads the raw f32le PCM back as a Float32Array", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject());
    const pcm = tonePcm(0.1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    const read = await readPcm(slug);
    assert.equal(read.length, pcm.length);
    assert.ok(Math.abs(read[100] - pcm[100]) < 1e-6);
  });
});

test("readPcm: throws an actionable error when audio16k.f32 is missing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject());
    await assert.rejects(() => readPcm(slug), /re-ingest/i);
  });
});

// ── loadAudioAnalysis cache ──────────────────────────────────────────────

function cachePath(slug: string): string {
  return join(projectPaths(slug).working, "audio-analysis.json");
}

test("loadAudioAnalysis: missing audioRaw throws an actionable error", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject());
    await assert.rejects(() => loadAudioAnalysis(slug), /re-ingest/i);
  });
});

test("loadAudioAnalysis: computes, caches to disk, and a second call reuses the cache", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject());
    const pcm = toneAndSilencePcm();
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const first = await loadAudioAnalysis(slug);
    assert.equal(first.silences.length, 2);
    assert.ok(existsSync(cachePath(slug)), "cache file should be written");

    const second = await loadAudioAnalysis(slug);
    assert.deepEqual(second, first);

    // Mutate the cache directly to prove the second load (below) reads the
    // file instead of recomputing from the PCM.
    const mutated = { ...first, silences: [{ startSec: 99, endSec: 100 }] };
    writeFileSync(cachePath(slug), JSON.stringify(mutated));
    const third = await loadAudioAnalysis(slug);
    assert.deepEqual(third.silences, [{ startSec: 99, endSec: 100 }]);
  });
});

// T4: pin the default analysis options on the returned/cached object so a
// silent drift in any of these defaults is caught here.
test("loadAudioAnalysis: pins the default analysis options on the returned object", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject());
    const pcm = toneAndSilencePcm();
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    const analysis = await loadAudioAnalysis(slug);
    assert.equal(analysis.version, 1);
    assert.equal(analysis.sampleRate, 16_000);
    assert.equal(analysis.windowMs, 20);
    assert.equal(analysis.thresholdDb, -38);
    assert.equal(analysis.minSilenceMs, 300);
  });
});

// T4: documents the opts-vs-cache behavior. A cache written by a default-opts
// call must NOT be silently handed back to a caller requesting different
// opts (see loadAudioAnalysis's opts-equality check, added alongside this
// test) - the fix recomputes instead of returning stale-relative-to-request
// analysis.
test("loadAudioAnalysis: recomputes when the requested opts differ from what the cache was computed with", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject());
    const pcm = toneAndSilencePcm();
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const defaultAnalysis = await loadAudioAnalysis(slug);
    assert.equal(defaultAnalysis.thresholdDb, -38);

    // If the stale-cache bug were still present this would silently return
    // the -38 cache; asserting -50 here proves a recompute happened.
    const custom = await loadAudioAnalysis(slug, { thresholdDb: -50 });
    assert.equal(custom.thresholdDb, -50);

    // The cache on disk now reflects the custom request, not the default.
    const onDisk = JSON.parse(await readFile(cachePath(slug), "utf8")) as {
      thresholdDb: number;
    };
    assert.equal(onDisk.thresholdDb, -50);

    // A subsequent default-opts call must recompute again rather than reuse
    // the now-custom cache.
    const backToDefault = await loadAudioAnalysis(slug);
    assert.equal(backToDefault.thresholdDb, -38);
    assert.deepEqual(backToDefault.silences, defaultAnalysis.silences);
  });
});

// F13: a parseable-but-malformed cache must recompute rather than flow bad
// shape into snapRanges/deadAirCandidates and throw later at request time.
test("loadAudioAnalysis: a parseable-but-malformed cache recomputes instead of throwing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject());
    const pcm = toneAndSilencePcm();
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );
    // Valid JSON, wrong shape: silences entries missing endSec, version not 1.
    writeFileSync(
      cachePath(slug),
      JSON.stringify({
        version: 2,
        silences: [{ startSec: "not-a-number" }],
      })
    );
    const analysis = await loadAudioAnalysis(slug);
    assert.equal(analysis.version, 1);
    assert.equal(analysis.silences.length, 2);
  });
});

test("loadAudioAnalysis: a stale source mtime forces recomputation", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject());
    const pcm = toneAndSilencePcm();
    const audioPath = projectPaths(slug).audioRaw;
    writeFileSync(
      audioPath,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const first = await loadAudioAnalysis(slug);

    // Poison the cache the same way as the previous test, then bump mtime.
    writeFileSync(
      cachePath(slug),
      JSON.stringify({ ...first, silences: [{ startSec: 42, endSec: 43 }] })
    );

    const future = new Date(Date.now() + 60_000);
    await utimes(audioPath, future, future);

    const recomputed = await loadAudioAnalysis(slug);
    assert.deepEqual(recomputed.silences, first.silences);
    assert.notEqual(recomputed.sourceMtimeMs, first.sourceMtimeMs);

    // The cache on disk should now reflect the fresh computation, not the
    // poisoned value.
    const onDisk = JSON.parse(await readFile(cachePath(slug), "utf8"));
    assert.deepEqual(onDisk.silences, first.silences);
  });
});
