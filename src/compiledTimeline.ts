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
  composition: CompositionIR;
  outputDurationSec: number;
  overlays: CompiledOverlay[];
  ranges: Range[];
}

export type CompositionClipKind =
  | "caption"
  | "zoom"
  | "broll"
  | "still"
  | "title"
  | "graphic"
  | "json-render"
  | "music";

export type CompositionLayerKind =
  | "caption"
  | "zoom"
  | "broll"
  | "title"
  | "music";

export interface CompositionLayer {
  id: CompositionLayerKind;
  kind: CompositionLayerKind;
  z: number;
}

export interface CompositionResource {
  id: string;
  kind: "asset" | "graphic" | "json-render";
  ref: string;
}

export interface CompositionClip {
  id: string;
  kind: CompositionClipKind;
  layer: CompositionLayerKind;
  output: { endSec: number; startSec: number };
  resourceId?: string;
  source: { endSec: number; startSec: number };
  track?: string;
  z: number;
}

export interface CompositionIR {
  clips: CompositionClip[];
  layers: CompositionLayer[];
  resources: CompositionResource[];
  sourceOfTruth: "project.json";
  timebase: "seconds-from-48khz-samples";
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

function mappedClip(
  project: Project,
  ranges: Range[],
  input: {
    id: string;
    kind: CompositionClipKind;
    layer: CompositionLayerKind;
    startSample: number;
    endSample: number;
    resourceId?: string;
    track?: string;
    z: number;
  }
): CompositionClip | null {
  const sr = project.sampleRate;
  const source = {
    startSec: input.startSample / sr,
    endSec: input.endSample / sr,
  };
  const output = {
    startSec: sourceToOutputSec(source.startSec, ranges),
    endSec: sourceToOutputSec(source.endSec, ranges),
  };
  if (output.endSec - output.startSec <= 0.05) {
    return null;
  }
  return {
    id: input.id,
    kind: input.kind,
    layer: input.layer,
    source,
    output,
    z: input.z,
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    ...(input.track ? { track: input.track } : {}),
  };
}

function compileComposition(
  project: Project,
  ranges: Range[],
  captionGroups: CaptionGroup[]
): CompositionIR {
  const layers: CompositionLayer[] = [
    { id: "caption", kind: "caption", z: 0 },
    { id: "zoom", kind: "zoom", z: 1 },
    { id: "broll", kind: "broll", z: 2 },
    { id: "title", kind: "title", z: 3 },
    { id: "music", kind: "music", z: 4 },
  ];
  const resources = new Map<string, CompositionResource>();
  const clips: CompositionClip[] = [];
  let z = 0;
  const push = (clip: CompositionClip | null) => {
    if (clip) {
      clips.push(clip);
    }
  };
  const addAssetResource = (assetId: string) => {
    const id = `asset:${assetId}`;
    if (!resources.has(id)) {
      resources.set(id, { id, kind: "asset", ref: assetId });
    }
    return id;
  };
  const addGraphicResource = (
    kind: "graphic" | "json-render",
    graphicId: string
  ) => {
    const id = `${kind}:${graphicId}`;
    if (!resources.has(id)) {
      resources.set(id, { id, kind, ref: graphicId });
    }
    return id;
  };

  for (const [i, group] of captionGroups.entries()) {
    push({
      id: `caption:${i}`,
      kind: "caption",
      layer: "caption",
      source: { startSec: group.startSec, endSec: group.endSec },
      output: { startSec: group.startSec, endSec: group.endSec },
      z: z++,
    });
  }
  for (const item of project.zooms ?? []) {
    push(
      mappedClip(project, ranges, {
        id: item.id,
        kind: "zoom",
        layer: "zoom",
        startSample: item.startSample,
        endSample: item.endSample,
        z: z++,
      })
    );
  }
  for (const item of project.broll ?? []) {
    push(
      mappedClip(project, ranges, {
        id: item.id,
        kind: "broll",
        layer: "broll",
        startSample: item.startSample,
        endSample: item.endSample,
        resourceId: addAssetResource(item.assetId),
        z: z++,
      })
    );
  }
  for (const item of project.stills ?? []) {
    push(
      mappedClip(project, ranges, {
        id: item.id,
        kind: "still",
        layer: "broll",
        startSample: item.startSample,
        endSample: item.endSample,
        resourceId: addAssetResource(item.assetId),
        z: z++,
      })
    );
  }
  for (const item of project.titles ?? []) {
    push(
      mappedClip(project, ranges, {
        id: item.id,
        kind: "title",
        layer: "title",
        startSample: item.startSample,
        endSample: item.endSample,
        z: z++,
      })
    );
  }
  for (const item of project.graphics ?? []) {
    const kind = item.type === "json-render" ? "json-render" : "graphic";
    push(
      mappedClip(project, ranges, {
        id: item.id,
        kind,
        layer: item.track === "zoom" ? "zoom" : item.track,
        startSample: item.startSample,
        endSample: item.endSample,
        resourceId: addGraphicResource(kind, item.id),
        track: item.track,
        z: z++,
      })
    );
  }
  for (const item of project.music ?? []) {
    push(
      mappedClip(project, ranges, {
        id: item.id,
        kind: "music",
        layer: "music",
        startSample: item.startSample,
        endSample: item.endSample,
        resourceId: addAssetResource(item.assetId),
        z: z++,
      })
    );
  }

  const resourceOrder: Record<CompositionResource["kind"], number> = {
    asset: 0,
    graphic: 1,
    "json-render": 2,
  };

  return {
    sourceOfTruth: "project.json",
    timebase: "seconds-from-48khz-samples",
    layers,
    resources: [...resources.values()].sort((a, b) => {
      const kindDelta = resourceOrder[a.kind] - resourceOrder[b.kind];
      return kindDelta === 0 ? a.id.localeCompare(b.id) : kindDelta;
    }),
    clips,
  };
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
  const composition = compileComposition(project, ranges, captionGroups);
  return {
    ranges,
    outputDurationSec: totalDurationSec(ranges),
    overlays: compileOverlays(project, ranges),
    captionGroups,
    composition,
  };
}
