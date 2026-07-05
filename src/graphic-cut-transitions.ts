import { addGraphic } from "./actions.ts";
import type { Graphic, Project } from "./edl.ts";
import { survivingRanges } from "./edl.ts";
import { loadGraphicManifest } from "./graphics.ts";

const DEFAULT_TRANSITION_SEC = 0.4;
const MIN_TRANSITION_SEC = 0.05;

/** Source-time seconds where kept ranges meet (jump-cut seams). */
export function cutSeamTimes(project: Project): number[] {
  const ranges = survivingRanges(project);
  if (ranges.length < 2) {
    return [];
  }
  const seams: number[] = [];
  for (let i = 0; i < ranges.length - 1; i++) {
    seams.push(ranges[i].endSec);
  }
  return seams;
}

/** Default overlay duration from transition template entrance + exit frames. */
export function defaultTransitionDurationSec(
  template: string,
  slug?: string
): number {
  try {
    const manifest = loadGraphicManifest(template, slug ? { slug } : undefined);
    const fps = manifest.fps ?? 30;
    const inDur =
      typeof manifest.params.inDurFrames?.default === "number"
        ? manifest.params.inDurFrames.default
        : 4;
    const outDur =
      typeof manifest.params.outDurFrames?.default === "number"
        ? manifest.params.outDurFrames.default
        : 8;
    return Math.max(MIN_TRANSITION_SEC, (inDur + outDur) / fps);
  } catch {
    return DEFAULT_TRANSITION_SEC;
  }
}

export function spanAtCutSeam(
  seamSec: number,
  durationSec: number,
  projectDurationSec: number
): { fromSec: number; toSec: number } {
  const half = durationSec / 2;
  const fromSec = Math.max(0, seamSec - half);
  const toSec = Math.min(projectDurationSec, seamSec + half);
  if (toSec <= fromSec) {
    throw new Error("transition span is empty at cut seam");
  }
  return { fromSec, toSec };
}

export function assertTransitionTemplate(template: string): void {
  if (!template.startsWith("transition-")) {
    throw new Error(
      `graphic-add-cuts requires a transition-* template (got "${template}")`
    );
  }
}

/** Place one transition graphic centered on each kept-range seam. */
export function addGraphicsAtCutSeams(
  project: Project,
  input: {
    template: string;
    durationSec?: number;
    params?: Record<string, string | number | boolean>;
    track?: Graphic["track"];
    note?: string;
  }
): Graphic[] {
  assertTransitionTemplate(input.template);
  const seams = cutSeamTimes(project);
  if (seams.length === 0) {
    throw new Error(
      "no cut seams found (need at least two kept ranges after edits)"
    );
  }
  const projectDurationSec = project.durationSamples / project.sampleRate;
  const durationSec =
    input.durationSec ??
    defaultTransitionDurationSec(input.template, project.slug);
  if (!(Number.isFinite(durationSec) && durationSec > MIN_TRANSITION_SEC)) {
    throw new Error("durationSec must be a positive number");
  }
  const placed: Graphic[] = [];
  for (const seamSec of seams) {
    const span = spanAtCutSeam(seamSec, durationSec, projectDurationSec);
    placed.push(
      addGraphic(project, {
        template: input.template,
        fromSec: span.fromSec,
        toSec: span.toSec,
        params: input.params,
        track: input.track ?? "title",
        note: input.note,
      })
    );
  }
  return placed;
}
