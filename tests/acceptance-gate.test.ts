import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ACCEPTANCE_FIXTURE_SPECS,
  ACCEPTANCE_MANIFEST_FILENAME,
  type AcceptanceManifest,
  generateAcceptanceCorpus,
} from "../scripts/acceptance-corpus.ts";
import {
  canonicalDeadAirSpan,
  runAcceptanceGate,
} from "../scripts/acceptance-gate.ts";
import { FFMPEG } from "../src/ffmpeg.ts";

// Real-ffmpeg corpus generation is fast (no Whisper involved: see
// tests/exporter.test.ts's own skip-gate for the same convention).
const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

// The FULL gate (ingest -> edit -> export -> verify) runs real Whisper
// transcription per fixture, same as every other test file in this suite
// deliberately avoids (see tests/ingest-swap.test.ts's comment: "nothing in
// the existing suite exercises real Whisper/CLIP, too slow, needs a model
// download"). Gate the slow end-to-end run behind OPENKLIP_ACCEPTANCE=1
// (mirrors OPENKLIP_INTEGRATION's convention for the browser suite) so plain
// `bun test` stays fast and network-independent; `bun run test:acceptance`
// and the CI "acceptance" job opt in explicitly.
const ACCEPTANCE_OK = FFMPEG_OK && process.env.OPENKLIP_ACCEPTANCE === "1";

async function withTempDirAsync<T>(
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "openklip-acceptance-test-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── canonicalDeadAirSpan (pure): the deterministic, content-independent cut ─

test("canonicalDeadAirSpan carves a lead-in cut strictly inside the clip", () => {
  const span = canonicalDeadAirSpan(4);
  assert.ok(span.fromSec >= 0);
  assert.ok(span.toSec > span.fromSec);
  assert.ok(span.toSec < 4);
  assert.deepEqual(span, { fromSec: 0.4, toSec: 0.9 });
});

test("canonicalDeadAirSpan scales the lead-in but caps the cut length at 0.5s", () => {
  const span = canonicalDeadAirSpan(60);
  assert.equal(span.fromSec, 6);
  // 20% of 60s (12s) would exceed the 0.5s cap.
  assert.equal(span.toSec, 6.5);
});

test("canonicalDeadAirSpan stays inside very short clips without violating toSec > fromSec", () => {
  const span = canonicalDeadAirSpan(2);
  assert.ok(span.toSec > span.fromSec);
  assert.ok(span.toSec <= 2);
  assert.ok(span.fromSec >= 0);
});

test("canonicalDeadAirSpan is deterministic across repeated calls", () => {
  assert.deepEqual(canonicalDeadAirSpan(4), canonicalDeadAirSpan(4));
  assert.deepEqual(canonicalDeadAirSpan(3), canonicalDeadAirSpan(3));
});

test("canonicalDeadAirSpan rejects non-positive or non-finite durations", () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => canonicalDeadAirSpan(bad));
  }
});

// ── Corpus manifest shape (pure, no ffmpeg needed) ──────────────────────────

test("ACCEPTANCE_FIXTURE_SPECS covers the five synthesized dimensions plus the user-provisioned slot", () => {
  const ids = ACCEPTANCE_FIXTURE_SPECS.map((f) => f.id);
  assert.deepEqual([...ids].sort(), [
    "hevc-4k-10bit",
    "long-sparse-60s",
    "portrait-9x16",
    "sdr-h264-1080p",
    "talking-head-real",
    "vfr-1280x720",
  ]);
  const generated = ACCEPTANCE_FIXTURE_SPECS.filter((f) => !f.userProvided);
  assert.equal(generated.length, 5);
  for (const spec of generated) {
    assert.ok(spec.generator, `${spec.id} must declare a generator recipe`);
  }
  const slot = ACCEPTANCE_FIXTURE_SPECS.find(
    (f) => f.id === "talking-head-real"
  );
  assert.ok(slot);
  assert.equal(slot.userProvided, true);
  assert.equal(slot.generator, undefined);
});

test("the vfr fixture is the only one declaring vfr:true / fps:null", () => {
  const vfr = ACCEPTANCE_FIXTURE_SPECS.filter((f) => f.expected.vfr);
  assert.deepEqual(
    vfr.map((f) => f.id),
    ["vfr-1280x720"]
  );
  assert.equal(vfr[0]?.expected.fps, null);
  for (const spec of ACCEPTANCE_FIXTURE_SPECS.filter(
    (f) => f.id !== "vfr-1280x720" && !f.userProvided
  )) {
    assert.ok(
      typeof spec.expected.fps === "number",
      `${spec.id} should declare a nominal fps`
    );
  }
});

// ── Corpus generation (real ffmpeg, no Whisper: fast, always-on) ───────────

test("generateAcceptanceCorpus writes every synthetic fixture + a manifest.json, and self-checks codec/dims", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
  // Bun's default 5000ms test timeout was killing the encode mid-flight via
  // SIGTERM on CI's slower/shared runner (confirmed: "Exiting normally,
  // received signal 15" right after a fully-written, valid output file) -
  // the 4K HEVC/libx265 fixture in particular needs real headroom.
  timeout: 60_000,
}, async () => {
  await withTempDirAsync(async (outDir) => {
    const manifest: AcceptanceManifest = await generateAcceptanceCorpus({
      outDir,
    });
    assert.equal(manifest.fixtures.length, ACCEPTANCE_FIXTURE_SPECS.length);
    assert.ok(existsSync(join(outDir, ACCEPTANCE_MANIFEST_FILENAME)));

    for (const fixture of manifest.fixtures) {
      if (fixture.userProvided) {
        // Never auto-generated; the corpus dir only ships the folder.
        assert.equal(fixture.present, existsSync(fixture.path));
        continue;
      }
      assert.equal(
        fixture.present,
        true,
        `${fixture.id} should have been generated`
      );
      assert.ok(existsSync(fixture.path));
    }
  });
});

test("generateAcceptanceCorpus is safe to call repeatedly (regenerates deterministically)", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
  // Generates the whole corpus twice in sequence; needs double the headroom
  // of the single-generation test above for the same CI-runner-speed reason.
  timeout: 120_000,
}, async () => {
  await withTempDirAsync(async (outDir) => {
    const first = await generateAcceptanceCorpus({ outDir });
    const second = await generateAcceptanceCorpus({ outDir });
    assert.equal(first.fixtures.length, second.fixtures.length);
    for (const fixture of second.fixtures) {
      if (!fixture.userProvided) {
        assert.equal(fixture.present, true);
      }
    }
  });
});

// ── Full deterministic gate: ingest -> edit -> export -> structural verify ──
// Real Whisper transcription runs per fixture (see ACCEPTANCE_OK comment
// above); this is the slow, opt-in path. Both tests below share ONE gate run
// (cached) so the (already slow) full pipeline doesn't run twice.

let cachedReportPromise: ReturnType<typeof runAcceptanceGate> | null = null;
function sharedGateReport() {
  cachedReportPromise ??= runAcceptanceGate();
  return cachedReportPromise;
}

test("runAcceptanceGate passes every generated fixture and skips the absent user-provisioned slot", {
  skip: ACCEPTANCE_OK
    ? false
    : "set OPENKLIP_ACCEPTANCE=1 (and have ffmpeg) to run the full acceptance gate",
  // Real Whisper transcription (5 fixtures, up to 60s of audio) + real
  // ffmpeg encodes comfortably clears node:test's 5s default; matches the
  // timeout convention in tests/embed-service.test.ts.
  timeout: 300_000,
}, async () => {
  const report = await sharedGateReport();

  assert.equal(report.results.length, ACCEPTANCE_FIXTURE_SPECS.length);

  const byId = new Map(report.results.map((r) => [r.id, r]));
  for (const spec of ACCEPTANCE_FIXTURE_SPECS) {
    const result = byId.get(spec.id);
    assert.ok(result, `missing gate result for ${spec.id}`);
    if (spec.id === "talking-head-real") {
      // Never fails CI on a missing user-provisioned fixture.
      assert.equal(result?.status, "skipped");
      continue;
    }
    assert.equal(
      result?.status,
      "pass",
      `${spec.id} failed: ${result?.reason}`
    );
  }

  assert.equal(report.ok, true);
});

test("runAcceptanceGate's structural checks never reference transcript content", {
  skip: ACCEPTANCE_OK
    ? false
    : "set OPENKLIP_ACCEPTANCE=1 (and have ffmpeg) to run the full acceptance gate",
  timeout: 300_000,
}, async () => {
  const report = await sharedGateReport();
  for (const result of report.results) {
    for (const check of result.checks) {
      assert.doesNotMatch(check.name.toLowerCase(), /transcript|word|caption/);
    }
  }
});
