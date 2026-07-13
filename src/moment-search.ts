// Local visual moment search: embed every ingest frame with a local CLIP
// model (src/embed.mjs), store a sidecar index next to the frames, and
// answer text queries by cosine similarity, clustered into moments, blended
// with fuzzy matches over scene-log summaries (src/scene-log.ts). Everything
// below except buildMomentIndex/embedQueryText is pure (no fs, no spawn) so
// it is unit-testable without a project on disk; those two functions are the
// Bun-side IO boundary that spawns src/embed.mjs under Node.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import type { Project } from "./edl.ts";
import { projectPaths } from "./paths.ts";
import { normalizeText } from "./phrase-match.ts";
import { acquireProjectFileLock } from "./project-file-lock.ts";
import { withMomentIndexLock } from "./project-lock.ts";
import { embedScriptPath } from "./script-paths.ts";

// frameNameForTime (the inverse of frameTimeSec) lives in its own fs-free
// module, ./moment-search-frame-name.ts, not here: linting this file's
// barrel-style re-export of it as noBarrelFile, and more importantly the
// web Search panel needs to value-import it directly without pulling in
// this file's node:fs import (see that module's header). Import it from
// there directly; this file does not re-export it.

// Mirrors MOMENT_MODEL in src/embed.mjs. That script runs under plain Node
// (never Bun: see its own header comment) and dynamically imports
// @huggingface/transformers unconditionally at module scope, so this file
// must not import it directly, which means the model name can't be shared
// as one constant across the process boundary. Keep the two literals in
// sync by hand.
export const MOMENT_MODEL = "Xenova/clip-vit-base-patch32";

// CLIP cosine-similarity scores are not calibrated across queries, but a
// measured ground-truth probe (four known synthetic scenes: blue / SMPTE
// bars / mandelbrot / black, plus uniform-color and dark real projects)
// separated cleanly at this floor: every correct query peaked >= 0.275
// while every absurd query ("a red car" on a talking-head, "laughing" on
// black frames) peaked <= 0.249. Frames below the floor never make a
// moment. Revisit against real search transcripts once they exist.
export const DEFAULT_MOMENT_MIN_SCORE = 0.26;

// Second, per-query gate: keep only frames scoring within this margin of
// the query's own best frame. Raw CLIP scores compress into a narrow band
// (the same probe put non-matching scenes only ~0.04 below the matching
// one), so without peak-relative pruning every above-floor frame chains
// through clusterMoments into one video-length moment and localization is
// lost. 0.02 kept each probe query's true scene intact while cutting the
// connective tissue between scenes.
export const DEFAULT_PEAK_MARGIN = 0.02;

// Merge matched frames into one moment while they are at most one "missed"
// frame apart: 2 * the 3s ingest frame step, plus a small floating-point
// margin so an exact 6s gap (two steps) can't fall on the wrong side of the
// comparison due to atSec arithmetic.
export const DEFAULT_MOMENT_GAP_SEC = 6.01;

export const DEFAULT_SEARCH_LIMIT = 24;

// ── Sidecar index file format ──────────────────────────────────────────────

export interface MomentIndexFrame {
  atSec: number;
  name: string;
}

// working/moment-index.json. ~600 frames x 512 dims (f32, base64) is about
// 1.2MB : one JSON sidecar is fine, no need for a separate binary file.
export interface MomentIndexFile {
  dim: number;
  frameStepSec: number;
  frames: MomentIndexFrame[];
  model: string;
  vectorsB64: string;
  version: 1;
}

export function momentIndexPath(slug: string): string {
  return projectPaths(slug).momentIndex;
}

// ── Vector (de)serialization ───────────────────────────────────────────────

export function encodeVectors(vectors: Float32Array): string {
  return Buffer.from(
    vectors.buffer,
    vectors.byteOffset,
    vectors.byteLength
  ).toString("base64");
}

export function decodeVectors(
  b64: string,
  count: number,
  dim: number
): Float32Array {
  const expectedBytes = count * dim * 4;
  const buf = Buffer.from(b64, "base64");
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `moment index vector data size mismatch: expected ${expectedBytes} bytes for ${count}x${dim} f32, got ${buf.byteLength}`
    );
  }
  // Buffer.from(base64) can return a view whose byteOffset into Node's
  // shared pool is not a multiple of 4; Float32Array requires 4-byte
  // alignment, so copy into a fresh, aligned buffer rather than viewing
  // buf.buffer directly.
  const aligned = new Uint8Array(expectedBytes);
  aligned.set(buf);
  return new Float32Array(aligned.buffer);
}

// ── Freshness ──────────────────────────────────────────────────────────────

// Same model AND same frame name list (order-sensitive: both sides are
// sorted filenames from the same readdirSync+sort convention). Either
// changing lets a rebuild pick up new/removed frames or a model swap.
export function indexIsCurrent(
  index: MomentIndexFile,
  frameNames: string[],
  model: string
): boolean {
  if (index.model !== model) {
    return false;
  }
  if (index.frames.length !== frameNames.length) {
    return false;
  }
  for (let i = 0; i < frameNames.length; i++) {
    if (index.frames[i].name !== frameNames[i]) {
      return false;
    }
  }
  return true;
}

// ── Top-K similarity ─────────────────────────────────────────────────────

export interface FrameScore {
  frameIdx: number;
  score: number;
}

// vectors is frameCount*dim contiguous f32; both frame and query vectors are
// L2-normalized by the embedder (src/embed.mjs), so similarity is a plain
// dot product. Sort is a fully deterministic total order (score desc, then
// frameIdx asc) rather than relying on the engine's sort-stability guarantee
// for equal scores.
export function topKFrames(
  vectors: Float32Array,
  dim: number,
  queryVec: Float32Array,
  k: number
): FrameScore[] {
  const frameCount = dim > 0 ? Math.floor(vectors.length / dim) : 0;
  const scores: FrameScore[] = [];
  for (let f = 0; f < frameCount; f++) {
    const base = f * dim;
    let dot = 0;
    for (let d = 0; d < dim; d++) {
      dot += vectors[base + d] * queryVec[d];
    }
    scores.push({ frameIdx: f, score: dot });
  }
  scores.sort((a, b) => b.score - a.score || a.frameIdx - b.frameIdx);
  return scores.slice(0, Math.max(0, k));
}

// ── Clustering ─────────────────────────────────────────────────────────────

export interface MomentHit {
  atSec: number;
  name: string;
  score: number;
}

export interface Moment {
  bestAtSec: number;
  bestFrame: string;
  fromSec: number;
  score: number;
  toSec: number;
}

// Keep only hits scoring within `margin` of the best hit. Applied before
// clustering: raw CLIP scores sit in a narrow band, so without this the
// merely-above-floor frames between two real scenes chain everything into
// one video-length moment (see DEFAULT_PEAK_MARGIN for the measured basis).
// Empty input stays empty; ties with the peak always survive.
export function prunePeakRelative(
  hits: MomentHit[],
  margin = DEFAULT_PEAK_MARGIN
): MomentHit[] {
  if (hits.length === 0) {
    return hits;
  }
  let peak = hits[0].score;
  for (const h of hits) {
    if (h.score > peak) {
      peak = h.score;
    }
  }
  const cutoff = peak - margin;
  return hits.filter((h) => h.score >= cutoff);
}

export interface ClusterMomentsOptions {
  frameStepSec: number;
  gapSec?: number;
  maxMoments: number;
  minScore: number;
}

// Drop hits below minScore, then merge the survivors into moments whenever
// consecutive (by time) hits are at most gapSec apart. Each moment's score
// is the max hit score in its group (scores are ranks, not probabilities,
// so "best frame in the span" is the meaningful summary); toSec extends one
// frame step past the last hit so the moment covers that frame's own span.
export function clusterMoments(
  hits: MomentHit[],
  opts: ClusterMomentsOptions
): Moment[] {
  const gapSec = opts.gapSec ?? DEFAULT_MOMENT_GAP_SEC;
  const kept = hits.filter((h) => h.score >= opts.minScore);
  if (kept.length === 0) {
    return [];
  }

  const sorted = [...kept].sort(
    (a, b) => a.atSec - b.atSec || a.name.localeCompare(b.name)
  );
  const groups: MomentHit[][] = [];
  let current: MomentHit[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const hit = sorted[i];
    const prev = current.at(-1) as MomentHit;
    if (hit.atSec - prev.atSec <= gapSec) {
      current.push(hit);
    } else {
      groups.push(current);
      current = [hit];
    }
  }
  groups.push(current);

  const moments = groups.map((group): Moment => {
    const first = group[0];
    const last = group.at(-1) as MomentHit;
    let best = group[0];
    for (const h of group) {
      if (h.score > best.score) {
        best = h;
      }
    }
    return {
      fromSec: first.atSec,
      toSec: last.atSec + opts.frameStepSec,
      score: best.score,
      bestFrame: best.name,
      bestAtSec: best.atSec,
    };
  });

  moments.sort((a, b) => b.score - a.score || a.fromSec - b.fromSec);
  return moments.slice(0, opts.maxMoments);
}

// ── Scene-log free-text matches ───────────────────────────────────────────

export interface SceneLogSegmentLike {
  fromSec: number;
  summary: string;
  toSec: number;
}

export interface SceneLogLike {
  segments: SceneLogSegmentLike[];
}

export interface SummaryMatch {
  fromSec: number;
  score: number;
  summary: string;
  toSec: number;
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

// Case-insensitive token-overlap score: the fraction of the query's DISTINCT
// tokens that appear anywhere in the segment summary's token set.
// Deduplicating the query tokens keeps a repeated word ("the dog and the
// cat") from inflating its own weight in the fraction. Only segments with
// score > 0 are returned.
export function summaryMatches(
  sceneLog: SceneLogLike | null | undefined,
  query: string
): SummaryMatch[] {
  const segments = sceneLog?.segments ?? [];
  if (segments.length === 0) {
    return [];
  }
  const queryTokens = Array.from(new Set(tokenize(query)));
  if (queryTokens.length === 0) {
    return [];
  }
  const results: SummaryMatch[] = [];
  for (const seg of segments) {
    const summaryTokens = new Set(tokenize(seg.summary));
    const present = queryTokens.filter((t) => summaryTokens.has(t)).length;
    const score = present / queryTokens.length;
    if (score > 0) {
      results.push({
        fromSec: seg.fromSec,
        toSec: seg.toSec,
        score,
        summary: seg.summary,
      });
    }
  }
  return results;
}

// ── Merge embedding + summary results ─────────────────────────────────────

export interface SceneSearchResult {
  bestAtSec?: number;
  bestFrame?: string;
  fromSec: number;
  score: number;
  source: "embedding" | "summary" | "both";
  summary?: string;
  toSec: number;
}

function intervalsOverlap(
  aFrom: number,
  aTo: number,
  bFrom: number,
  bTo: number
): boolean {
  return aFrom < bTo && bFrom < aTo;
}

// Union of embedding-derived moments and scene-log summary matches. Each
// embedding moment keeps its own time range (the visual anchor); when a
// not-yet-consumed summary match's range overlaps it, the two merge into one
// "both" result carrying max(score) and the best (highest-scoring)
// overlapping summary's text, and every summary that overlapped gets
// consumed so it doesn't also linger as a redundant standalone result. When
// several embedding moments contend for the same summary (rare), the first
// one processed - the highest-scoring, since callers pass clusterMoments's
// already-score-sorted output - claims it. Remaining, never-overlapped
// summaries are appended as standalone "summary" results.
export function mergeSceneResults(
  embeddingMoments: Moment[],
  summaryMoments: SummaryMatch[],
  limit = DEFAULT_SEARCH_LIMIT
): SceneSearchResult[] {
  const consumed = new Set<number>();
  const results: SceneSearchResult[] = [];

  for (const moment of embeddingMoments) {
    const overlapping = summaryMoments
      .map((summary, idx) => ({ summary, idx }))
      .filter(
        ({ summary, idx }) =>
          !consumed.has(idx) &&
          intervalsOverlap(
            moment.fromSec,
            moment.toSec,
            summary.fromSec,
            summary.toSec
          )
      )
      .sort(
        (a, b) =>
          b.summary.score - a.summary.score ||
          a.summary.fromSec - b.summary.fromSec
      );

    if (overlapping.length === 0) {
      results.push({
        fromSec: moment.fromSec,
        toSec: moment.toSec,
        score: moment.score,
        source: "embedding",
        bestAtSec: moment.bestAtSec,
        bestFrame: moment.bestFrame,
      });
      continue;
    }

    for (const { idx } of overlapping) {
      consumed.add(idx);
    }
    const best = overlapping[0].summary;
    results.push({
      fromSec: moment.fromSec,
      toSec: moment.toSec,
      score: Math.max(moment.score, best.score),
      source: "both",
      bestAtSec: moment.bestAtSec,
      bestFrame: moment.bestFrame,
      summary: best.summary,
    });
  }

  summaryMoments.forEach((summary, idx) => {
    if (consumed.has(idx)) {
      return;
    }
    results.push({
      fromSec: summary.fromSec,
      toSec: summary.toSec,
      score: summary.score,
      source: "summary",
      summary: summary.summary,
    });
  });

  results.sort((a, b) => b.score - a.score || a.fromSec - b.fromSec);
  return results.slice(0, limit);
}

// ── Full search (reads the sidecar off disk; no spawn) ────────────────────

function listFrameFileNames(framesDir: string): string[] {
  if (!existsSync(framesDir)) {
    return [];
  }
  return readdirSync(framesDir)
    .filter((n) => n.toLowerCase().endsWith(".jpg"))
    .sort();
}

function readIndexFile(indexPath: string): MomentIndexFile | null {
  if (!existsSync(indexPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(indexPath, "utf8")) as MomentIndexFile;
  } catch {
    return null;
  }
}

// Cheap freshness probe used by the moment-search API route to answer
// "indexed:false" (missing/stale sidecar) without needing a query embedding
// at all: the route only has to spawn the warm embed worker once it already
// knows there is a current index to search. Same check searchScenes does
// internally before it touches queryVec; kept as its own export rather than
// having callers reuse searchScenes with a throwaway vector.
export function isMomentIndexCurrent(slug: string): boolean {
  const index = readIndexFile(momentIndexPath(slug));
  const frameNames = listFrameFileNames(projectPaths(slug).frames);
  return Boolean(index && indexIsCurrent(index, frameNames, MOMENT_MODEL));
}

export interface SearchScenesOptions {
  limit?: number;
}

export interface SearchScenesResult {
  indexed: boolean;
  results: SceneSearchResult[];
}

export function searchScenes(
  slug: string,
  project: Project,
  queryVec: Float32Array,
  query: string,
  opts: SearchScenesOptions = {}
): SearchScenesResult {
  const limit = opts.limit ?? DEFAULT_SEARCH_LIMIT;
  const index = readIndexFile(momentIndexPath(slug));
  const frameNames = listFrameFileNames(projectPaths(slug).frames);
  if (!(index && indexIsCurrent(index, frameNames, MOMENT_MODEL))) {
    return { indexed: false, results: [] };
  }

  const vectors = decodeVectors(
    index.vectorsB64,
    index.frames.length,
    index.dim
  );
  const k = Math.min(64, index.frames.length);
  const top = topKFrames(vectors, index.dim, queryVec, k);
  const hits: MomentHit[] = top.map(({ frameIdx, score }) => ({
    atSec: index.frames[frameIdx].atSec,
    score,
    name: index.frames[frameIdx].name,
  }));
  const embeddingMoments = clusterMoments(prunePeakRelative(hits), {
    minScore: DEFAULT_MOMENT_MIN_SCORE,
    maxMoments: limit,
    frameStepSec: index.frameStepSec,
  });
  const summaries = summaryMatches(project.sceneLog, query);
  const results = mergeSceneResults(embeddingMoments, summaries, limit);
  return { indexed: true, results };
}

// ── Bun-side IO: index building + query embedding (spawn node) ───────────
// The only two functions in this module that touch fs writes or spawn a
// process; everything above is pure and unit-tested without either.

export interface BuildMomentIndexOptions {
  force?: boolean;
}

export interface BuildMomentIndexResult {
  built: boolean;
  frameCount: number;
  model: string;
  path: string;
  skippedReason?: "current" | "no-frames";
}

// Generous kill-timeout for the index-build spawn: a first-time run pays a
// one-time CLIP model download (~150MB) on top of embedding every frame, so
// this has to tolerate a slow connection and a large frame set, not just a
// hung process. Chosen well above realistic legitimate durations so it only
// ever fires on a genuinely wedged child.
export const MOMENT_INDEX_BUILD_TIMEOUT_MS = 600_000;

// How long a SECOND caller (a different request, CLI invocation, or agent)
// waits for the cross-process file lock below before giving up. Must exceed
// MOMENT_INDEX_BUILD_TIMEOUT_MS: a waiter timing out before the current
// build's own kill-timeout can even fire would be a spurious failure, not a
// real problem (the first build is still legitimately allowed to be running).
const MOMENT_INDEX_LOCK_WAIT_MS = MOMENT_INDEX_BUILD_TIMEOUT_MS + 60_000;

// Skip (without spawning) when there are no frames to index, or when an
// existing sidecar is already current for the present frame list and model.
// Otherwise spawn src/embed.mjs under Node (mirrors transcribeToWords in
// src/ingest.ts) to (re)build the sidecar atomically.
//
// Locked two ways, mirroring mutateProject in src/projectStore.ts exactly:
// withMomentIndexLock serializes calls within this process (multiple
// requests hitting the same server), and the O_CREAT|O_EXCL lockfile from
// src/project-file-lock.ts serializes across processes (the CLI, the MCP
// server, and the web server can all call this for the same slug - see that
// module's own header for why this class of hazard needs both layers).
// Because the frame/staleness check happens fresh INSIDE the lock, a second
// caller that queues behind an in-flight build simply sees the just-built
// index as current and skips, instead of racing a duplicate spawn against
// the same output path.
export function buildMomentIndex(
  slug: string,
  opts: BuildMomentIndexOptions = {}
): Promise<BuildMomentIndexResult> {
  return withMomentIndexLock(slug, async () => {
    const paths = projectPaths(slug);
    const indexPath = momentIndexPath(slug);
    const lockPath = `${indexPath}.lock`;
    await acquireProjectFileLock(lockPath, MOMENT_INDEX_LOCK_WAIT_MS);
    try {
      const frameNames = listFrameFileNames(paths.frames);
      if (frameNames.length === 0) {
        return {
          built: false,
          skippedReason: "no-frames",
          frameCount: 0,
          model: MOMENT_MODEL,
          path: indexPath,
        };
      }

      if (!opts.force) {
        const existing = readIndexFile(indexPath);
        if (existing && indexIsCurrent(existing, frameNames, MOMENT_MODEL)) {
          return {
            built: false,
            skippedReason: "current",
            frameCount: existing.frames.length,
            model: existing.model,
            path: indexPath,
          };
        }
      }

      const proc = Bun.spawn(
        [
          "node",
          embedScriptPath(),
          "index",
          paths.frames,
          indexPath,
          MOMENT_MODEL,
        ],
        { stdout: "inherit", stderr: "inherit" }
      );
      const killTimer = setTimeout(
        () => proc.kill(),
        MOMENT_INDEX_BUILD_TIMEOUT_MS
      );
      let exitCode: number;
      try {
        exitCode = await proc.exited;
      } finally {
        clearTimeout(killTimer);
      }
      if (exitCode !== 0) {
        throw new Error("moment index build failed");
      }
      const built = readIndexFile(indexPath);
      if (!built) {
        throw new Error("moment index build did not produce an index file");
      }
      return {
        built: true,
        frameCount: built.frames.length,
        model: built.model,
        path: indexPath,
      };
    } finally {
      try {
        await unlink(lockPath);
      } catch {
        // Best-effort: a stale-break by another process already removed it.
      }
    }
  });
}

export interface EmbedQueryResult {
  model: string;
  vector: Float32Array;
}

// One-shot text query embedding: spawn `node embed.mjs query`, parse its
// single-line stdout JSON. Kept self-contained (rather than reusing a long-
// lived process) for the CLI/MCP call pattern; the Next server can later
// embed in-process instead.
export async function embedQueryText(text: string): Promise<EmbedQueryResult> {
  const proc = Bun.spawn(
    ["node", embedScriptPath(), "query", text, MOMENT_MODEL],
    { stdout: "pipe", stderr: "inherit" }
  );
  const stdout = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    throw new Error("moment query embedding failed");
  }
  const parsed = JSON.parse(stdout.trim()) as {
    model: string;
    dim: number;
    vector: number[];
  };
  return { vector: Float32Array.from(parsed.vector), model: parsed.model };
}
