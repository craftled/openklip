import { z } from "zod";
import { snapBoundary } from "./audio-analysis-core.ts";
import { SAMPLE_RATE } from "./edl.ts";

// ── Settings ────────────────────────────────────────────────────────────────

export interface CamSwitchSettings {
  interjectionMs: number;
  leadMs: number;
  maxShotMs: number;
  minShotMs: number;
  snapMs: number;
  wide: "auto" | "off";
}

export const DEFAULT_CAM_SWITCH_SETTINGS: CamSwitchSettings = {
  minShotMs: 2000,
  interjectionMs: 700,
  leadMs: 250,
  maxShotMs: 25_000,
  snapMs: 120,
  wide: "auto",
};

export const CamSwitchSettingsSchema: z.ZodType<CamSwitchSettings> = z.object({
  minShotMs: z
    .number()
    .positive()
    .default(DEFAULT_CAM_SWITCH_SETTINGS.minShotMs),
  interjectionMs: z
    .number()
    .positive()
    .default(DEFAULT_CAM_SWITCH_SETTINGS.interjectionMs),
  leadMs: z.number().nonnegative().default(DEFAULT_CAM_SWITCH_SETTINGS.leadMs),
  maxShotMs: z
    .number()
    .positive()
    .default(DEFAULT_CAM_SWITCH_SETTINGS.maxShotMs),
  snapMs: z.number().nonnegative().default(DEFAULT_CAM_SWITCH_SETTINGS.snapMs),
  wide: z.enum(["auto", "off"]).default(DEFAULT_CAM_SWITCH_SETTINGS.wide),
});

// ── Plan types ────────────────────────────────────────────────────────────────

export interface PlanCam {
  id: string;
  role: "speaker" | "wide";
}

export interface SpeakingSpan {
  camId: string;
  fromSample: number;
  toSample: number;
}

export interface PlanSpan {
  fromSample: number;
  locked?: boolean;
  reason?: string;
  shot: string;
  toSample: number;
}

export const PlanSpanSchema: z.ZodType<PlanSpan> = z.object({
  fromSample: z.number().int().nonnegative(),
  toSample: z.number().int().nonnegative(),
  shot: z.string(),
  locked: z.boolean().optional(),
  reason: z.string().optional(),
});

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolveSettings(
  partial?: Partial<CamSwitchSettings>
): CamSwitchSettings {
  return CamSwitchSettingsSchema.parse(partial ?? {});
}

function msToSamples(ms: number): number {
  return Math.round((ms / 1000) * SAMPLE_RATE);
}

function samplesToSec(samples: number): number {
  return samples / SAMPLE_RATE;
}

function secToSamples(sec: number): number {
  return Math.round(sec * SAMPLE_RATE);
}

function firstSpeakerCam(cams: PlanCam[]): string {
  const speaker = cams.find((c) => c.role === "speaker");
  return speaker?.id ?? cams[0]?.id ?? "wide";
}

function validShotIds(cams: PlanCam[]): Set<string> {
  const ids = new Set(cams.map((c) => c.id));
  ids.add("wide");
  return ids;
}

function speakerCamIds(cams: PlanCam[]): string[] {
  return cams.filter((c) => c.role === "speaker").map((c) => c.id);
}

function filterShortBursts(
  spans: SpeakingSpan[],
  interjectionSamples: number
): SpeakingSpan[] {
  return spans.filter((s) => s.toSample - s.fromSample >= interjectionSamples);
}

interface DominantSegment {
  camId: string;
  fromSample: number;
  toSample: number;
  triggerSpan: SpeakingSpan | null;
}

function buildDominantTimeline(
  spans: SpeakingSpan[],
  durationSamples: number,
  openingCam: string
): DominantSegment[] {
  if (spans.length === 0) {
    return [
      {
        fromSample: 0,
        toSample: durationSamples,
        camId: openingCam,
        triggerSpan: null,
      },
    ];
  }

  const boundaries = new Set<number>([0, durationSamples]);
  for (const s of spans) {
    boundaries.add(s.fromSample);
    boundaries.add(s.toSample);
  }
  const points = [...boundaries].sort((a, b) => a - b);

  let heldCam = openingCam;
  const raw: DominantSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (from >= to) {
      continue;
    }

    const mid = from + Math.floor((to - from) / 2);
    const active = spans.filter((s) => s.fromSample <= mid && s.toSample > mid);

    let camId = heldCam;
    let triggerSpan: SpeakingSpan | null = null;

    if (active.length > 0) {
      const dominant = active.reduce((best, s) =>
        s.fromSample > best.fromSample ? s : best
      );
      camId = dominant.camId;
      triggerSpan = dominant;
      heldCam = camId;
    }

    raw.push({ fromSample: from, toSample: to, camId, triggerSpan });
  }

  // Merge adjacent same-cam segments
  const merged: DominantSegment[] = [];
  for (const seg of raw) {
    const last = merged.at(-1);
    if (last && last.camId === seg.camId) {
      last.toSample = seg.toSample;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

function realizeSwitches(
  timeline: DominantSegment[],
  durationSamples: number,
  openingCam: string,
  settings: CamSwitchSettings
): PlanSpan[] {
  const minShotSamples = msToSamples(settings.minShotMs);
  const leadSamples = msToSamples(settings.leadMs);

  const plan: PlanSpan[] = [];
  let currentCam = openingCam;
  let shotStart = 0;

  const pushShot = (toSample: number) => {
    if (toSample > shotStart) {
      plan.push({ fromSample: shotStart, toSample, shot: currentCam });
    }
  };

  for (const seg of timeline) {
    if (seg.camId === currentCam) {
      continue;
    }

    const triggerSpan = seg.triggerSpan;
    if (!triggerSpan) {
      continue;
    }

    const earliest = shotStart + minShotSamples;
    const switchAt = Math.max(
      earliest,
      triggerSpan.fromSample - leadSamples,
      0
    );

    if (switchAt < triggerSpan.toSample) {
      pushShot(switchAt);
      currentCam = seg.camId;
      shotStart = switchAt;
    }
  }

  pushShot(durationSamples);

  if (plan.length === 0) {
    return [{ fromSample: 0, toSample: durationSamples, shot: openingCam }];
  }

  return mergeAdjacent(plan);
}

function mergeAdjacent(plan: PlanSpan[]): PlanSpan[] {
  const merged: PlanSpan[] = [];
  for (const span of plan) {
    const last = merged.at(-1);
    if (
      last &&
      last.shot === span.shot &&
      !last.locked &&
      !span.locked &&
      last.toSample === span.fromSample
    ) {
      last.toSample = span.toSample;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

// ── followSpeakerPlan ─────────────────────────────────────────────────────────

export function followSpeakerPlan(
  spans: SpeakingSpan[],
  opts: {
    cams: PlanCam[];
    durationSamples: number;
    settings?: Partial<CamSwitchSettings>;
  }
): PlanSpan[] {
  const settings = resolveSettings(opts.settings);
  const interjectionSamples = msToSamples(settings.interjectionMs);
  const speakerIds = new Set(speakerCamIds(opts.cams));

  const filtered = filterShortBursts(spans, interjectionSamples).filter((s) =>
    speakerIds.has(s.camId)
  );

  const sorted = [...filtered].sort((a, b) => a.fromSample - b.fromSample);
  const openingCam =
    sorted.length > 0 ? sorted[0].camId : firstSpeakerCam(opts.cams);

  const timeline = buildDominantTimeline(
    sorted,
    opts.durationSamples,
    openingCam
  );

  // Wide cams are never chosen by follow: remap any wide camId in timeline to held speaker
  const speakerTimeline = timeline.map((seg) => ({
    ...seg,
    camId: speakerIds.has(seg.camId) ? seg.camId : openingCam,
    triggerSpan:
      seg.triggerSpan && speakerIds.has(seg.triggerSpan.camId)
        ? seg.triggerSpan
        : null,
  }));

  return realizeSwitches(
    speakerTimeline,
    opts.durationSamples,
    openingCam,
    settings
  );
}

// ── Crosstalk + variety helpers ───────────────────────────────────────────────

function findCrosstalkRegions(
  spans: SpeakingSpan[],
  cams: PlanCam[],
  interjectionSamples: number
): Array<{ fromSample: number; toSample: number }> {
  const speakerIds = new Set(speakerCamIds(cams));
  const speakerSpans = spans.filter((s) => speakerIds.has(s.camId));

  const boundaries = new Set<number>();
  for (const s of speakerSpans) {
    boundaries.add(s.fromSample);
    boundaries.add(s.toSample);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const regions: Array<{ fromSample: number; toSample: number }> = [];

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (from >= to) {
      continue;
    }

    const mid = from + Math.floor((to - from) / 2);
    const activeSpeakers = new Set(
      speakerSpans
        .filter((s) => s.fromSample <= mid && s.toSample > mid)
        .map((s) => s.camId)
    );

    if (activeSpeakers.size >= 2) {
      const last = regions.at(-1);
      if (last && last.toSample === from) {
        last.toSample = to;
      } else {
        regions.push({ fromSample: from, toSample: to });
      }
    }
  }

  return regions.filter(
    (r) => r.toSample - r.fromSample >= interjectionSamples
  );
}

function applyCrosstalkWide(
  plan: PlanSpan[],
  regions: Array<{ fromSample: number; toSample: number }>
): PlanSpan[] {
  if (regions.length === 0) {
    return plan;
  }

  let result: PlanSpan[] = [];
  for (const span of plan) {
    let parts: PlanSpan[] = [span];
    for (const region of regions) {
      const next: PlanSpan[] = [];
      for (const part of parts) {
        if (
          part.toSample <= region.fromSample ||
          part.fromSample >= region.toSample
        ) {
          next.push(part);
          continue;
        }
        if (part.fromSample < region.fromSample) {
          next.push({
            ...part,
            toSample: region.fromSample,
          });
        }
        const wideFrom = Math.max(part.fromSample, region.fromSample);
        const wideTo = Math.min(part.toSample, region.toSample);
        if (wideFrom < wideTo) {
          next.push({
            fromSample: wideFrom,
            toSample: wideTo,
            shot: "wide",
          });
        }
        if (part.toSample > region.toSample) {
          next.push({
            ...part,
            fromSample: region.toSample,
          });
        }
      }
      parts = next;
    }
    result = result.concat(parts);
  }

  return mergeAdjacent(result);
}

function applyMaxShotVariety(
  plan: PlanSpan[],
  cams: PlanCam[],
  settings: CamSwitchSettings
): PlanSpan[] {
  const maxShotSamples = msToSamples(settings.maxShotMs);
  const minShotSamples = msToSamples(settings.minShotMs);
  const speakerIds = speakerCamIds(cams);
  const wideAllowed = settings.wide === "auto";

  const result: PlanSpan[] = [];
  const recentSpeakers: string[] = [];

  for (const span of plan) {
    let remaining = { ...span };
    const trackRecent = (shot: string) => {
      if (speakerIds.includes(shot)) {
        const idx = recentSpeakers.indexOf(shot);
        if (idx >= 0) {
          recentSpeakers.splice(idx, 1);
        }
        recentSpeakers.push(shot);
      }
    };

    trackRecent(span.shot);

    while (remaining.toSample - remaining.fromSample > maxShotSamples) {
      const breakAt = remaining.fromSample + maxShotSamples;
      result.push({
        fromSample: remaining.fromSample,
        toSample: breakAt,
        shot: remaining.shot,
      });

      const varietyShot = pickVarietyShot(
        remaining.shot,
        recentSpeakers,
        speakerIds,
        wideAllowed
      );
      const varietyEnd = Math.min(breakAt + minShotSamples, remaining.toSample);
      if (varietyEnd > breakAt) {
        result.push({
          fromSample: breakAt,
          toSample: varietyEnd,
          shot: varietyShot,
        });
        trackRecent(varietyShot);
      }

      remaining = {
        fromSample: varietyEnd,
        toSample: remaining.toSample,
        shot: remaining.shot,
      };
    }

    if (remaining.toSample > remaining.fromSample) {
      result.push(remaining);
    }
  }

  return mergeAdjacent(result);
}

function pickVarietyShot(
  currentShot: string,
  recentSpeakers: string[],
  speakerIds: string[],
  wideAllowed: boolean
): string {
  if (wideAllowed) {
    return "wide";
  }

  for (const cam of [...recentSpeakers].reverse()) {
    if (cam !== currentShot && speakerIds.includes(cam)) {
      return cam;
    }
  }
  const other = speakerIds.find((id) => id !== currentShot);
  return other ?? currentShot;
}

// ── ruleBasedAutoPlan ─────────────────────────────────────────────────────────

export function ruleBasedAutoPlan(
  spans: SpeakingSpan[],
  opts: {
    cams: PlanCam[];
    durationSamples: number;
    settings?: Partial<CamSwitchSettings>;
  }
): PlanSpan[] {
  const settings = resolveSettings(opts.settings);
  const interjectionSamples = msToSamples(settings.interjectionMs);

  let plan = followSpeakerPlan(spans, opts);

  if (settings.wide !== "off") {
    const filtered = filterShortBursts(spans, interjectionSamples);
    const crosstalk = findCrosstalkRegions(
      filtered,
      opts.cams,
      interjectionSamples
    );
    plan = applyCrosstalkWide(plan, crosstalk);
  }

  plan = applyMaxShotVariety(plan, opts.cams, settings);

  return plan;
}

// ── validatePlan helpers ──────────────────────────────────────────────────────

const RawPlanSpanSchema = z.object({
  fromSample: z.number(),
  toSample: z.number(),
  shot: z.string(),
  locked: z.boolean().optional(),
  reason: z.string().optional(),
});

function parsePlanArray(raw: unknown): PlanSpan[] {
  if (!Array.isArray(raw)) {
    throw new Error("validatePlan: input must be an array of plan spans");
  }
  return raw.map((item, i) => {
    if (item === null || typeof item !== "object") {
      throw new Error(`validatePlan: invalid span at index ${i}`);
    }
    const result = RawPlanSpanSchema.safeParse(item);
    if (!result.success) {
      throw new Error(
        `validatePlan: invalid span at index ${i}: ${result.error.message}`
      );
    }
    return result.data;
  });
}

function clipAndFilter(
  plan: PlanSpan[],
  validShots: Set<string>,
  durationSamples: number
): PlanSpan[] {
  const clipped: PlanSpan[] = [];
  for (const span of plan) {
    if (!validShots.has(span.shot)) {
      continue;
    }
    const from = Math.max(0, span.fromSample);
    const to = Math.min(durationSamples, span.toSample);
    if (from < to) {
      clipped.push({ ...span, fromSample: from, toSample: to });
    }
  }
  return clipped;
}

function resolveOverlaps(plan: PlanSpan[]): PlanSpan[] {
  if (plan.length === 0) {
    return [];
  }
  const sorted = [...plan].sort((a, b) => a.fromSample - b.fromSample);
  const result: PlanSpan[] = [];

  for (const span of sorted) {
    if (result.length === 0) {
      result.push({ ...span });
      continue;
    }
    const last = result.at(-1);
    if (!last) {
      result.push({ ...span });
    } else if (span.fromSample >= last.toSample) {
      result.push({ ...span });
    } else if (span.fromSample >= last.fromSample) {
      last.toSample = span.fromSample;
      result.push({ ...span });
    } else {
      result.push({ ...span });
    }
  }

  // Later entries win: re-process so later sorted items take overlap
  const layers = [...sorted].sort((a, b) => a.fromSample - b.fromSample);
  const timeline: PlanSpan[] = [];

  for (const span of layers) {
    const next: PlanSpan[] = [];
    for (const existing of timeline) {
      if (
        existing.toSample <= span.fromSample ||
        existing.fromSample >= span.toSample
      ) {
        next.push(existing);
        continue;
      }
      if (existing.fromSample < span.fromSample) {
        next.push({ ...existing, toSample: span.fromSample });
      }
      if (existing.toSample > span.toSample) {
        next.push({ ...existing, fromSample: span.toSample });
      }
    }
    next.push({ ...span });
    timeline.length = 0;
    timeline.push(...next.sort((a, b) => a.fromSample - b.fromSample));
  }

  return timeline.filter((s) => s.fromSample < s.toSample);
}

function fillGaps(
  plan: PlanSpan[],
  durationSamples: number,
  fallback: PlanSpan[] | undefined,
  validShots: Set<string>
): PlanSpan[] {
  if (plan.length === 0) {
    if (fallback && fallback.length > 0) {
      return clipAndFilter(fallback, validShots, durationSamples);
    }
    return [];
  }

  const sorted = [...plan].sort((a, b) => a.fromSample - b.fromSample);
  const filled: PlanSpan[] = [];

  const shotAt = (sample: number): string => {
    if (fallback) {
      const fb = fallback.find(
        (s) => s.fromSample <= sample && s.toSample > sample
      );
      if (fb) {
        return fb.shot;
      }
    }
    const prev = sorted.findLast((s) => s.fromSample <= sample);
    if (prev) {
      return prev.shot;
    }
    const next = sorted.find((s) => s.toSample > sample);
    if (next) {
      return next.shot;
    }
    return sorted[0].shot;
  };

  let cursor = 0;
  for (const span of sorted) {
    if (span.fromSample > cursor) {
      filled.push({
        fromSample: cursor,
        toSample: span.fromSample,
        shot: shotAt(cursor),
      });
    }
    filled.push(span);
    cursor = Math.max(cursor, span.toSample);
  }

  if (cursor < durationSamples) {
    filled.push({
      fromSample: cursor,
      toSample: durationSamples,
      shot: shotAt(cursor),
    });
  }

  return filled;
}

function enforceMinShot(
  plan: PlanSpan[],
  minShotSamples: number,
  durationSamples: number
): PlanSpan[] {
  if (plan.length === 0) {
    return plan;
  }
  if (durationSamples < minShotSamples) {
    return [{ fromSample: 0, toSample: durationSamples, shot: plan[0].shot }];
  }

  let result = [...plan];

  let changed = true;
  while (changed) {
    changed = false;
    const next: PlanSpan[] = [];
    for (let i = 0; i < result.length; i++) {
      const span = result[i];
      const len = span.toSample - span.fromSample;

      if (span.locked || len >= minShotSamples) {
        next.push(span);
        continue;
      }

      changed = true;
      const prev = next.at(-1);
      if (prev) {
        next[next.length - 1] = {
          ...prev,
          toSample: span.toSample,
        };
      } else if (i + 1 < result.length) {
        result[i + 1] = {
          ...result[i + 1],
          fromSample: span.fromSample,
        };
      } else {
        next.push(span);
      }
    }
    result = next.length > 0 ? next : result;
    result = mergeAdjacent(result);
  }

  return result;
}

function snapPlanEdges(
  plan: PlanSpan[],
  silences: Array<{ startSec: number; endSec: number }>,
  snapMs: number
): PlanSpan[] {
  if (silences.length === 0 || plan.length === 0) {
    return plan;
  }

  const maxShiftSec = snapMs / 1000;
  const snapped: PlanSpan[] = [];

  for (let i = 0; i < plan.length; i++) {
    const span = plan[i];
    let fromSample = span.fromSample;
    let toSample = span.toSample;

    if (i > 0) {
      const fromSec = samplesToSec(fromSample);
      const snappedSec = snapBoundary(fromSec, silences, maxShiftSec, "start");
      fromSample = secToSamples(snappedSec);
    }

    if (i < plan.length - 1) {
      const toSec = samplesToSec(toSample);
      const snappedSec = snapBoundary(toSec, silences, maxShiftSec, "end");
      toSample = secToSamples(snappedSec);
    }

    if (fromSample < toSample) {
      snapped.push({ ...span, fromSample, toSample });
    } else {
      snapped.push(span);
    }
  }

  // Fix continuity after snap
  const fixed: PlanSpan[] = [];
  for (let i = 0; i < snapped.length; i++) {
    const span = snapped[i];
    if (i > 0 && span.fromSample !== fixed[i - 1].toSample) {
      fixed[i - 1] = { ...fixed[i - 1], toSample: span.fromSample };
    }
    fixed.push({ ...span });
  }

  return fixed.filter((s) => s.fromSample < s.toSample);
}

function overlayLocked(
  plan: PlanSpan[],
  locked: PlanSpan[],
  minShotSamples: number
): PlanSpan[] {
  if (locked.length === 0) {
    return plan;
  }

  let result = [...plan];

  for (const lock of locked) {
    const next: PlanSpan[] = [];
    for (const span of result) {
      if (
        span.toSample <= lock.fromSample ||
        span.fromSample >= lock.toSample
      ) {
        next.push(span);
        continue;
      }
      if (span.fromSample < lock.fromSample) {
        next.push({ ...span, toSample: lock.fromSample });
      }
      if (span.toSample > lock.toSample) {
        next.push({ ...span, fromSample: lock.toSample });
      }
    }
    next.push({ ...lock, locked: true });
    result = next.sort((a, b) => a.fromSample - b.fromSample);
  }

  result = mergeAdjacent(
    result.filter(
      (s) =>
        !s.locked ||
        locked.some(
          (l) =>
            l === s ||
            (s.fromSample === l.fromSample &&
              s.toSample === l.toSample &&
              s.shot === l.shot)
        )
    )
  );

  // Absorb short remnants adjacent to locked spans
  result = enforceMinShot(result, minShotSamples, result.at(-1)?.toSample ?? 0);

  return result;
}

function ensureFullCoverage(
  plan: PlanSpan[],
  durationSamples: number,
  fallbackShot: string
): PlanSpan[] {
  if (plan.length === 0) {
    return [{ fromSample: 0, toSample: durationSamples, shot: fallbackShot }];
  }

  const sorted = [...plan].sort((a, b) => a.fromSample - b.fromSample);
  const result: PlanSpan[] = [];

  if (sorted[0].fromSample > 0) {
    result.push({
      fromSample: 0,
      toSample: sorted[0].fromSample,
      shot: sorted[0].shot,
    });
  }

  for (const span of sorted) {
    result.push(span);
  }

  const last = result.at(-1);
  if (last && last.toSample < durationSamples) {
    result.push({
      fromSample: last.toSample,
      toSample: durationSamples,
      shot: last.shot,
    });
  }

  // Fix gaps from overlap resolution
  const fixed: PlanSpan[] = [];
  for (let i = 0; i < result.length; i++) {
    const span = result[i];
    if (i > 0) {
      const prev = fixed[i - 1];
      if (span.fromSample > prev.toSample) {
        fixed.push({
          fromSample: prev.toSample,
          toSample: span.fromSample,
          shot: prev.shot,
        });
      } else if (span.fromSample < prev.toSample) {
        prev.toSample = span.fromSample;
        if (prev.fromSample >= prev.toSample) {
          fixed.pop();
        }
      }
    }
    if (span.fromSample < span.toSample) {
      fixed.push({ ...span });
    }
  }

  if (fixed.length > 0 && fixed[0].fromSample > 0) {
    fixed.unshift({
      fromSample: 0,
      toSample: fixed[0].fromSample,
      shot: fixed[0].shot,
    });
  }

  const tail = fixed.at(-1);
  if (tail && tail.toSample < durationSamples) {
    fixed.push({
      fromSample: tail.toSample,
      toSample: durationSamples,
      shot: tail.shot,
    });
  }

  return mergeAdjacent(fixed);
}

// ── validatePlan ──────────────────────────────────────────────────────────────

export function validatePlan(
  raw: unknown,
  opts: {
    cams: PlanCam[];
    durationSamples: number;
    settings?: Partial<CamSwitchSettings>;
    silences?: Array<{ startSec: number; endSec: number }>;
    locked?: PlanSpan[];
    fallback?: PlanSpan[];
  }
): PlanSpan[] {
  const settings = resolveSettings(opts.settings);
  const minShotSamples = msToSamples(settings.minShotMs);
  const validShots = validShotIds(opts.cams);
  const fallbackShot = firstSpeakerCam(opts.cams);

  let plan = parsePlanArray(raw);
  plan = clipAndFilter(plan, validShots, opts.durationSamples);
  plan = resolveOverlaps(plan);
  plan = fillGaps(plan, opts.durationSamples, opts.fallback, validShots);
  plan = mergeAdjacent(plan);
  plan = enforceMinShot(plan, minShotSamples, opts.durationSamples);

  if (opts.silences && opts.silences.length > 0) {
    plan = snapPlanEdges(plan, opts.silences, settings.snapMs);
    plan = mergeAdjacent(plan);
    plan = fillGaps(plan, opts.durationSamples, opts.fallback, validShots);
    plan = enforceMinShot(plan, minShotSamples, opts.durationSamples);
  }

  if (opts.locked && opts.locked.length > 0) {
    plan = overlayLocked(plan, opts.locked, minShotSamples);
  }

  plan = ensureFullCoverage(plan, opts.durationSamples, fallbackShot);
  plan = enforceMinShot(plan, minShotSamples, opts.durationSamples);
  plan = mergeAdjacent(plan);

  return plan;
}

// ── applyOverrides ────────────────────────────────────────────────────────────

export function applyOverrides(
  plan: PlanSpan[],
  overrides: PlanSpan[]
): PlanSpan[] {
  const durationSamples = plan.at(-1)?.toSample ?? 0;
  const cams: PlanCam[] = [];
  const seen = new Set<string>();
  for (const span of plan) {
    if (!seen.has(span.shot)) {
      seen.add(span.shot);
      cams.push({
        id: span.shot,
        role: span.shot === "wide" ? "wide" : "speaker",
      });
    }
  }
  for (const o of overrides) {
    if (!seen.has(o.shot)) {
      seen.add(o.shot);
      cams.push({
        id: o.shot,
        role: o.shot === "wide" ? "wide" : "speaker",
      });
    }
  }

  // Previously locked spans survive later override rounds: carry them into
  // the lock set unless a new override claims their time range.
  const inherited = plan.filter(
    (s) =>
      s.locked &&
      !overrides.some(
        (o) => o.fromSample < s.toSample && o.toSample > s.fromSample
      )
  );
  const locked = [
    ...inherited,
    ...overrides.map((o) => ({ ...o, locked: true as const })),
  ];

  return validatePlan(plan, {
    cams,
    durationSamples,
    locked,
    fallback: plan,
  });
}
