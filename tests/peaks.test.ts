import assert from "node:assert/strict";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { GET } from "../app/api/projects/[slug]/peaks/route.ts";
import { readPcmRange } from "../src/audio-analysis.ts";
import {
  computePeakBuckets,
  DEFAULT_SAMPLE_RATE,
  PeakBucketsError,
} from "../src/audio-analysis-core.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const SR = DEFAULT_SAMPLE_RATE;

function stepPcm(
  lowVal: number,
  highVal: number,
  lowSec: number,
  highSec: number
): Float32Array {
  const total = SR * (lowSec + highSec);
  const pcm = new Float32Array(total);
  const split = Math.round(SR * lowSec);
  for (let i = 0; i < split; i++) {
    pcm[i] = lowVal;
  }
  for (let i = split; i < total; i++) {
    pcm[i] = highVal;
  }
  return pcm;
}

function sinePcm(seconds: number, amplitude = 0.5): Float32Array {
  const total = SR * seconds;
  const pcm = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    pcm[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / SR);
  }
  return pcm;
}

function peaksRequest(slug: string, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return new Request(
    `http://localhost/api/projects/${slug}/peaks?${params.toString()}`
  );
}

function routeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// ── computePeakBuckets (pure math) ─────────────────────────────────────────

test("computePeakBuckets: step function yields known min/max per bucket", () => {
  const pcm = stepPcm(-0.5, 0.8, 1, 1);
  const peaks = computePeakBuckets(pcm, { fromSec: 0, toSec: 2, buckets: 2 });
  assert.equal(peaks.length, 2);
  assert.ok(Math.abs((peaks[0]?.min ?? 0) - -0.5) < 1e-5);
  assert.ok(Math.abs((peaks[0]?.max ?? 0) - -0.5) < 1e-5);
  assert.ok(Math.abs((peaks[1]?.min ?? 0) - 0.8) < 1e-5);
  assert.ok(Math.abs((peaks[1]?.max ?? 0) - 0.8) < 1e-5);
});

test("computePeakBuckets: sine wave buckets bracket the amplitude", () => {
  const pcm = sinePcm(1);
  const peaks = computePeakBuckets(pcm, { fromSec: 0, toSec: 1, buckets: 4 });
  for (const bucket of peaks) {
    assert.ok(bucket.min <= -0.49, `min too high: ${bucket.min}`);
    assert.ok(bucket.max >= 0.49, `max too low: ${bucket.max}`);
  }
});

test("computePeakBuckets: clamps a range beyond EOF without error", () => {
  const pcm = stepPcm(-0.25, 0.75, 1, 1);
  const peaks = computePeakBuckets(pcm, { fromSec: 0, toSec: 99, buckets: 2 });
  assert.equal(peaks.length, 2);
  assert.ok(Math.abs((peaks[0]?.min ?? 0) - -0.25) < 1e-5);
  assert.ok(Math.abs((peaks[0]?.max ?? 0) - -0.25) < 1e-5);
  assert.ok(Math.abs((peaks[1]?.min ?? 0) - 0.75) < 1e-5);
  assert.ok(Math.abs((peaks[1]?.max ?? 0) - 0.75) < 1e-5);
});

test("computePeakBuckets: buckets with no samples report zeros", () => {
  const pcm = new Float32Array(2);
  pcm[0] = -0.9;
  pcm[1] = 0.9;
  const peaks = computePeakBuckets(pcm, { fromSec: 0, toSec: 1, buckets: 8 });
  const empty = peaks.filter((b) => b.min === 0 && b.max === 0);
  const filled = peaks.filter((b) => b.min !== 0 || b.max !== 0);
  assert.ok(empty.length > 0);
  assert.ok(filled.length > 0);
});

test("computePeakBuckets: rejects a degenerate range with PeakBucketsError", () => {
  const pcm = sinePcm(0.5);
  assert.throws(
    () => computePeakBuckets(pcm, { fromSec: 1, toSec: 1, buckets: 4 }),
    PeakBucketsError
  );
  assert.throws(
    () => computePeakBuckets(pcm, { fromSec: 2, toSec: 1, buckets: 4 }),
    PeakBucketsError
  );
});

test("computePeakBuckets: rejects NaN and negative fromSec", () => {
  const pcm = sinePcm(0.5);
  assert.throws(
    () =>
      computePeakBuckets(pcm, {
        fromSec: Number.NaN,
        toSec: 1,
        buckets: 4,
      }),
    PeakBucketsError
  );
  assert.throws(
    () =>
      computePeakBuckets(pcm, {
        fromSec: -1,
        toSec: 1,
        buckets: 4,
      }),
    PeakBucketsError
  );
});

test("computePeakBuckets: clamps bucket count to 1 and 2000", () => {
  const pcm = stepPcm(-1, 1, 1, 0);
  const one = computePeakBuckets(pcm, { fromSec: 0, toSec: 1, buckets: 0 });
  assert.equal(one.length, 1);
  assert.equal(one[0]?.min, -1);
  assert.equal(one[0]?.max, -1);

  const many = computePeakBuckets(pcm, { fromSec: 0, toSec: 1, buckets: 9000 });
  assert.equal(many.length, 2000);
});

// ── readPcmRange (partial file read) ───────────────────────────────────────

test("readPcmRange: reads only the requested byte span", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject());
    const pcm = stepPcm(-0.3, 0.6, 1, 1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const slice = await readPcmRange(slug, 1, 2);
    assert.equal(slice.length, SR);
    assert.ok(Math.abs(slice[0] - 0.6) < 1e-5);
    assert.ok(Math.abs(slice[slice.length - 1] - 0.6) < 1e-5);
  });
});

// ── GET /api/projects/[slug]/peaks ─────────────────────────────────────────

test("GET peaks: returns waveform buckets for a valid project", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = stepPcm(-0.4, 0.9, 1, 1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const res = await GET(
      peaksRequest(slug, { fromSec: "0", toSec: "2", buckets: "2" }),
      routeParams(slug)
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      sampleRate: number;
      fromSec: number;
      toSec: number;
      buckets: [number, number][];
    };
    assert.equal(json.sampleRate, SR);
    assert.equal(json.fromSec, 0);
    assert.equal(json.toSec, 2);
    assert.equal(json.buckets.length, 2);
    assert.ok(Math.abs(json.buckets[0]?.[0] - -0.4) < 1e-5);
    assert.ok(Math.abs(json.buckets[0]?.[1] - -0.4) < 1e-5);
    assert.ok(Math.abs(json.buckets[1]?.[0] - 0.9) < 1e-5);
    assert.ok(Math.abs(json.buckets[1]?.[1] - 0.9) < 1e-5);
  });
});

test("GET peaks: defaults buckets to 400 when omitted", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(0.01);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const res = await GET(
      peaksRequest(slug, { fromSec: "0", toSec: "0.01" }),
      routeParams(slug)
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { buckets: unknown[] };
    assert.equal(json.buckets.length, 400);
  });
});

test("GET peaks: returns 400 for invalid params", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = await GET(
      peaksRequest(slug, { fromSec: "1", toSec: "0.5" }),
      routeParams(slug)
    );
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /toSec/i);
  });
});

test("GET peaks: returns 404 when the project is missing", async () => {
  await withTempProjectsRoot(async () => {
    const res = await GET(
      peaksRequest("missing-project", { fromSec: "0", toSec: "1" }),
      routeParams("missing-project")
    );
    assert.equal(res.status, 404);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /not found/i);
  });
});

test("GET peaks: returns 404 when audio16k.f32 is missing", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assert.ok(!existsSync(projectPaths(slug).audioRaw));

    const res = await GET(
      peaksRequest(slug, { fromSec: "0", toSec: "1" }),
      routeParams(slug)
    );
    assert.equal(res.status, 404);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /audio16k\.f32|re-ingest/i);
    assert.equal(
      json.error?.includes(projectPaths(slug).audioRaw),
      false,
      `404 response leaked the absolute path: ${json.error}`
    );
  });
});

test("GET peaks: a 500 from the PCM read never echoes the absolute filesystem path (info-disclosure guard)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    writeFileSync(projectPaths(slug).audioRaw, Buffer.alloc(SR * 4));
    // A permission-denied audio16k.f32 forces a native fs error (EACCES) out
    // of readPcmRange's open() call instead of the handled "missing" 404
    // path. Node/Bun format EACCES as `EACCES: permission denied, open
    // '<absolute path>'`, exercising the route's generic catch(e) -> 500
    // branch with an error whose message genuinely contains the path.
    chmodSync(projectPaths(slug).audioRaw, 0o000);
    try {
      const res = await GET(
        peaksRequest(slug, { fromSec: "0", toSec: "1" }),
        routeParams(slug)
      );
      assert.equal(res.status, 500);
      const json = (await res.json()) as { error?: string };
      assert.equal(
        json.error?.includes(projectPaths(slug).audioRaw),
        false,
        `500 response leaked the absolute path: ${json.error}`
      );
    } finally {
      chmodSync(projectPaths(slug).audioRaw, 0o644);
    }
  });
});

test("GET peaks: returns 400 when clamped window exceeds MAX_PEAK_WINDOW_SEC", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(130);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const res = await GET(
      peaksRequest(slug, { fromSec: "0", toSec: "130" }),
      routeParams(slug)
    );
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /120/i);
  });
});

test("GET peaks: returns 200 when clamped window is exactly MAX_PEAK_WINDOW_SEC", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(120);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const res = await GET(
      peaksRequest(slug, { fromSec: "0", toSec: "120", buckets: "4" }),
      routeParams(slug)
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { buckets: unknown[] };
    assert.equal(json.buckets.length, 4);
  });
});

test("GET peaks: returns 400 for negative fromSec before clamping", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const res = await GET(
      peaksRequest(slug, { fromSec: "-10", toSec: "1" }),
      routeParams(slug)
    );
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /fromSec/i);
  });
});

test("GET peaks: returns 400 for non-positive buckets", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    for (const buckets of ["0", "-5"]) {
      const res = await GET(
        peaksRequest(slug, { fromSec: "0", toSec: "1", buckets }),
        routeParams(slug)
      );
      assert.equal(res.status, 400, `buckets=${buckets}`);
      const json = (await res.json()) as { error?: string };
      assert.match(json.error ?? "", /buckets/i);
    }
  });
});

test("GET peaks: returns 400 for NaN and Infinity query params", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const pcm = sinePcm(1);
    writeFileSync(
      projectPaths(slug).audioRaw,
      Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    );

    const nanRes = await GET(
      peaksRequest(slug, { fromSec: "NaN", toSec: "1" }),
      routeParams(slug)
    );
    assert.equal(nanRes.status, 400);

    const infRes = await GET(
      peaksRequest(slug, { fromSec: "0", toSec: "Infinity" }),
      routeParams(slug)
    );
    assert.equal(infRes.status, 400);
  });
});
