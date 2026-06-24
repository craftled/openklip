import { z } from "zod";

// Canonical time base: integer audio samples at 48 kHz. Preview and export both
// derive seconds from this one grid via samplesToSec() so they cannot drift.
export const SAMPLE_RATE = 48000;

export const WordSchema = z.object({
  id: z.string(),
  text: z.string(),
  startSample: z.number().int().nonnegative(),
  endSample: z.number().int().nonnegative(),
  deleted: z.boolean().default(false),
});
export type Word = z.infer<typeof WordSchema>;

export const ProjectSchema = z.object({
  version: z.literal(1),
  slug: z.string(),
  source: z.string(),
  proxy: z.string(),
  sampleRate: z.number().int().positive(),
  fps: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSamples: z.number().int().nonnegative(),
  padMs: z.number().nonnegative().default(50),
  captions: z
    .object({
      enabled: z.boolean().default(true),
      maxWords: z.number().int().positive().default(6),
    })
    .default({ enabled: true, maxWords: 6 }),
  words: z.array(WordSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export interface Range {
  startSec: number;
  endSec: number;
}

export function samplesToSec(samples: number): number {
  return Math.round(samples) / SAMPLE_RATE;
}

// Group maximal runs of kept words into ranges, apply symmetric pad, clamp, merge overlaps.
export function survivingRanges(project: Project): Range[] {
  const pad = (project.padMs ?? 50) / 1000;
  const durSec = project.durationSamples / project.sampleRate;
  const raw: Array<{ start: number; end: number }> = [];
  let cur: { start: number; end: number } | null = null;
  for (const w of project.words) {
    if (w.deleted) {
      if (cur) {
        raw.push(cur);
        cur = null;
      }
      continue;
    }
    const s = samplesToSec(w.startSample);
    const e = samplesToSec(w.endSample);
    if (!cur) cur = { start: s, end: e };
    else cur.end = Math.max(cur.end, e);
  }
  if (cur) raw.push(cur);

  const padded: Range[] = raw.map((r) => ({
    startSec: Math.max(0, r.start - pad),
    endSec: Math.min(durSec || r.end + pad, r.end + pad),
  }));

  const merged: Range[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.startSec <= last.endSec) last.endSec = Math.max(last.endSec, r.endSec);
    else merged.push({ ...r });
  }
  return merged.filter((r) => r.endSec - r.startSec > 0.01);
}

export function totalDurationSec(ranges: Range[]): number {
  return ranges.reduce((a, r) => a + (r.endSec - r.startSec), 0);
}

export function sec(n: number): string {
  return n.toFixed(6);
}
