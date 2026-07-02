// B-roll audio modes: how a placed b-roll clip's soundtrack mixes with the
// talking-head voice at export. Preview audio stays voice-only for now.

import type { BrollAudioMode } from "./edl.ts";
import { SAMPLE_RATE, sec } from "./edl.ts";

export const BROLL_AUDIO_MODE_IDS = [
  "silent",
  "broll",
  "mix",
  "duck-voice",
  "duck-broll",
] as const satisfies readonly BrollAudioMode[];

const DUCK_THRESHOLD = "0.02";
const DUCK_RATIO = 8;
const DUCK_ATTACK_MS = 25;
const DUCK_RELEASE_MS = 250;

export function normalizeBrollAudioMode(
  value: BrollAudioMode | undefined
): BrollAudioMode {
  return value ?? "silent";
}

export interface BrollAudioPlanSlice {
  audioMode: BrollAudioMode;
  inputIndex: number;
  outEnd: number;
  outStart: number;
  srcInSec: number;
}

export interface BrollAudioFilterGraph {
  duckBroll: boolean;
  duckVoice: boolean;
  filterParts: string[];
  mixInputLabels: string[];
  replaceWindows: Array<{ outEnd: number; outStart: number }>;
}

export function buildBrollAudioChain(input: {
  inputIndex: number;
  label: string;
  outEnd: number;
  outStart: number;
  srcInSec: number;
}): string {
  const dur = input.outEnd - input.outStart;
  const delayMs = Math.max(0, Math.round(input.outStart * 1000));
  const chain = [
    `aresample=${SAMPLE_RATE}`,
    `atrim=start=${sec(input.srcInSec)}:duration=${sec(dur)}`,
    "asetpts=PTS-STARTPTS",
    `adelay=${delayMs}:all=1`,
  ];
  return `[${input.inputIndex}:a]${chain.join(",")}[${input.label}]`;
}

export function buildBrollAudioFilterGraph(
  slices: BrollAudioPlanSlice[]
): BrollAudioFilterGraph {
  const filterParts: string[] = [];
  const mixInputLabels: string[] = [];
  const replaceWindows: Array<{ outEnd: number; outStart: number }> = [];
  let duckVoice = false;
  let duckBroll = false;

  for (const slice of slices) {
    const mode = normalizeBrollAudioMode(slice.audioMode);
    if (mode === "silent") {
      continue;
    }
    const label = `ba${slice.inputIndex}`;
    filterParts.push(
      buildBrollAudioChain({
        inputIndex: slice.inputIndex,
        label,
        outEnd: slice.outEnd,
        outStart: slice.outStart,
        srcInSec: slice.srcInSec,
      })
    );
    mixInputLabels.push(label);
    if (mode === "broll") {
      replaceWindows.push({
        outStart: slice.outStart,
        outEnd: slice.outEnd,
      });
    }
    if (mode === "duck-voice") {
      duckVoice = true;
    }
    if (mode === "duck-broll") {
      duckBroll = true;
    }
  }

  return {
    duckBroll,
    duckVoice,
    filterParts,
    mixInputLabels,
    replaceWindows,
  };
}

/** Mix b-roll audio into the voice label; returns filter lines and the output label. */
export function buildBrollAudioMixParts(
  voiceLabel: string,
  graph: BrollAudioFilterGraph,
  outLabel = "abmix"
): string[] {
  if (graph.mixInputLabels.length === 0) {
    return [];
  }

  const parts: string[] = [];
  let voiceForMix = voiceLabel;

  for (const [i, win] of graph.replaceWindows.entries()) {
    const mutedLabel = `avmuted${i}`;
    parts.push(
      `[${voiceForMix}]volume=volume=0:enable='between(t,${sec(win.outStart)},${sec(win.outEnd)})'[${mutedLabel}]`
    );
    voiceForMix = mutedLabel;
  }

  const brollLabel = graph.mixInputLabels[0];
  const brollMixLabel =
    graph.mixInputLabels.length === 1
      ? brollLabel
      : (() => {
          parts.push(
            `${graph.mixInputLabels.map((l) => `[${l}]`).join("")}amix=inputs=${graph.mixInputLabels.length}:duration=first:normalize=0[bamix]`
          );
          return "bamix";
        })();

  if (graph.duckBroll) {
    parts.push(`[${voiceForMix}]asplit=2[avmain][avsc]`);
    parts.push(
      `[${brollMixLabel}][avsc]sidechaincompress=threshold=${DUCK_THRESHOLD}:ratio=${DUCK_RATIO}:attack=${DUCK_ATTACK_MS}:release=${DUCK_RELEASE_MS}:makeup=1[baduck]`
    );
    parts.push(
      `[avmain][baduck]amix=inputs=2:duration=first:normalize=0[${outLabel}]`
    );
    return parts;
  }

  if (graph.duckVoice) {
    parts.push(`[${brollMixLabel}]asplit=2[bmain][bsc]`);
    parts.push(
      `[${voiceForMix}][bsc]sidechaincompress=threshold=${DUCK_THRESHOLD}:ratio=${DUCK_RATIO}:attack=${DUCK_ATTACK_MS}:release=${DUCK_RELEASE_MS}:makeup=1[vduck]`
    );
    parts.push(
      `[bmain][vduck]amix=inputs=2:duration=first:normalize=0[${outLabel}]`
    );
    return parts;
  }

  parts.push(
    `[${voiceForMix}][${brollMixLabel}]amix=inputs=2:duration=first:normalize=0[${outLabel}]`
  );
  return parts;
}

export function hasBrollAudio(graph: BrollAudioFilterGraph): boolean {
  return graph.mixInputLabels.length > 0;
}
