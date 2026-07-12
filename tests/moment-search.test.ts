import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { SceneLog } from "../src/edl.ts";
import { FFMPEG, run } from "../src/ffmpeg.ts";
import {
  buildMomentIndex,
  clusterMoments,
  DEFAULT_MOMENT_MIN_SCORE,
  DEFAULT_PEAK_MARGIN,
  decodeVectors,
  embedQueryText,
  encodeVectors,
  indexIsCurrent,
  isMomentIndexCurrent,
  MOMENT_MODEL,
  type MomentIndexFile,
  mergeSceneResults,
  momentIndexPath,
  prunePeakRelative,
  searchScenes,
  summaryMatches,
  topKFrames,
} from "../src/moment-search.ts";
// Pure, fs-free sibling of moment-search.ts (see its own header): tested
// here alongside the rest of the moment-search suite even though it is not
// re-exported from moment-search.ts itself (that would be a barrel export).
import { frameNameForTime } from "../src/moment-search-frame-name.ts";
import { projectPaths } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const FRAME_STEP = 3;

function makeIndex(overrides: Partial<MomentIndexFile> = {}): MomentIndexFile {
  return {
    version: 1,
    model: MOMENT_MODEL,
    dim: 2,
    frameStepSec: FRAME_STEP,
    frames: [
      { name: "0001.jpg", atSec: 0 },
      { name: "0002.jpg", atSec: 3 },
    ],
    vectorsB64: "",
    ...overrides,
  };
}

// ── encodeVectors / decodeVectors ─────────────────────────────────────────

test("encodeVectors/decodeVectors round-trip exact float values", () => {
  const original = new Float32Array([0, 1, -1, 0.5, -0.333, 123.456, -9999.5]);
  const b64 = encodeVectors(original);
  const decoded = decodeVectors(b64, 1, original.length);
  assert.deepEqual(Array.from(decoded), Array.from(original));
});

test("encodeVectors/decodeVectors round-trips a multi-frame matrix by count and dim", () => {
  const dim = 3;
  const count = 4;
  const original = Float32Array.from({ length: dim * count }, (_, i) => i - 6);
  const b64 = encodeVectors(original);
  const decoded = decodeVectors(b64, count, dim);
  assert.deepEqual(Array.from(decoded), Array.from(original));
});

test("encodeVectors handles a Float32Array view with a non-zero byte offset", () => {
  const buffer = new ArrayBuffer(32);
  const backing = new Float32Array(buffer);
  backing.set([9, 9, 1, 2, 3, 9]);
  const view = new Float32Array(buffer, 4, 3);
  assert.deepEqual(Array.from(view), [9, 1, 2]);
  const b64 = encodeVectors(view);
  const decoded = decodeVectors(b64, 1, 3);
  assert.deepEqual(Array.from(decoded), [9, 1, 2]);
});

test("decodeVectors throws when the decoded byte length is not a multiple of 4", () => {
  const badB64 = Buffer.from(new Uint8Array([1, 2, 3])).toString("base64");
  assert.throws(() => decodeVectors(badB64, 1, 1));
});

test("decodeVectors throws when byte length does not match count*dim", () => {
  const vectors = new Float32Array([1, 2, 3, 4]);
  const b64 = encodeVectors(vectors);
  assert.throws(() => decodeVectors(b64, 1, 1));
});

// ── indexIsCurrent ─────────────────────────────────────────────────────────

test("indexIsCurrent is true for a matching model and frame list", () => {
  const idx = makeIndex();
  assert.equal(
    indexIsCurrent(idx, ["0001.jpg", "0002.jpg"], MOMENT_MODEL),
    true
  );
});

test("indexIsCurrent is false when the model differs", () => {
  const idx = makeIndex();
  assert.equal(
    indexIsCurrent(idx, ["0001.jpg", "0002.jpg"], "some-other-model"),
    false
  );
});

test("indexIsCurrent is false when a frame was added", () => {
  const idx = makeIndex();
  assert.equal(
    indexIsCurrent(idx, ["0001.jpg", "0002.jpg", "0003.jpg"], MOMENT_MODEL),
    false
  );
});

test("indexIsCurrent is false when a frame was removed", () => {
  const idx = makeIndex();
  assert.equal(indexIsCurrent(idx, ["0001.jpg"], MOMENT_MODEL), false);
});

// ── frameNameForTime ─────────────────────────────────────────────────────

test("frameNameForTime maps 0s to the first frame", () => {
  assert.equal(frameNameForTime(0), "0001.jpg");
});

test("frameNameForTime floors within a frame's span (still frame 1 before the 3s boundary)", () => {
  assert.equal(frameNameForTime(2.9), "0001.jpg");
});

test("frameNameForTime rolls over to the next frame exactly at the step boundary", () => {
  assert.equal(frameNameForTime(3), "0002.jpg");
});

test("frameNameForTime clamps negative seconds to the first frame", () => {
  assert.equal(frameNameForTime(-5), "0001.jpg");
});

test("frameNameForTime respects a custom stepSec", () => {
  assert.equal(frameNameForTime(9, 5), "0002.jpg");
  assert.equal(frameNameForTime(11, 5), "0003.jpg");
});

test("frameNameForTime does not truncate indices beyond 4 digits", () => {
  assert.equal(frameNameForTime(3 * 10_000), "10001.jpg");
});

// ── topKFrames ─────────────────────────────────────────────────────────────

test("topKFrames returns dot-product scores sorted descending", () => {
  const dim = 2;
  const vectors = new Float32Array([1, 0, 0, 1, 0.6, 0.8]);
  const query = new Float32Array([0.6, 0.8]);
  const top = topKFrames(vectors, dim, query, 3);
  assert.deepEqual(
    top.map((t) => t.frameIdx),
    [2, 1, 0]
  );
  assert.ok(top[0].score > top[1].score);
  assert.ok(top[1].score > top[2].score);
});

test("topKFrames breaks ties by ascending frameIdx", () => {
  const dim = 1;
  const vectors = new Float32Array([0.5, 0.5, 0.5]);
  const query = new Float32Array([1]);
  const top = topKFrames(vectors, dim, query, 3);
  assert.deepEqual(
    top.map((t) => t.frameIdx),
    [0, 1, 2]
  );
});

test("topKFrames caps output at k and returns all when k exceeds frame count", () => {
  const dim = 1;
  const vectors = new Float32Array([0.1, 0.9, 0.5]);
  const query = new Float32Array([1]);
  assert.equal(topKFrames(vectors, dim, query, 2).length, 2);
  assert.equal(topKFrames(vectors, dim, query, 100).length, 3);
});

test("topKFrames returns empty for k<=0 or zero frames", () => {
  assert.deepEqual(
    topKFrames(new Float32Array([1]), 1, new Float32Array([1]), 0),
    []
  );
  assert.deepEqual(
    topKFrames(new Float32Array([]), 2, new Float32Array([1, 0]), 5),
    []
  );
});

// ── clusterMoments ───────────────────────────────────────────────────────

test("clusterMoments merges hits within gapSec into one moment", () => {
  const hits = [
    { atSec: 0, score: 0.5, name: "0001.jpg" },
    { atSec: 3, score: 0.6, name: "0002.jpg" },
    { atSec: 6, score: 0.4, name: "0003.jpg" },
  ];
  const moments = clusterMoments(hits, {
    minScore: 0,
    maxMoments: 10,
    frameStepSec: FRAME_STEP,
  });
  assert.equal(moments.length, 1);
  assert.equal(moments[0].fromSec, 0);
  assert.equal(moments[0].toSec, 6 + FRAME_STEP);
  assert.equal(moments[0].score, 0.6);
  assert.equal(moments[0].bestFrame, "0002.jpg");
  assert.equal(moments[0].bestAtSec, 3);
});

test("clusterMoments splits hits separated by more than gapSec", () => {
  const hits = [
    { atSec: 0, score: 0.5, name: "a.jpg" },
    { atSec: 20, score: 0.9, name: "b.jpg" },
  ];
  const moments = clusterMoments(hits, {
    minScore: 0,
    maxMoments: 10,
    frameStepSec: FRAME_STEP,
    gapSec: 6.01,
  });
  assert.equal(moments.length, 2);
  assert.equal(moments[0].bestFrame, "b.jpg");
  assert.equal(moments[1].bestFrame, "a.jpg");
});

test("clusterMoments defaults gapSec to 6.01s when not provided", () => {
  const hits = [
    { atSec: 0, score: 0.5, name: "a.jpg" },
    { atSec: 6, score: 0.5, name: "b.jpg" },
  ];
  const moments = clusterMoments(hits, {
    minScore: 0,
    maxMoments: 10,
    frameStepSec: FRAME_STEP,
  });
  assert.equal(moments.length, 1);
});

test("clusterMoments drops hits below minScore before clustering", () => {
  const hits = [
    { atSec: 0, score: 0.1, name: "a.jpg" },
    { atSec: 3, score: 0.5, name: "b.jpg" },
  ];
  const moments = clusterMoments(hits, {
    minScore: 0.3,
    maxMoments: 10,
    frameStepSec: FRAME_STEP,
  });
  assert.equal(moments.length, 1);
  assert.equal(moments[0].fromSec, 3);
  assert.equal(moments[0].bestFrame, "b.jpg");
});

test("clusterMoments caps output at maxMoments, keeping the highest scores", () => {
  const hits = [
    { atSec: 0, score: 0.9, name: "a.jpg" },
    { atSec: 20, score: 0.8, name: "b.jpg" },
    { atSec: 40, score: 0.7, name: "c.jpg" },
  ];
  const moments = clusterMoments(hits, {
    minScore: 0,
    maxMoments: 2,
    frameStepSec: FRAME_STEP,
  });
  assert.equal(moments.length, 2);
  assert.deepEqual(
    moments.map((m) => m.bestFrame),
    ["a.jpg", "b.jpg"]
  );
});

test("clusterMoments returns a single-hit moment spanning one frame step", () => {
  const hits = [{ atSec: 30, score: 0.4, name: "x.jpg" }];
  const moments = clusterMoments(hits, {
    minScore: 0,
    maxMoments: 10,
    frameStepSec: FRAME_STEP,
  });
  assert.equal(moments.length, 1);
  assert.equal(moments[0].fromSec, 30);
  assert.equal(moments[0].toSec, 33);
  assert.equal(moments[0].bestAtSec, 30);
});

test("clusterMoments returns empty when every hit is below minScore", () => {
  const hits = [{ atSec: 0, score: 0.1, name: "x.jpg" }];
  const moments = clusterMoments(hits, {
    minScore: 0.5,
    maxMoments: 10,
    frameStepSec: FRAME_STEP,
  });
  assert.deepEqual(moments, []);
});

// ── summaryMatches ─────────────────────────────────────────────────────────

test("summaryMatches returns empty for a null or undefined sceneLog", () => {
  assert.deepEqual(summaryMatches(null, "dog"), []);
  assert.deepEqual(summaryMatches(undefined, "dog"), []);
});

test("summaryMatches returns empty when there are no segments", () => {
  assert.deepEqual(summaryMatches({ segments: [] }, "dog"), []);
});

test("summaryMatches is case-insensitive", () => {
  const matches = summaryMatches(
    { segments: [{ fromSec: 0, toSec: 5, summary: "A Dog Runs" }] },
    "DOG"
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].score, 1);
});

test("summaryMatches scores by the fraction of distinct query tokens present", () => {
  const matches = summaryMatches(
    { segments: [{ fromSec: 0, toSec: 5, summary: "a dog runs in the park" }] },
    "dog cat"
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].score, 0.5);
});

test("summaryMatches excludes segments with zero token overlap", () => {
  const matches = summaryMatches(
    {
      segments: [
        { fromSec: 0, toSec: 5, summary: "a cat sleeps" },
        { fromSec: 5, toSec: 10, summary: "a dog runs" },
      ],
    },
    "dog"
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].fromSec, 5);
});

// ── mergeSceneResults ────────────────────────────────────────────────────

test("mergeSceneResults merges an overlapping summary into an embedding moment as both", () => {
  const embeddingMoments = [
    {
      fromSec: 10,
      toSec: 16,
      score: 0.3,
      bestFrame: "0004.jpg",
      bestAtSec: 12,
    },
  ];
  const summaryMoments = [
    { fromSec: 12, toSec: 20, score: 0.8, summary: "people laughing" },
  ];
  const results = mergeSceneResults(embeddingMoments, summaryMoments, 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "both");
  assert.equal(results[0].score, 0.8);
  assert.equal(results[0].summary, "people laughing");
  assert.equal(results[0].fromSec, 10);
  assert.equal(results[0].toSec, 16);
  assert.equal(results[0].bestFrame, "0004.jpg");
});

test("mergeSceneResults keeps non-overlapping items separate", () => {
  const embeddingMoments = [
    { fromSec: 0, toSec: 3, score: 0.5, bestFrame: "a.jpg", bestAtSec: 0 },
  ];
  const summaryMoments = [
    { fromSec: 50, toSec: 55, score: 0.9, summary: "unrelated" },
  ];
  const results = mergeSceneResults(embeddingMoments, summaryMoments, 10);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((r) => r.source).sort(), [
    "embedding",
    "summary",
  ]);
});

test("mergeSceneResults treats touching (non-overlapping) intervals as separate", () => {
  const embeddingMoments = [
    { fromSec: 0, toSec: 10, score: 0.5, bestFrame: "a.jpg", bestAtSec: 0 },
  ];
  const summaryMoments = [
    { fromSec: 10, toSec: 15, score: 0.9, summary: "touching" },
  ];
  const results = mergeSceneResults(embeddingMoments, summaryMoments, 10);
  assert.equal(results.length, 2);
});

test("mergeSceneResults ranks by score descending", () => {
  const embeddingMoments = [
    { fromSec: 0, toSec: 3, score: 0.2, bestFrame: "a.jpg", bestAtSec: 0 },
  ];
  const summaryMoments = [
    { fromSec: 50, toSec: 55, score: 0.9, summary: "top" },
  ];
  const results = mergeSceneResults(embeddingMoments, summaryMoments, 10);
  assert.equal(results[0].summary, "top");
});

test("mergeSceneResults truncates to limit", () => {
  const embeddingMoments = Array.from({ length: 5 }, (_, i) => ({
    fromSec: i * 100,
    toSec: i * 100 + 3,
    score: 0.1 * (i + 1),
    bestFrame: `f${i}.jpg`,
    bestAtSec: i * 100,
  }));
  const results = mergeSceneResults(embeddingMoments, [], 2);
  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((r) => r.bestFrame),
    ["f4.jpg", "f3.jpg"]
  );
});

test("mergeSceneResults attaches the highest-scoring overlapping summary and consumes all overlaps", () => {
  const embeddingMoments = [
    { fromSec: 0, toSec: 20, score: 0.5, bestFrame: "a.jpg", bestAtSec: 0 },
  ];
  const summaryMoments = [
    { fromSec: 1, toSec: 5, score: 0.3, summary: "low" },
    { fromSec: 10, toSec: 15, score: 0.9, summary: "high" },
  ];
  const results = mergeSceneResults(embeddingMoments, summaryMoments, 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].source, "both");
  assert.equal(results[0].summary, "high");
  assert.equal(results[0].score, 0.9);
});

test("mergeSceneResults lets the first (highest-scoring) embedding moment claim a contested summary overlap", () => {
  const embeddingMoments = [
    { fromSec: 0, toSec: 10, score: 0.5, bestFrame: "a.jpg", bestAtSec: 0 },
    { fromSec: 5, toSec: 15, score: 0.3, bestFrame: "b.jpg", bestAtSec: 5 },
  ];
  const summaryMoments = [
    { fromSec: 4, toSec: 12, score: 0.6, summary: "shared" },
  ];
  const results = mergeSceneResults(embeddingMoments, summaryMoments, 10);
  assert.equal(results.length, 2);
  const both = results.find((r) => r.source === "both");
  assert.equal(both?.bestFrame, "a.jpg");
  const embeddingOnly = results.find((r) => r.source === "embedding");
  assert.equal(embeddingOnly?.bestFrame, "b.jpg");
});

// ── searchScenes ─────────────────────────────────────────────────────────

test("searchScenes returns indexed:false when the sidecar index is missing", async () => {
  await withTempProjectsRoot(({ slug }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    const result = searchScenes(
      slug,
      project,
      new Float32Array([1, 0]),
      "hello"
    );
    assert.equal(result.indexed, false);
    assert.deepEqual(result.results, []);
  });
});

test("searchScenes returns indexed:false when the sidecar is stale (frame list changed)", async () => {
  await withTempProjectsRoot(({ slug }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    const framesDir = projectPaths(slug).frames;
    mkdirSync(framesDir, { recursive: true });
    writeFileSync(join(framesDir, "0001.jpg"), "fake");
    writeFileSync(join(framesDir, "0002.jpg"), "fake");

    const staleIndex = makeIndex({
      frames: [{ name: "0001.jpg", atSec: 0 }],
      vectorsB64: encodeVectors(new Float32Array([1, 0])),
    });
    writeFileSync(momentIndexPath(slug), JSON.stringify(staleIndex));

    const result = searchScenes(
      slug,
      project,
      new Float32Array([1, 0]),
      "hello"
    );
    assert.equal(result.indexed, false);
  });
});

test("searchScenes returns ranked results for a current sidecar index", async () => {
  await withTempProjectsRoot(({ slug }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    const framesDir = projectPaths(slug).frames;
    mkdirSync(framesDir, { recursive: true });
    writeFileSync(join(framesDir, "0001.jpg"), "fake");
    writeFileSync(join(framesDir, "0002.jpg"), "fake");

    const vectors = new Float32Array([1, 0, 0, 1]);
    const index = makeIndex({
      dim: 2,
      frames: [
        { name: "0001.jpg", atSec: 0 },
        { name: "0002.jpg", atSec: 3 },
      ],
      vectorsB64: encodeVectors(vectors),
    });
    writeFileSync(momentIndexPath(slug), JSON.stringify(index));

    const result = searchScenes(
      slug,
      project,
      new Float32Array([1, 0]),
      "hello",
      {
        limit: 10,
      }
    );
    assert.equal(result.indexed, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].source, "embedding");
    assert.equal(result.results[0].bestFrame, "0001.jpg");
  });
});

test("searchScenes blends scene-log summary matches with embedding moments", async () => {
  await withTempProjectsRoot(({ slug }) => {
    const sceneLog: SceneLog = {
      analyzedAt: "2026-01-01T00:00:00.000Z",
      segments: [
        { fromSec: 0, toSec: 6, summary: "a dog runs across the yard" },
      ],
    };
    const project = makeProject({ slug, sceneLog });
    writeFixtureProject(slug, project);
    const framesDir = projectPaths(slug).frames;
    mkdirSync(framesDir, { recursive: true });
    writeFileSync(join(framesDir, "0001.jpg"), "fake");

    const index = makeIndex({
      dim: 2,
      frames: [{ name: "0001.jpg", atSec: 0 }],
      vectorsB64: encodeVectors(new Float32Array([1, 0])),
    });
    writeFileSync(momentIndexPath(slug), JSON.stringify(index));

    const result = searchScenes(
      slug,
      project,
      new Float32Array([1, 0]),
      "dog",
      {
        limit: 10,
      }
    );
    assert.equal(result.indexed, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].source, "both");
    assert.equal(result.results[0].summary, "a dog runs across the yard");
  });
});

// ── isMomentIndexCurrent ─────────────────────────────────────────────────

test("isMomentIndexCurrent is false when no sidecar index exists", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    assert.equal(isMomentIndexCurrent(slug), false);
  });
});

test("isMomentIndexCurrent is true for a current sidecar and flips false once frames change", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const framesDir = projectPaths(slug).frames;
    mkdirSync(framesDir, { recursive: true });
    writeFileSync(join(framesDir, "0001.jpg"), "fake");

    const index = makeIndex({
      dim: 2,
      frames: [{ name: "0001.jpg", atSec: 0 }],
      vectorsB64: encodeVectors(new Float32Array([1, 0])),
    });
    writeFileSync(momentIndexPath(slug), JSON.stringify(index));

    assert.equal(isMomentIndexCurrent(slug), true);

    writeFileSync(join(framesDir, "0002.jpg"), "fake-2");
    assert.equal(isMomentIndexCurrent(slug), false);
  });
});

// ── buildMomentIndex (non-spawning shortcut paths only; no network) ──────

test("buildMomentIndex skips with no-frames when the frames dir has no jpgs", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await buildMomentIndex(slug);
    assert.equal(result.built, false);
    assert.equal(result.skippedReason, "no-frames");
    assert.equal(result.frameCount, 0);
    assert.equal(result.model, MOMENT_MODEL);
  });
});

test("buildMomentIndex skips with current when an up-to-date index already exists", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const framesDir = projectPaths(slug).frames;
    mkdirSync(framesDir, { recursive: true });
    writeFileSync(join(framesDir, "0001.jpg"), "fake");

    const index = makeIndex({
      dim: 2,
      frames: [{ name: "0001.jpg", atSec: 0 }],
      vectorsB64: encodeVectors(new Float32Array([1, 0])),
    });
    writeFileSync(momentIndexPath(slug), JSON.stringify(index));

    const result = await buildMomentIndex(slug);
    assert.equal(result.built, false);
    assert.equal(result.skippedReason, "current");
    assert.equal(result.frameCount, 1);
  });
});

// ── Integration: real embed.mjs + ffmpeg-generated solid-color frames ────
// Opt-in like the rest of the repo's networked/real-binary smokes: needs
// ffmpeg to synthesize frames AND a live download of the CLIP weights on
// first run (cached under ~/.cache/huggingface after that).

const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);
const RUN_INTEGRATION = process.env.OPENKLIP_INTEGRATION === "1";

test("embed.mjs indexes solid-color frames and ranks the matching color first", {
  skip:
    RUN_INTEGRATION && FFMPEG_OK
      ? false
      : "set OPENKLIP_INTEGRATION=1 and ensure ffmpeg is available to run this test",
  // Real model inference (vision + text encoders on 3 frames), well past
  // bun test's 5s default; generous because a cold cache also downloads the
  // CLIP weights first.
  timeout: 300_000,
}, async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const framesDir = projectPaths(slug).frames;
    mkdirSync(framesDir, { recursive: true });

    const frames: Array<[string, string]> = [
      ["0001.jpg", "red"],
      ["0002.jpg", "blue"],
      ["0003.jpg", "green"],
    ];
    for (const [name, color] of frames) {
      await run(
        FFMPEG,
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=${color}:s=224x224:d=1`,
          "-frames:v",
          "1",
          join(framesDir, name),
        ],
        `ffmpeg(moment-search-fixture-${color})`
      );
    }

    const buildResult = await buildMomentIndex(slug, { force: true });
    assert.equal(buildResult.built, true);
    assert.equal(buildResult.frameCount, 3);

    const { vector } = await embedQueryText("a red image");
    const indexFile = JSON.parse(
      readFileSync(momentIndexPath(slug), "utf8")
    ) as MomentIndexFile;
    const vectors = decodeVectors(
      indexFile.vectorsB64,
      indexFile.frames.length,
      indexFile.dim
    );
    const top = topKFrames(vectors, indexFile.dim, vector, 3);
    assert.equal(indexFile.frames[top[0].frameIdx].name, "0001.jpg");
  });
});

test("DEFAULT_MOMENT_MIN_SCORE is a sane rank-only threshold", () => {
  assert.ok(DEFAULT_MOMENT_MIN_SCORE > 0 && DEFAULT_MOMENT_MIN_SCORE < 1);
});

test("prunePeakRelative keeps only hits within the margin of the peak", () => {
  const hits = [
    { atSec: 0, score: 0.3, name: "0001.jpg" },
    { atSec: 3, score: 0.29, name: "0002.jpg" },
    { atSec: 6, score: 0.26, name: "0003.jpg" },
    { atSec: 9, score: 0.24, name: "0004.jpg" },
  ];
  const kept = prunePeakRelative(hits, 0.02);
  assert.deepEqual(
    kept.map((h) => h.name),
    ["0001.jpg", "0002.jpg"]
  );
});

test("prunePeakRelative keeps peak ties and ignores hit order", () => {
  const hits = [
    { atSec: 9, score: 0.24, name: "0004.jpg" },
    { atSec: 0, score: 0.31, name: "0001.jpg" },
    { atSec: 3, score: 0.31, name: "0002.jpg" },
  ];
  const kept = prunePeakRelative(hits, 0.02);
  assert.deepEqual(
    kept.map((h) => h.name),
    ["0001.jpg", "0002.jpg"]
  );
});

test("prunePeakRelative on empty input returns empty", () => {
  assert.deepEqual(prunePeakRelative([], 0.02), []);
});

test("prunePeakRelative default margin cuts between-scene connective tissue", () => {
  // Shape from the measured ground-truth probe: a real scene peaking ~0.30
  // with the rest of the video sitting ~0.24-0.26. Without pruning, every
  // frame above the 0.26 floor chains into one video-length moment.
  const hits = [
    { atSec: 0, score: 0.299, name: "0001.jpg" },
    { atSec: 3, score: 0.298, name: "0002.jpg" },
    { atSec: 6, score: 0.26, name: "0003.jpg" },
    { atSec: 9, score: 0.262, name: "0004.jpg" },
  ];
  const kept = prunePeakRelative(hits);
  assert.deepEqual(
    kept.map((h) => h.name),
    ["0001.jpg", "0002.jpg"]
  );
  assert.ok(DEFAULT_PEAK_MARGIN > 0 && DEFAULT_PEAK_MARGIN < 0.1);
});
