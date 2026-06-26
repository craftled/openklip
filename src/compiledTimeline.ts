// A derived, NEVER-persisted view of a Project for UI consumers (preview canvas,
// timeline, inspector). The EDL (project.json) stays the single source of truth;
// this just computes the kept ranges, overlays mapped into OUTPUT time with their
// paint order, the caption groups, and the runtime — so the GUI doesn't have to
// re-derive (and risk drifting from) what the exporter does. Pure: reads only.
import {
  type CaptionGroup,
  type CaptionWord,
  groupCaptions,
} from "./captions.ts";
import {
  type Project,
  type Range,
  sourceToOutputSec,
  survivingRanges,
  totalDurationSec,
} from "./edl.ts";

export interface CompiledOverlay {
  id: string;
  kind: "zoom" | "broll" | "still" | "title";
  outEndSec: number;
  outStartSec: number;
  // Paint order: lower paints first (further back). Matches the exporter's
  // filtergraph stacking — zoom transform, then b-roll covers, then titles on top.
  z: number;
}

export interface CompiledTimeline {
  captionGroups: CaptionGroup[];
  outputDurationSec: number;
  overlays: CompiledOverlay[];
  ranges: Range[];
}

function keptWordsInOutputTime(
  project: Project,
  ranges: Range[]
): CaptionWord[] {
  const sr = project.sampleRate;
  const out: CaptionWord[] = [];
  for (const w of project.words) {
    if (w.deleted) {
      continue;
    }
    const ws = w.startSample / sr;
    const we = w.endSample / sr;
    let cum = 0;
    for (const r of ranges) {
      if (ws >= r.startSec - 1e-6 && ws <= r.endSec + 1e-6) {
        const s = cum + Math.max(0, ws - r.startSec);
        const e = cum + Math.max(0, Math.min(we, r.endSec) - r.startSec);
        out.push({ text: w.text, startSec: s, endSec: Math.max(e, s + 0.05) });
        break;
      }
      cum += r.endSec - r.startSec;
    }
  }
  return out;
}

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

export function compileTimeline(project: Project): CompiledTimeline {
  const ranges = survivingRanges(project);
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
