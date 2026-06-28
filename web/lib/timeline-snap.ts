// Timeline snap points (word edges, overlay edges). Inspired by OpenCut's snapping
// resolve loop, adapted to OpenKlip's 48 kHz sample grid.

export interface SnapPoint {
  sample: number;
}

export interface SnapResult {
  snapPoint: SnapPoint | null;
  snappedSample: number;
}

/** ~80ms snap magnet at 48 kHz (feels tight like a pro NLE). */
export function defaultSnapThresholdSamples(sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate * 0.08));
}

export function buildWordSnapPoints(
  words: ReadonlyArray<{ endSample: number; startSample: number }>
): SnapPoint[] {
  const points: SnapPoint[] = [];
  for (const word of words) {
    points.push({ sample: word.startSample }, { sample: word.endSample });
  }
  return points;
}

export function buildOverlaySnapPoints(
  clips: ReadonlyArray<{
    endSample: number;
    id: string;
    startSample: number;
  }>,
  excludeId?: string
): SnapPoint[] {
  const points: SnapPoint[] = [];
  for (const clip of clips) {
    if (clip.id === excludeId) {
      continue;
    }
    points.push({ sample: clip.startSample }, { sample: clip.endSample });
  }
  return points;
}

export function buildPlayheadSnapPoint(playheadSample: number): SnapPoint[] {
  return [{ sample: playheadSample }];
}

export function buildTimelineSnapPoints({
  words,
  overlays,
  excludeClipId,
  playheadSample,
}: {
  words: ReadonlyArray<{ endSample: number; startSample: number }>;
  overlays: ReadonlyArray<{
    endSample: number;
    id: string;
    startSample: number;
  }>;
  excludeClipId?: string;
  playheadSample?: number;
}): SnapPoint[] {
  const groups: SnapPoint[][] = [buildWordSnapPoints(words)];
  groups.push(buildOverlaySnapPoints(overlays, excludeClipId));
  if (playheadSample != null) {
    groups.push(buildPlayheadSnapPoint(playheadSample));
  }
  return mergeSnapPoints(...groups);
}

export function mergeSnapPoints(
  ...groups: ReadonlyArray<ReadonlyArray<SnapPoint>>
): SnapPoint[] {
  const seen = new Set<number>();
  const merged: SnapPoint[] = [];
  for (const group of groups) {
    for (const point of group) {
      if (seen.has(point.sample)) {
        continue;
      }
      seen.add(point.sample);
      merged.push(point);
    }
  }
  return merged;
}

export function resolveSnap(
  targetSample: number,
  snapPoints: ReadonlyArray<SnapPoint>,
  maxDistanceSamples: number
): SnapResult {
  let closest: SnapPoint | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const point of snapPoints) {
    const distance = Math.abs(targetSample - point.sample);
    if (distance <= maxDistanceSamples && distance < closestDistance) {
      closestDistance = distance;
      closest = point;
    }
  }

  return {
    snappedSample: closest ? closest.sample : targetSample,
    snapPoint: closest,
  };
}

export function snapSample({
  sample,
  enabled,
  snapPoints,
  thresholdSamples,
}: {
  sample: number;
  enabled: boolean;
  snapPoints: ReadonlyArray<SnapPoint>;
  thresholdSamples: number;
}): SnapResult {
  if (!enabled || snapPoints.length === 0) {
    return { snappedSample: sample, snapPoint: null };
  }
  return resolveSnap(sample, snapPoints, thresholdSamples);
}
