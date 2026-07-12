import type { CleanupCandidate } from "@engine/cleanup";
import type { CleanupUndoSnapshot } from "@/lib/cleanup-tab";

export const DEFAULT_PEAK_CONTEXT_SEC = 1;
export const DEFAULT_WAVEFORM_BUCKETS = 160;

export interface PeakWindow {
  fromSec: number;
  toSec: number;
}

export interface WaveformBarRect {
  h: number;
  maxY: number;
  minY: number;
  w: number;
  x: number;
}

export interface SilenceOverlayRegions {
  cutEndNorm: number;
  cutStartNorm: number;
  leftPadEndNorm: number;
  leftPadStartNorm: number;
  rightPadEndNorm: number;
  rightPadStartNorm: number;
}

export function peakWindowForCandidate(
  candidate: { endSec: number; startSec: number },
  contextSec = DEFAULT_PEAK_CONTEXT_SEC
): PeakWindow {
  return {
    fromSec: Math.max(0, candidate.startSec - contextSec),
    toSec: candidate.endSec + contextSec,
  };
}

export function secToNorm(sec: number, window: PeakWindow): number {
  const span = window.toSec - window.fromSec;
  if (span <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (sec - window.fromSec) / span));
}

export function silenceOverlayRegions(
  candidate: { endSec: number; startSec: number },
  keepPadSec: number,
  window: PeakWindow
): SilenceOverlayRegions {
  const leftPadStart = candidate.startSec - keepPadSec;
  const rightPadEnd = candidate.endSec + keepPadSec;
  return {
    leftPadStartNorm: secToNorm(leftPadStart, window),
    leftPadEndNorm: secToNorm(candidate.startSec, window),
    cutStartNorm: secToNorm(candidate.startSec, window),
    cutEndNorm: secToNorm(candidate.endSec, window),
    rightPadStartNorm: secToNorm(candidate.endSec, window),
    rightPadEndNorm: secToNorm(rightPadEnd, window),
  };
}

export function mapBucketsToBars(
  buckets: [number, number][],
  width: number,
  height: number
): WaveformBarRect[] {
  if (buckets.length === 0 || width <= 0 || height <= 0) {
    return [];
  }
  const barWidth = width / buckets.length;
  const midY = height / 2;
  const maxAmp = Math.max(
    ...buckets.flatMap(([min, max]) => [Math.abs(min), Math.abs(max)]),
    1e-6
  );
  return buckets.map(([min, max], index) => {
    const minY = midY - (Math.abs(min) / maxAmp) * (height / 2);
    const maxY = midY - (max / maxAmp) * (height / 2);
    return {
      x: index * barWidth,
      w: Math.max(1, barWidth * 0.85),
      minY,
      maxY,
      h: Math.max(1, Math.abs(maxY - minY)),
    };
  });
}

export function buildCleanupThresholdPatch(
  field: "keepPadSec" | "minSec",
  value: number
): { keepPadSec?: number; minSec?: number } {
  return field === "minSec" ? { minSec: value } : { keepPadSec: value };
}

export function chunkDeadAirSpans(
  spans: { fromSec: number; toSec: number }[],
  batchSize = 50
): { fromSec: number; toSec: number }[][] {
  const batches: { fromSec: number; toSec: number }[][] = [];
  for (let i = 0; i < spans.length; i += batchSize) {
    batches.push(spans.slice(i, i + batchSize));
  }
  return batches;
}

export function buildBulkSilenceUndoSnapshot(
  deadAirSpanIds: string[]
): CleanupUndoSnapshot {
  return { wordIds: [], deadAirSpanIds };
}

export function deadAirCandidatesFromReport(
  candidates: CleanupCandidate[]
): CleanupCandidate[] {
  return candidates.filter((candidate) => candidate.kind === "dead-air");
}

export function deadAirSavedSec(candidates: CleanupCandidate[]): number {
  return deadAirCandidatesFromReport(candidates).reduce(
    (sum, candidate) => sum + candidate.estSavedSec,
    0
  );
}

export function formatSilenceThresholdSubtitle(
  minSec: number,
  keepPadSec: number
): string {
  return `Cutting pauses longer than ${minSec.toFixed(1)}s, keeping ${keepPadSec.toFixed(2)}s padding`;
}

export function peaksCacheKey(
  slug: string,
  fromSec: number,
  toSec: number,
  buckets: number
): string {
  return `${slug}:${fromSec.toFixed(3)}:${toSec.toFixed(3)}:${buckets}`;
}
