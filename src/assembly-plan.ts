// Multi-take assembly planner (Feature 3). The single place that converts
// source-take samples ↔ assembled-output samples. Pure, integer-only, no file IO
// and no ffmpeg: it takes an agent-supplied selection plus the ingested takes and
// returns the laid-out word list, the total output duration, and the per-segment
// provenance the ffmpeg shell (src/assembly.ts) and project.json both consume.
//
// The discipline mirrors OpenKlip's existing survivingRanges/sourceToOutputSec
// math (integer audio samples at SAMPLE_RATE, never float seconds at the seam),
// so preview, export, and provenance cannot drift. The seam `padMs` reuses the
// same boundary-pad idiom the cut path already uses, clamped so a pad can never
// read past a take's own footage.
import {
  type AssemblySelection,
  SAMPLE_RATE,
  type Take,
  type Word,
} from "./edl.ts";

// One assembled segment, resolved to both source-take samples and output samples.
export interface PlannedSegment {
  endWordId: string;
  note?: string;
  outEndSample: number;
  /** Output span on the assembled timeline (laid end-to-end). */
  outStartSample: number;
  srcEndSample: number;
  /** Source span in the take's own sample grid (after pad + clamp). */
  srcStartSample: number;
  startWordId: string;
  takeId: string;
}

export interface AssemblyPlan {
  /** Total assembled output duration in samples. */
  durationSamples: number;
  /** Per-segment provenance, in selection order. */
  segments: PlannedSegment[];
  /** The merged transcript, re-id'd w0.. and re-timed onto the output grid. */
  words: Word[];
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// Lay an agent-supplied selection end-to-end into a single new artifact. The
// source takes are never mutated; this only computes where each chosen run lands
// on the output timeline. Integer samples throughout. Throws on an unknown take,
// a word id absent from its take, or a start word that sits after the end word.
export function planAssembly(
  selection: AssemblySelection,
  takes: Map<string, Take>
): AssemblyPlan {
  const padSamples = Math.round((selection.padMs / 1000) * SAMPLE_RATE);

  const segments: PlannedSegment[] = [];
  const words: Word[] = [];
  let cursor = 0; // running output cursor, in samples
  let globalIndex = 0; // running word index for re-id

  for (const seg of selection.segments) {
    const take = takes.get(seg.takeId);
    if (!take) {
      throw new Error(`unknown take "${seg.takeId}"`);
    }

    const startIdx = take.words.findIndex((w) => w.id === seg.startWordId);
    if (startIdx === -1) {
      throw new Error(
        `word "${seg.startWordId}" not found in take "${seg.takeId}"`
      );
    }
    const endIdx = take.words.findIndex((w) => w.id === seg.endWordId);
    if (endIdx === -1) {
      throw new Error(
        `word "${seg.endWordId}" not found in take "${seg.takeId}"`
      );
    }
    if (startIdx > endIdx) {
      throw new Error(
        `segment start "${seg.startWordId}" is after end "${seg.endWordId}" in take "${seg.takeId}"`
      );
    }

    const startWord = take.words[startIdx];
    const endWord = take.words[endIdx];

    // pad → clamp to [0, durationSamples] (the take's own footage bounds).
    const srcStartSample = clamp(
      startWord.startSample - padSamples,
      0,
      take.durationSamples
    );
    const srcEndSample = clamp(
      endWord.endSample + padSamples,
      0,
      take.durationSamples
    );
    const segDuration = srcEndSample - srcStartSample;

    const outStartSample = cursor;
    const outEndSample = cursor + segDuration;

    // Re-time + re-id every word in the run onto the output grid, clamping each
    // word's span into [outStartSample, outEndSample] so a padded boundary word
    // can never poke past its segment's slot at the seam.
    for (let i = startIdx; i <= endIdx; i++) {
      const w = take.words[i];
      const start = clamp(
        outStartSample + (w.startSample - srcStartSample),
        outStartSample,
        outEndSample
      );
      const end = clamp(
        outStartSample + (w.endSample - srcStartSample),
        outStartSample,
        outEndSample
      );
      words.push({
        id: `w${globalIndex}`,
        text: w.text,
        startSample: start,
        endSample: end,
        deleted: false,
        ...(w.note === undefined ? {} : { note: w.note }),
      });
      globalIndex++;
    }

    segments.push({
      takeId: seg.takeId,
      startWordId: seg.startWordId,
      endWordId: seg.endWordId,
      srcStartSample,
      srcEndSample,
      outStartSample,
      outEndSample,
      ...(seg.note === undefined ? {} : { note: seg.note }),
    });

    cursor = outEndSample;
  }

  return { segments, words, durationSamples: cursor };
}
