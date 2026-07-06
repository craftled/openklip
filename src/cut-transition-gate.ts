import type {
  CutTransition,
  CutTransitionType,
  Project,
  Range,
} from "./edl.ts";
import {
  type CutTransitionFallbackReason,
  cutTransitionFallbackReason,
  cutTransitionFallbackReasonLabel,
  type SegmentExportGate,
  shouldApplyCutTransition,
} from "./export-segments.ts";
import { graphicTemplateIsRich } from "./graphic-template-kind.ts";

export function overlaySpanIntersectsKeptRanges(
  startSample: number,
  endSample: number,
  sampleRate: number,
  ranges: Range[]
): boolean {
  if (endSample <= startSample || ranges.length === 0) {
    return false;
  }
  const startSec = startSample / sampleRate;
  const endSec = endSample / sampleRate;
  return ranges.some((r) => r.startSec < endSec && r.endSec > startSec);
}

function graphicIsRich(_project: Project, template: string): boolean {
  return graphicTemplateIsRich(template);
}

/** Mirror export-side transition gating for preview and status surfaces. */
export function buildTransitionGateFromProject(
  project: Project,
  ranges: Range[]
): SegmentExportGate {
  const sr = project.sampleRate;
  const intersects = (startSample: number, endSample: number) =>
    overlaySpanIntersectsKeptRanges(startSample, endSample, sr, ranges);

  const hasBroll = (project.broll ?? []).some((b) =>
    intersects(b.startSample, b.endSample)
  );
  const hasStills = (project.stills ?? []).some((s) =>
    intersects(s.startSample, s.endSample)
  );
  const hasMusic = (project.music ?? []).some((m) =>
    intersects(m.startSample, m.endSample)
  );
  const hasRichGraphics = (project.graphics ?? []).some((g) => {
    if (!intersects(g.startSample, g.endSample)) {
      return false;
    }
    if (g.type === "json-render") {
      return true;
    }
    return graphicIsRich(project, g.template);
  });

  return {
    ranges,
    sourceDurationSec: project.durationSamples / sr,
    hasBroll,
    hasStills,
    hasMusic,
    hasRichGraphics,
  };
}

export interface TransitionExportPreview {
  durationMs: number;
  fallbackReason?: CutTransitionFallbackReason;
  type: CutTransitionType;
  wouldApply: boolean;
}

export function transitionExportPreview(
  project: Project,
  ranges: Range[]
): TransitionExportPreview {
  const transition: CutTransition = project.look?.transition ?? {
    type: "none",
    durationMs: 500,
  };
  const gate = buildTransitionGateFromProject(project, ranges);
  const wouldApply = shouldApplyCutTransition(transition.type, gate);
  return {
    type: transition.type,
    durationMs: transition.durationMs,
    wouldApply,
    ...(wouldApply
      ? {}
      : {
          fallbackReason: cutTransitionFallbackReason(gate),
        }),
  };
}

/** Preview chrome when a requested transition will not render on export. */
export function previewTransitionNotice(
  transition: CutTransition,
  gate: SegmentExportGate
): string | null {
  if (transition.type === "none") {
    return null;
  }
  if (shouldApplyCutTransition(transition.type, gate)) {
    return null;
  }
  const reason = cutTransitionFallbackReason(gate);
  const reasonLabel = reason
    ? cutTransitionFallbackReasonLabel(reason)
    : "not supported for this export";
  return `Export will hard-cut between kept ranges (${reasonLabel}). Preview sweep is off so playback matches export.`;
}
