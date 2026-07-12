// Pure math for the audio-analysis + cut-snap engine (Descript-match
// Milestone 3.2 + the analysis half of 3.3): silence detection over raw PCM,
// and snapping candidate cut boundaries onto detected silence edges. No node
// imports here so client components (a future "cut quality" panel) can share
// the exact same math the server-side cache computation uses. src/edl.ts is
// pure too (zod + types only), so importing `Range` from it keeps one shared
// definition of "a kept span in seconds" instead of a duplicate shape here.
import type { Range } from "./edl.ts";

export interface SilenceSpan {
  endSec: number;
  startSec: number;
}

export interface AnalyzeSilencesOpts {
  /** A silent run shorter than this is not reported as a span. */
  minSilenceMs?: number;
  /** PCM sample rate in Hz. Defaults to 16000 (the ingest-time mono proxy). */
  sampleRate?: number;
  /** A window quieter than this (dBFS) counts as silent. */
  thresholdDb?: number;
  /** RMS analysis window size in milliseconds. */
  windowMs?: number;
}

// The on-disk (working/audio-analysis.json) cache shape. src/audio-analysis.ts
// owns reading/writing it; this module only defines the shape so both the
// server cache and any browser-side consumer agree on it.
export interface AudioAnalysis {
  minSilenceMs: number;
  sampleRate: number;
  silences: SilenceSpan[];
  /** audioRaw's mtime (ms) at analysis time; a cache-invalidation key. */
  sourceMtimeMs: number;
  thresholdDb: number;
  version: 1;
  windowMs: number;
}

// Exported (not module-local) so src/audio-analysis.ts's cache layer imports
// these instead of re-declaring its own copies (the two sets had drifted
// apart before being unified here).
export const DEFAULT_SAMPLE_RATE = 16_000;
export const DEFAULT_WINDOW_MS = 20;
export const DEFAULT_THRESHOLD_DB = -38;
export const DEFAULT_MIN_SILENCE_MS = 300;
// dBFS assigned to a zero-RMS window (log10(0) is undefined); anything this
// quiet is silence at any realistic threshold.
const SILENCE_FLOOR_DB = -100;

// Window-RMS silence detection: split the PCM into fixed windows, compute each
// window's dBFS, and merge consecutive quiet windows into spans. Span times
// land on window boundaries (window resolution is fine per the spec this
// implements), so callers should not expect sample-accurate edges.
export function analyzeSilences(
  pcm: Float32Array,
  opts: AnalyzeSilencesOpts = {}
): SilenceSpan[] {
  const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const thresholdDb = opts.thresholdDb ?? DEFAULT_THRESHOLD_DB;
  const minSilenceMs = opts.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS;

  const windowSamples = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const totalWindows = Math.ceil(pcm.length / windowSamples);

  const spans: SilenceSpan[] = [];
  let runStartWindow = -1;

  for (let w = 0; w < totalWindows; w++) {
    const start = w * windowSamples;
    const end = Math.min(start + windowSamples, pcm.length);
    const db = windowDb(pcm, start, end);
    const silent = db < thresholdDb;

    if (silent) {
      if (runStartWindow === -1) {
        runStartWindow = w;
      }
    } else if (runStartWindow !== -1) {
      pushSpanIfLongEnough(spans, runStartWindow, w, windowMs, minSilenceMs);
      runStartWindow = -1;
    }
  }
  if (runStartWindow !== -1) {
    pushSpanIfLongEnough(
      spans,
      runStartWindow,
      totalWindows,
      windowMs,
      minSilenceMs
    );
  }
  return spans;
}

export function windowDb(pcm: Float32Array, start: number, end: number): number {
  let sumSq = 0;
  for (let i = start; i < end; i++) {
    const s = pcm[i];
    sumSq += s * s;
  }
  const count = end - start;
  const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
  return rms > 0 ? 20 * Math.log10(rms) : SILENCE_FLOOR_DB;
}

function pushSpanIfLongEnough(
  spans: SilenceSpan[],
  startWindow: number,
  endWindowExclusive: number,
  windowMs: number,
  minSilenceMs: number
): void {
  const durationMs = (endWindowExclusive - startWindow) * windowMs;
  if (durationMs < minSilenceMs) {
    return;
  }
  spans.push({
    startSec: (startWindow * windowMs) / 1000,
    endSec: (endWindowExclusive * windowMs) / 1000,
  });
}

// Snap one cut-range edge onto the boundary of a silence it currently sits
// inside, so a cut opens/closes at actual quiet instead of a fixed pad offset
// landing mid-silence. direction "start": prefer the END edge of a silence
// that begins before/at `sec` (a range should start where speech resumes).
// direction "end": prefer the START edge of a silence (a range should end
// where speech stops). Only accepted when within maxShiftSec; a candidate
// that would move the boundary the WRONG way (start earlier, end later) is
// rejected rather than inverted, which also guarantees each edge only moves
// INWARD (shrinking its range), never outward toward a neighboring range.
export function snapBoundary(
  sec: number,
  silences: SilenceSpan[],
  maxShiftSec: number,
  direction: "start" | "end"
): number {
  if (!Number.isFinite(sec) || silences.length === 0) {
    return sec;
  }
  if (direction === "start") {
    let nearest: SilenceSpan | null = null;
    for (const s of silences) {
      if (
        s.startSec <= sec &&
        (nearest === null || s.startSec > nearest.startSec)
      ) {
        nearest = s;
      }
    }
    if (!nearest) {
      return sec;
    }
    const candidate = nearest.endSec;
    if (candidate < sec || candidate - sec > maxShiftSec) {
      return sec;
    }
    return candidate;
  }

  let nearest: SilenceSpan | null = null;
  for (const s of silences) {
    if (s.endSec >= sec && (nearest === null || s.endSec < nearest.endSec)) {
      nearest = s;
    }
  }
  if (!nearest) {
    return sec;
  }
  const candidate = nearest.startSec;
  if (candidate > sec || sec - candidate > maxShiftSec) {
    return sec;
  }
  return candidate;
}

// Snap every range's internal start/end edges onto nearby silences. Each edge
// only moves inward (see snapBoundary), so given sorted, non-overlapping
// input ranges the output stays sorted and non-overlapping automatically; the
// one remaining risk is a single short range fully swallowed by one wide
// silence, where the two inward snaps would cross. On that conflict both
// edges revert to their original values rather than producing an inverted or
// zero/negative-length range.
export function snapRanges(
  ranges: Range[],
  silences: SilenceSpan[],
  maxShiftSec: number
): Range[] {
  return ranges.map((r) => {
    const startSec = snapBoundary(r.startSec, silences, maxShiftSec, "start");
    const endSec = snapBoundary(r.endSec, silences, maxShiftSec, "end");
    if (!(startSec < endSec)) {
      return { startSec: r.startSec, endSec: r.endSec };
    }
    return { startSec, endSec };
  });
}

// Sliver floor for a REMAINDER kept after subtracting dead air from a range
// (this module). Distinct from MIN_DEAD_AIR_SPAN_SEC in src/actions.ts, which
// floors the incoming dead-air SPAN itself before it is ever registered; the
// two thresholds happen to share a value today but govern different ends of
// the same pipeline, so they are not merged into one constant.
const MIN_DEAD_AIR_SLIVER_SEC = 0.05;

export interface DeadAirSampleSpan {
  endSample: number;
  startSample: number;
}

// Remove dead-air spans (source-time, sample grid) from kept ranges, splitting
// a range around an interior span, trimming a span at a range's edge, and
// dropping a range entirely when a span covers it. Remainders under 0.05s are
// dropped as slivers rather than kept as an unusable near-zero-length range.
export function subtractDeadAir(
  ranges: Range[],
  deadAir: DeadAirSampleSpan[],
  sampleRate: number
): Range[] {
  if (deadAir.length === 0) {
    return ranges.map((r) => ({ ...r }));
  }
  const gaps = deadAir
    .map((d) => ({
      startSec: d.startSample / sampleRate,
      endSec: d.endSample / sampleRate,
    }))
    .filter((g) => g.endSec > g.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  const out: Range[] = [];
  for (const r of ranges) {
    let segments: Range[] = [{ startSec: r.startSec, endSec: r.endSec }];
    for (const gap of gaps) {
      const next: Range[] = [];
      for (const seg of segments) {
        if (gap.endSec <= seg.startSec || gap.startSec >= seg.endSec) {
          next.push(seg);
          continue;
        }
        if (gap.startSec > seg.startSec) {
          next.push({ startSec: seg.startSec, endSec: gap.startSec });
        }
        if (gap.endSec < seg.endSec) {
          next.push({ startSec: gap.endSec, endSec: seg.endSec });
        }
      }
      segments = next;
    }
    for (const seg of segments) {
      if (seg.endSec - seg.startSec >= MIN_DEAD_AIR_SLIVER_SEC) {
        out.push(seg);
      }
    }
  }
  return out;
}
