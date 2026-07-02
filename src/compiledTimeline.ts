// A derived, NEVER-persisted view of a Project for UI consumers (preview canvas,
// timeline, inspector). The EDL (project.json) stays the single source of truth;
// this just computes the kept ranges, overlays mapped into OUTPUT time with their
// paint order, the caption groups, and the runtime : so the GUI doesn't have to
// re-derive (and risk drifting from) what the exporter does. Pure: reads only.

import type { SilenceSpan } from "./audio-analysis-core.ts";
import {
  type CaptionGroup,
  groupCaptions,
  keptWordsInOutputTime,
} from "./captions.ts";
import {
  effectiveRanges,
  type Project,
  type Range,
  sourceToOutputSec,
  totalDurationSec,
} from "./edl.ts";

export interface CompiledOverlay {
  id: string;
  kind: "zoom" | "broll" | "still" | "title";
  outEndSec: number;
  outStartSec: number;
  // Paint order: lower paints first (further back). Matches the exporter's
  // filtergraph stacking : zoom transform, then b-roll covers, then titles on top.
  z: number;
}

export interface CompiledTimeline {
  captionGroups: CaptionGroup[];
  outputDurationSec: number;
  overlays: CompiledOverlay[];
  ranges: Range[];
}

// keptWordsInOutputTime now lives in src/captions.ts (R1): one shared
// implementation with src/exporter.ts, matching words to ranges by OVERLAP so
// snap/dead-air boundary shifts cannot drop a playing word's caption.

function compileOverlays(project: Project, ranges: Range[]): CompiledOverlay[] {
  const sr = project.sampleRate;
  const overlays: CompiledOverlay[] = [];
  let z = 0;
  const add = (
    kind: CompiledOverlay["kind"],
    id: string,
    startSample: number,
    endSample: number
  ) => {
    const outStartSec = sourceToOutputSec(startSample / sr, ranges);
    const outEndSec = sourceToOutputSec(endSample / sr, ranges);
    if (outEndSec - outStartSec > 0.05) {
      overlays.push({ kind, id, outStartSec, outEndSec, z: z++ });
    }
  };
  for (const o of project.zooms ?? []) {
    add("zoom", o.id, o.startSample, o.endSample);
  }
  for (const o of project.broll ?? []) {
    add("broll", o.id, o.startSample, o.endSample);
  }
  for (const o of project.stills ?? []) {
    add("still", o.id, o.startSample, o.endSample);
  }
  for (const o of project.titles ?? []) {
    add("title", o.id, o.startSample, o.endSample);
  }
  return overlays;
}

// `silences` is optional so sync/no-analysis callers still get correct
// dead-air subtraction from effectiveRanges(); passing silences additionally
// lets VAD snap adjust boundaries (see effectiveRanges() in edl.ts).
export function compileTimeline(
  project: Project,
  silences?: SilenceSpan[]
): CompiledTimeline {
  const ranges = effectiveRanges(project, silences);
  const captionGroups =
    project.captions?.enabled === false
      ? []
      : groupCaptions(
          keptWordsInOutputTime(project, ranges),
          project.captions?.maxWords ?? 6
        );
  return {
    ranges,
    outputDurationSec: totalDurationSec(ranges),
    overlays: compileOverlays(project, ranges),
    captionGroups,
  };
}
